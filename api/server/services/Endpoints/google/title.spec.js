jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => true),
}));

jest.mock(
  'librechat-data-provider',
  () => ({
    EModelEndpoint: {
      google: 'google',
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
jest.mock('./initialize', () => jest.fn());
jest.mock('~/models', () => ({
  saveConvo: jest.fn(),
}));

const addTitle = require('./title');
const initializeClient = require('./initialize');
const { saveConvo } = require('~/models');

describe('google/addTitle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.GOOGLE_IMAGE_TITLE_MODEL_MAP;
  });

  test('normalizes verbose Google title output before saving', async () => {
    initializeClient.mockResolvedValue({
      client: {
        chatCompletion: jest.fn().mockResolvedValue(`**Generating Creative Titles**

I'm currently focused on crafting compelling titles.

Steaming Minimalist: A Matte Black Study`),
      },
    });

    const req = {
      user: { id: 'user-1' },
      config: {
        endpoints: {
          google: {},
        },
      },
    };
    const response = {
      conversationId: 'convo-1',
      text: '',
    };
    const client = {
      options: {
        modelOptions: { model: 'gemini-3-pro-image-preview' },
      },
    };

    await addTitle(req, { text: '画一个黑色咖啡杯', response, client });

    expect(saveConvo).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        conversationId: 'convo-1',
        title: 'Generating Creative Titles',
      }),
      expect.any(Object),
    );
  });

  test('uses the default Google title model instead of the current image model', async () => {
    initializeClient.mockResolvedValue({
      client: {
        chatCompletion: jest.fn().mockResolvedValue('Blue Future Car'),
      },
    });

    const req = {
      user: { id: 'user-1' },
      config: {
        endpoints: {
          google: {},
        },
      },
    };
    const response = {
      conversationId: 'convo-2',
      text: '',
    };
    const client = {
      options: {
        modelOptions: { model: 'gemini-2.5-flash-image' },
      },
    };

    await addTitle(req, { text: '画一辆蓝色未来汽车', response, client });

    expect(initializeClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointOption: expect.objectContaining({
          modelOptions: expect.objectContaining({
            model: 'gemini-3.1-pro-preview',
          }),
        }),
      }),
    );
  });

  test('uses the first chat model from the matching spec group in image mode', async () => {
    initializeClient.mockResolvedValue({
      client: {
        chatCompletion: jest.fn().mockResolvedValue('Blue Future Car'),
      },
    });

    const req = {
      user: { id: 'user-1' },
      config: {
        endpoints: {
          google: {},
        },
        modelSpecs: {
          list: [
            {
              name: 'google-image-flash',
              group: 'google-flash',
              preset: {
                endpoint: 'google',
                mode: 'image',
                model: 'gemini-2.5-flash-image-preview',
              },
            },
            {
              name: 'google-chat-flash',
              group: 'google-flash',
              preset: {
                endpoint: 'google',
                mode: 'chat',
                model: 'gemini-2.5-flash',
              },
            },
            {
              name: 'google-chat-pro',
              group: 'google-pro',
              preset: {
                endpoint: 'google',
                mode: 'chat',
                model: 'gemini-3.1-pro-preview',
              },
            },
          ],
        },
      },
      body: {
        mode: 'image',
        spec: 'google-image-flash',
      },
    };
    const response = {
      conversationId: 'convo-2b',
      text: '',
    };
    const client = {
      options: {
        spec: 'google-image-flash',
        modelOptions: { model: 'gemini-2.5-flash-image-preview', mode: 'image' },
      },
    };

    await addTitle(req, { text: '画一辆蓝色未来汽车', response, client });

    expect(initializeClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointOption: expect.objectContaining({
          modelOptions: expect.objectContaining({
            model: 'gemini-2.5-flash',
          }),
        }),
      }),
    );
  });

  test('uses fixed title model mapping by image type in image mode', async () => {
    process.env.GOOGLE_IMAGE_TITLE_MODEL_MAP = JSON.stringify({
      'google-flash': 'gemini-2.5-flash',
      default: 'gemini-2.0-flash',
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
          google: {},
        },
        modelSpecs: {
          list: [
            {
              name: 'google-image-flash',
              group: 'google-flash',
              preset: {
                endpoint: 'google',
                mode: 'image',
                model: 'gemini-2.5-flash-image',
              },
            },
            {
              name: 'google-chat-pro',
              group: 'google-pro',
              preset: {
                endpoint: 'google',
                mode: 'chat',
                model: 'gemini-3.1-pro-preview',
              },
            },
          ],
        },
      },
      body: {
        mode: 'image',
        spec: 'google-image-flash',
      },
    };
    const response = {
      conversationId: 'convo-2c',
      text: '',
    };
    const client = {
      options: {
        spec: 'google-image-flash',
        modelOptions: { model: 'gemini-2.5-flash-image', mode: 'image' },
      },
    };

    await addTitle(req, { text: '画一辆蓝色未来汽车', response, client });

    expect(initializeClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointOption: expect.objectContaining({
          modelOptions: expect.objectContaining({
            model: 'gemini-2.5-flash',
          }),
        }),
      }),
    );
  });

  test('falls back to the original prompt when Google returns an empty title', async () => {
    initializeClient.mockResolvedValue({
      client: {
        chatCompletion: jest.fn().mockResolvedValue(''),
      },
    });

    const req = {
      user: { id: 'user-1' },
      config: {
        endpoints: {
          google: {},
        },
      },
    };
    const response = {
      conversationId: 'convo-3',
      text: '',
    };
    const client = {
      options: {
        modelOptions: { model: 'gemini-3-pro-image-preview' },
      },
    };

    await addTitle(req, { text: '画一只坐在窗边看雨的小黑猫', response, client });

    expect(saveConvo).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        conversationId: 'convo-3',
        title: '画一只坐在窗边看雨的小黑猫',
      }),
      expect.any(Object),
    );
  });

  test('uses explicit chatCompletion for Google title generation', async () => {
    const chatCompletion = jest.fn().mockResolvedValue('Quiet Mountain Lake');
    initializeClient.mockResolvedValue({
      client: {
        chatCompletion,
      },
    });

    const req = {
      user: { id: 'user-1' },
      config: {
        endpoints: {
          google: {},
        },
      },
    };
    const response = {
      conversationId: 'convo-4',
      text: '',
    };
    const client = {
      options: {
        modelOptions: { model: 'gemini-3-pro-image-preview' },
      },
    };

    await addTitle(req, { text: '画一个宁静的山间湖泊', response, client });

    expect(chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: [
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining(
              'Generate a concise conversation title in 3 to 8 words.',
            ),
          }),
        ],
      }),
    );
  });
});
