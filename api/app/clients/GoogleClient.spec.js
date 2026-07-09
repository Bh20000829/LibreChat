jest.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: jest.fn(),
    },
  },
}));

jest.mock('@librechat/agents', () => ({
  sleep: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  getModelMaxTokens: jest.fn(),
  Tokenizer: jest.fn(),
  getSafetySettings: jest.fn(() => []),
}));

jest.mock('@langchain/core/utils/stream', () => ({
  concat: jest.fn(),
}));

jest.mock('@langchain/google-vertexai', () => ({
  ChatVertexAI: jest.fn(),
}));

jest.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: jest.fn(),
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(),
}));

jest.mock('@langchain/core/messages', () => ({
  HumanMessage: class HumanMessage {},
  SystemMessage: class SystemMessage {},
}));

jest.mock(
  'librechat-data-provider',
  () => ({
    googleGenConfigSchema: {
      parse: jest.fn((value) => value ?? {}),
    },
    validateVisionModel: jest.fn(),
    getResponseSender: jest.fn(),
    endpointSettings: {
      google: {},
    },
    parseTextParts: jest.fn(),
    EModelEndpoint: {
      google: 'google',
    },
    googleSettings: {},
    ContentTypes: {},
    VisionModes: {
      generative: 'generative',
    },
    ErrorTypes: {},
    Constants: {},
    AuthKeys: {
      GOOGLE_SERVICE_KEY: 'GOOGLE_SERVICE_KEY',
      GOOGLE_API_KEY: 'GOOGLE_API_KEY',
    },
  }),
  { virtual: true },
);

jest.mock('~/server/services/Files/images', () => ({
  encodeAndFormat: jest.fn(),
}));

jest.mock('~/models/spendTokens', () => ({
  spendTokens: jest.fn(),
}));

jest.mock('./prompts', () => ({
  formatMessage: jest.fn(),
  createContextHandlers: jest.fn(),
  titleInstruction: '',
  truncateText: jest.fn(),
}));

jest.mock('./BaseClient', () => {
  return class BaseClient {
    constructor(authType, options = {}) {
      this.authType = authType;
      this.options = options;
      this.modelOptions = options.modelOptions || {};
    }

    setOptions(options = {}) {
      this.options = options;
      this.modelOptions = options.modelOptions || {};
    }
  };
});

const { getSafetySettings } = require('@librechat/api');
const { googleGenConfigSchema } = require('librechat-data-provider');
const GoogleClient = require('./GoogleClient');

