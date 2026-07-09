jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => true),
}));

jest.mock(
  'librechat-data-provider',
  () => ({
    EModelEndpoint: {
      openAI: 'openAI',
      google: 'google',
      doubao: 'doubao',
    },
    CacheKeys: {
      GEN_TITLE: 'GEN_TITLE',
    },
    Constants: {
      CURRENT_MODEL: 'current_model',
    },
    googleSettings: {
      model: {
        default: 'gemini-3.1-pro-preview',
      },
    },
  }),
  { virtual: true },
);

const mockCacheSet = jest.fn();

jest.mock('~/cache/getLogStores', () => jest.fn(() => ({ set: mockCacheSet })));
jest.mock('~/server/services/Endpoints/openAI/initialize', () => jest.fn());
jest.mock('~/server/services/Endpoints/google/initialize', () => jest.fn());
jest.mock('~/models', () => ({
  saveConvo: jest.fn(),
}));
jest.mock('~/app/clients/prompts', () => ({
  truncateText: (text) => text,
}));

const addImageTitle = require('./title');
const initializeOpenAIClient = require('~/server/services/Endpoints/openAI/initialize');
const initializeGoogleClient = require('~/server/services/Endpoints/google/initialize');
const { saveConvo } = require('~/models');

describe('image/addTitle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.IMAGE_TITLE_ENDPOINT;
    delete process.env.IMAGE_TITLE_MODEL;
    delete process.env.IMAGE_TITLE_USE_IMAGE_MODEL;
    delete process.env.OPENAI_IMAGE_TITLE_MODEL_MAP;
    delete process.env.GOOGLE_IMAGE_TITLE_MODEL_MAP;
    delete process.env.OPENAI_TITLE_MODEL;
    delete process.env.GOOGLE_TITLE_MODEL;
    process.env.OPENAI_API_KEY = 'test-openai-key';
  });

  test('uses the shared image title service for Doubao by falling back to OpenAI', async () => {
    initializeOpenAIClient.mockResolvedValue({
      client: {
        chatCompletion: jest.fn().mockResolvedValue('Doubao Poster'),
      },
    });

    const req = {
      user: { id: 'user-1' },
      body: {
        endpoint: 'doubao',
        mode: 'image',
      },
      config: {
        endpoints: {},
      },
    };
    const response = {
      conversationId: 'convo-doubao',
      endpoint: 'doubao',
      text: '',
    };
    const client = {
      options: {
        modelOptions: { model: 'doubao-seedream-5-0-260128', mode: 'image', size: '2048x2048' },
      },
    };

    await addImageTitle(req, { text: '生成一张海报', response, client, endpoint: 'doubao' });

    expect(initializeOpenAIClient).toHaveBeenCalledWith(
      expect.objectContaining({
        overrideEndpoint: 'openAI',
        overrideModel: 'gpt-4o-mini',
        endpointOption: expect.objectContaining({
          modelOptions: expect.objectContaining({
            model: 'gpt-4o-mini',
          }),
        }),
      }),
    );
    expect(saveConvo).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        conversationId: 'convo-doubao',
        title: 'Doubao Poster',
      }),
      expect.any(Object),
    );
  });

  test('uses a configured shared title endpoint and title model', async () => {
    initializeGoogleClient.mockResolvedValue({
      client: {
        chatCompletion: jest.fn().mockResolvedValue('Quiet Lake'),
      },
    });

    const req = {
      user: { id: 'user-1' },
      body: {
        endpoint: 'doubao',
        mode: 'image',
      },
      config: {
        endpoints: {
          doubao: {
            titleEndpoint: 'google',
            titleModel: 'gemini-2.5-flash',
          },
        },
      },
    };
    const response = {
      conversationId: 'convo-google-title',
      endpoint: 'doubao',
      text: '',
    };
    const client = {
      options: {
        modelOptions: { model: 'doubao-seedream-4-5-251128', mode: 'image' },
      },
    };

    await addImageTitle(req, { text: '画一个湖边小屋', response, client, endpoint: 'doubao' });

    expect(initializeGoogleClient).toHaveBeenCalledWith(
      expect.objectContaining({
        overrideModel: 'gemini-2.5-flash',
        endpointOption: expect.objectContaining({
          modelOptions: expect.objectContaining({
            model: 'gemini-2.5-flash',
          }),
        }),
      }),
    );
    expect(saveConvo).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        conversationId: 'convo-google-title',
        title: 'Quiet Lake',
      }),
      expect.any(Object),
    );
  });

  test('ignores obsolete image title model map configuration', async () => {
    process.env.IMAGE_TITLE_USE_IMAGE_MODEL = 'true';
    process.env.OPENAI_IMAGE_TITLE_MODEL_MAP = JSON.stringify({
      default: 'gpt-should-not-be-used',
    });

    initializeOpenAIClient.mockResolvedValue({
      client: {
        chatCompletion: jest.fn().mockResolvedValue('Blue City'),
      },
    });

    const req = {
      user: { id: 'user-1' },
      body: {
        endpoint: 'openAI',
        mode: 'image',
        spec: 'openai-image-main',
      },
      config: {
        endpoints: {
          openAI: {},
        },
        modelSpecs: {
          list: [
            {
              name: 'openai-image-main',
              group: 'openai-main',
              preset: {
                endpoint: 'openAI',
                mode: 'image',
                model: 'gpt-image-2',
              },
            },
            {
              name: 'openai-chat-main',
              group: 'openai-main',
              preset: {
                endpoint: 'openAI',
                mode: 'chat',
                model: 'gpt-4o-mini',
              },
            },
          ],
        },
      },
    };
    const response = {
      conversationId: 'convo-openai',
      endpoint: 'openAI',
      text: '',
    };
    const client = {
      options: {
        spec: 'openai-image-main',
        modelOptions: { model: 'gpt-image-2', mode: 'image' },
      },
    };

    await addImageTitle(req, { text: '生成一张未来城市图', response, client, endpoint: 'openAI' });

    expect(initializeOpenAIClient).toHaveBeenCalledWith(
      expect.objectContaining({
        overrideModel: 'gpt-4o-mini',
      }),
    );
  });
});
