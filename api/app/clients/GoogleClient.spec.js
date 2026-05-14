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
const { logger } = require('@librechat/data-schemas');
const { googleGenConfigSchema } = require('librechat-data-provider');
const GoogleClient = require('./GoogleClient');

describe('GoogleClient.generateImage', () => {
  test('sends imageConfig when a Google image aspect ratio is provided', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ candidates: [] }),
    });
    const client = new GoogleClient({}, { skipSetOptions: true });

    client.fetch = fetch;
    client.apiKey = 'test-google-key';
    client.authHeader = false;
    client.modelOptions = {
      model: 'gemini-3-pro-image-preview',
      temperature: 0.4,
    };
    client.systemMessage = '';

    await client.generateImage({
      prompt: '小猪吃饭',
      model: 'gemini-3-pro-image-preview',
      size: '16:9',
    });

    expect(googleGenConfigSchema.parse).toHaveBeenCalledWith(client.modelOptions);
    expect(fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent',
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
    expect(requestOptions.generationConfig).toEqual(
      expect.objectContaining({
        candidateCount: 1,
        responseModalities: ['Image'],
        temperature: 0.4,
        imageConfig: {
          aspectRatio: '16:9',
        },
      }),
    );
    expect(requestOptions.config).toBeUndefined();
    expect(requestOptions.contents[0].parts).toEqual([{ text: '小猪吃饭' }]);
    expect(getSafetySettings).not.toHaveBeenCalled();
  });

  test('retries without imageConfig when the upstream rejects it', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: jest.fn().mockResolvedValue('Unknown name "imageConfig" at "generation_config"'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ candidates: [] }),
      });
    const client = new GoogleClient({}, { skipSetOptions: true });

    client.fetch = fetch;
    client.reverseProxyUrl = 'https://api.openai-proxy.org/google';
    client.apiKey = 'test-google-key';
    client.authHeader = false;
    client.modelOptions = {
      model: 'gemini-3-pro-image-preview',
      temperature: 0.4,
    };
    client.systemMessage = '';

    await client.generateImage({
      prompt: '小猪吃饭',
      model: 'gemini-3-pro-image-preview',
      size: '16:9',
    });

    expect(fetch).toHaveBeenCalledTimes(2);

    const firstRequestOptions = JSON.parse(fetch.mock.calls[0][1].body);
    expect(firstRequestOptions.generationConfig.imageConfig).toEqual({
      aspectRatio: '16:9',
    });

    const secondRequestOptions = JSON.parse(fetch.mock.calls[1][1].body);
    expect(secondRequestOptions.generationConfig.imageConfig).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      '[GoogleClient] Retrying image generation without imageConfig',
      expect.objectContaining({
        model: 'gemini-3-pro-image-preview',
        size: '16:9',
        reverseProxyUrl: 'https://api.openai-proxy.org/google',
      }),
    );
  });
});
