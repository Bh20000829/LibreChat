jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock(
  'librechat-data-provider',
  () => ({
    CacheKeys: {
      CONFIG_STORE: 'CONFIG_STORE',
      MODELS_CONFIG: 'MODELS_CONFIG',
    },
  }),
  { virtual: true },
);

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({
    get: mockCacheGet,
    set: mockCacheSet,
  })),
}));

jest.mock('~/server/services/Config', () => ({
  loadDefaultModels: jest.fn(),
  loadConfigModels: jest.fn(),
}));

const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');
const { loadModels, filterEmptyImageProviders } = require('./ModelController');

describe('ModelController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  test('filters out providers with empty model arrays in image mode', async () => {
    loadDefaultModels.mockResolvedValue({
      openAI: ['gpt-image-1'],
      google: ['gemini-2.5-flash-image'],
      anthropic: [],
      bedrock: [],
    });
    loadConfigModels.mockResolvedValue({
      CustomA: [],
      CustomB: ['custom-image-model'],
    });

    const result = await loadModels({ user: { id: 'user-1' }, query: { mode: 'image' } });

    expect(result).toEqual({
      openAI: ['gpt-image-1'],
      google: ['gemini-2.5-flash-image'],
      CustomB: ['custom-image-model'],
    });
  });

  test('preserves providers in chat mode even when some model arrays are empty', () => {
    expect(
      filterEmptyImageProviders(
        {
          openAI: ['gpt-5.5'],
          anthropic: [],
        },
        'chat',
      ),
    ).toEqual({
      openAI: ['gpt-5.5'],
      anthropic: [],
    });
  });
});