describe('GoogleClient.generateImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sends generateContent image request with responseFormat image options', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(JSON.stringify({ candidates: [] })),
    });
    const client = new GoogleClient({}, { skipSetOptions: true });

    client.fetch = fetch;
    client.reverseProxyUrl = 'https://api.duckcoding.ai';
    client.apiKey = 'test-google-key';
    client.authHeader = false;
    client.modelOptions = {
      model: 'gemini-3-pro-image',
      temperature: 0.4,
    };
    client.systemMessage = '';

    const result = await client.generateImage({
      prompt: 'dog barking',
      model: 'gemini-3-pro-image',
      size: '1:1',
    });

    expect(result).toEqual({ candidates: [] });
    expect(googleGenConfigSchema.parse).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.duckcoding.ai/v1/models/gemini-3-pro-image:generateContent',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );

    const [, init] = fetch.mock.calls[0];
    expect(init.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-goog-api-key': 'test-google-key',
      }),
    );

    const requestOptions = JSON.parse(init.body);
    expect(requestOptions).toEqual({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'dog barking' }],
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        responseFormat: {
          image: {
            aspectRatio: '1:1',
            imageSize: '2K',
          },
        },
      },
    });
    expect(requestOptions.tools).toBeUndefined();
    expect(requestOptions.response_format).toBeUndefined();
    expect(requestOptions.generationConfig.imageConfig).toBeUndefined();
    expect(getSafetySettings).not.toHaveBeenCalled();
  });

  test('normalizes pixel size values to generateContent responseFormat aspect ratio', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(JSON.stringify({ candidates: [] })),
    });
    const client = new GoogleClient({}, { skipSetOptions: true });

    client.fetch = fetch;
    client.reverseProxyUrl = 'https://api.openai-proxy.org/google/v1beta';
    client.apiKey = 'test-google-key';
    client.authHeader = false;
    client.modelOptions = {
      model: 'gemini-3.1-flash-image',
      temperature: 0.4,
    };
    client.systemMessage = '';

    await client.generateImage({
      prompt: 'dog barking',
      model: 'gemini-3.1-flash-image',
      size: '1536x1024',
      imageSize: '4K',
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      'https://api.openai-proxy.org/google/v1beta/models/gemini-3.1-flash-image:generateContent',
    );

    const requestOptions = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestOptions.generationConfig.responseFormat.image).toEqual({
      aspectRatio: '3:2',
      imageSize: '4K',
    });
    expect(requestOptions.generationConfig.imageConfig).toBeUndefined();
    expect(requestOptions.response_format).toBeUndefined();
  });

  test('sends REST inline image data for image-to-image requests', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(JSON.stringify({ candidates: [] })),
    });
    const client = new GoogleClient({}, { skipSetOptions: true });

    client.fetch = fetch;
    client.reverseProxyUrl = 'https://api.duckcoding.ai';
    client.apiKey = 'test-google-key';
    client.authHeader = false;
    client.modelOptions = {
      model: 'gemini-3-pro-image-preview',
    };
    client.systemMessage = '';

    await client.generateImage({
      prompt: 'make it warmer',
      model: 'gemini-3-pro-image-preview',
      size: '16:9',
      imageFiles: [
        {
          type: 'image/png',
          buffer: Buffer.from('image-bytes'),
        },
      ],
    });

    const requestOptions = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestOptions.contents[0].parts).toEqual([
      { text: 'make it warmer' },
      {
        inline_data: {
          mime_type: 'image/png',
          data: Buffer.from('image-bytes').toString('base64'),
        },
      },
    ]);
    expect(requestOptions.contents[0].parts[1].inlineData).toBeUndefined();
  });

  test('sends multiple REST inline images for image-to-image requests', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(JSON.stringify({ candidates: [] })),
    });
    const client = new GoogleClient({}, { skipSetOptions: true });

    client.fetch = fetch;
    client.reverseProxyUrl = 'https://api.duckcoding.ai';
    client.apiKey = 'test-google-key';
    client.authHeader = false;
    client.modelOptions = {
      model: 'gemini-3-pro-image-preview',
    };
    client.systemMessage = '';

    await client.generateImage({
      prompt: 'combine these references',
      model: 'gemini-3-pro-image-preview',
      size: '1:1',
      imageFiles: [
        {
          type: 'image/png',
          buffer: Buffer.from('first-image'),
        },
        {
          type: 'image/jpeg',
          buffer: Buffer.from('second-image'),
        },
      ],
    });

    const requestOptions = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestOptions.contents[0].parts).toEqual([
      { text: 'combine these references' },
      {
        inline_data: {
          mime_type: 'image/png',
          data: Buffer.from('first-image').toString('base64'),
        },
      },
      {
        inline_data: {
          mime_type: 'image/jpeg',
          data: Buffer.from('second-image').toString('base64'),
        },
      },
    ]);
  });

  test('omits imageSize for preview models without documented 2K support', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(JSON.stringify({ candidates: [] })),
    });
    const client = new GoogleClient({}, { skipSetOptions: true });

    client.fetch = fetch;
    client.reverseProxyUrl = 'https://api.duckcoding.ai';
    client.apiKey = 'test-google-key';
    client.authHeader = false;
    client.modelOptions = {
      model: 'gemini-3.1-flash-image-preview',
    };
    client.systemMessage = '';

    await client.generateImage({
      prompt: 'dog barking',
      model: 'gemini-3.1-flash-image-preview',
      size: '1:1',
      imageSize: '2K',
    });

    const requestOptions = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestOptions.generationConfig.responseFormat.image).toEqual({
      aspectRatio: '1:1',
    });
  });
});
