jest.mock('~/models/ModelPricing', () => ({
  findOne: jest.fn(),
}));

jest.mock('~/models/ImageModelPricing', () => ({
  findOne: jest.fn(),
}));

jest.mock('./tx', () => ({
  getMultiplier: jest.fn(() => 0),
  getCacheMultiplier: jest.fn(() => 0),
}));

const ImageModelPricing = require('~/models/ImageModelPricing');
const { calculateImageUsageCostCny } = require('./pricingUtils');

const originalEnv = process.env;

const createLeanQuery = (value) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(value),
  }),
});

describe('calculateImageUsageCostCny', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses the image model request price from management when request billing is enabled', async () => {
    process.env.IMAGE_BILLING_MODE = 'request';
    ImageModelPricing.findOne.mockReturnValue(
      createLeanQuery({
        requestPrice: 1.25,
        multiplier: 1,
      }),
    );

    await expect(
      calculateImageUsageCostCny({
        model: 'doubao-seedream-5-0-260128',
        endpoint: 'doubao',
        generatedCount: 4,
      }),
    ).resolves.toBe(1.25);
  });

  it('uses image token prices from management when token billing is enabled', async () => {
    process.env.IMAGE_BILLING_MODE = 'token';
    process.env.USD_TO_CNY_RATE = '7';
    ImageModelPricing.findOne.mockReturnValue(
      createLeanQuery({
        textInputPrice: 10,
        cachePrice: 1,
        textOutputPrice: 20,
        imageInputPrice: 30,
        imageOutputPrice: 40,
        requestPrice: 2.75,
        multiplier: 1,
      }),
    );

    await expect(
      calculateImageUsageCostCny({
        usage: {
          input_tokens: 1000,
          output_tokens: 2000,
          cached_content_tokens: 100,
          input_token_modality_details: { image: 300 },
          output_token_modality_details: { image: 500 },
        },
        model: 'gemini-3-pro-image-preview',
        endpoint: 'google',
        generatedCount: 3,
      }),
    ).resolves.toBe(0.4627);

    expect(ImageModelPricing.findOne).toHaveBeenCalledWith({
      modelName: 'gemini-3-pro-image-preview',
    });
  });

  it('returns zero when an image model price is not configured', async () => {
    process.env.IMAGE_BILLING_MODE = 'request';
    ImageModelPricing.findOne.mockReturnValue(createLeanQuery(null));

    await expect(
      calculateImageUsageCostCny({
        usage: {
          input_tokens: 1000,
          output_tokens: 2000,
        },
        model: 'gpt-image-1',
        endpoint: 'openAI',
        generatedCount: 1,
      }),
    ).resolves.toBe(0);
  });
});
