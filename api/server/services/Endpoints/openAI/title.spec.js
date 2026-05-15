jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => true),
}));

jest.mock(
  'librechat-data-provider',
  () => ({
    EModelEndpoint: {
      openAI: 'openAI',
    },
    CacheKeys: {
      GEN_TITLE: 'GEN_TITLE',
    },
    Constants: {
      CURRENT_MODEL: 'current_model',
    },
  }),
  { virtual: true },
);

const mockCacheSet = jest.fn();

jest.mock('~/cache/getLogStores', () => jest.fn(() => ({ set: mockCacheSet })));
jest.mock('./initialize', () => jest.fn());
jest.mock('~/models', () => ({
  saveConvo: jest.fn(),
}));
jest.mock('~/app/clients/prompts', () => ({
  truncateText: (text) => text,
}));

const addTitle = require('./title');
const initializeClient = require('./initialize');
const { saveConvo } = require('~/models');

describe('openAI/addTitle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENAI_IMAGE_TITLE_MODEL_MAP;
  });

  test('uses first chat model from matching spec group in image mode', async () => {
    initializeClient.mockResolvedValue({
      client: {
        chatCompletion: jest.fn().mockResolvedValue('Blue Future Car'),
      },
    });

    const req = {
      user: { id: 'user-1' },
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
                model: 'gpt-image-1',
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
            {
              name: 'openai-chat-alt',
              group: 'openai-alt',
              preset: {
                endpoint: 'openAI',
                mode: 'chat',
                model: 'gpt-4.1-mini',
              },
            },
          ],
        },
      },
      body: {
        mode: 'image',
        spec: 'openai-image-main',
      },
    };

    const response = {
      conversationId: 'convo-1',
      text: '',
    };

    const client = {
      options: {
        spec: 'openai-image-main',
        modelOptions: { model: 'gpt-image-1', mode: 'image' },
      },
    };

    await addTitle(req, { text: '生成一张未来城市图', response, client });

    expect(initializeClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointOption: expect.objectContaining({
          model_parameters: expect.objectContaining({
            model: 'gpt-4o-mini',
          }),
        }),
        overrideModel: 'gpt-4o-mini',
      }),
    );

    expect(saveConvo).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        conversationId: 'convo-1',
        title: 'Blue Future Car',
      }),
      expect.any(Object),
    );
  });

  test('uses fixed title model mapping by image type in image mode', async () => {
    process.env.OPENAI_IMAGE_TITLE_MODEL_MAP = JSON.stringify({
      'openai-main': 'gpt-4.1-mini',
      default: 'gpt-4o-mini',
    });

    initializeClient.mockResolvedValue({
      client: {
        chatCompletion: jest.fn().mockResolvedValue('Blue Future Car'),
      },
    });

    const req = {
      user: { id: 'user-1' },
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
                model: 'gpt-image-1',
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
      body: {
        mode: 'image',
        spec: 'openai-image-main',
      },
    };

    const response = {
      conversationId: 'convo-2',
      text: '',
    };

    const client = {
      options: {
        spec: 'openai-image-main',
        modelOptions: { model: 'gpt-image-1', mode: 'image' },
      },
    };

    await addTitle(req, { text: '生成一张未来城市图', response, client });

    expect(initializeClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointOption: expect.objectContaining({
          model_parameters: expect.objectContaining({
            model: 'gpt-4.1-mini',
          }),
        }),
        overrideModel: 'gpt-4.1-mini',
      }),
    );
  });
});
