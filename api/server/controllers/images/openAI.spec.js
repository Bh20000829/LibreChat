jest.mock(
  '@librechat/api',
  () => ({
    sendEvent: jest.fn(),
    getBalanceConfig: jest.fn(() => ({ enabled: false })),
  }),
  { virtual: true },
);

jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    createModels: jest.fn(() => ({})),
  }),
  { virtual: true },
);

jest.mock(
  'librechat-data-provider',
  () => ({
    Constants: {
      NO_PARENT: '00000000-0000-0000-0000-000000000000',
      NEW_CONVO: 'new',
      COMMON_DIVIDER: '::',
    },
    ContentTypes: {
      TEXT: 'text',
      IMAGE_FILE: 'image_file',
      ERROR: 'error',
    },
    EModelEndpoint: {
      openAI: 'openAI',
      google: 'google',
    },
    FileContext: {
      image_generation: 'image_generation',
    },
    getResponseSender: jest.fn(() => 'GPT'),
  }),
  { virtual: true },
);

jest.mock('sharp', () =>
  jest.fn(() => ({
    metadata: jest.fn().mockResolvedValue({ width: 1024, height: 1024 }),
  })),
);

jest.mock('~/models', () => ({
  saveMessage: jest.fn(),
  saveConvo: jest.fn(),
  getFiles: jest.fn(),
}));

const mockImageGenerationFindOne = jest.fn();

jest.mock('~/models/ImageGenerationStore', () => ({
  saveImageGeneration: jest.fn(),
  saveImageGenerationUsage: jest.fn(),
  ImageGeneration: {
    findOne: mockImageGenerationFindOne,
  },
}));

jest.mock('~/models/balanceMethods', () => ({
  checkBalance: jest.fn(),
}));

jest.mock('~/models/pricingUtils', () => ({
  calculateUsageCostCny: jest.fn(() => Promise.resolve(0)),
  calculateImageUsageCostCny: jest.fn(() => Promise.resolve(0)),
}));

jest.mock('~/models/quotaUsage', () => ({
  incrementQuotaUsage: jest.fn(),
}));

jest.mock('~/server/utils/countTokens', () => jest.fn(() => Promise.resolve(0)));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(() => Promise.resolve({})),
}));

jest.mock('~/server/services/Endpoints/openAI', () => ({
  initializeClient: jest.fn(),
}));

jest.mock('~/server/services/Endpoints/google', () => ({
  initializeClient: jest.fn(),
}));

jest.mock('~/server/services/Endpoints/openAI/title', () => jest.fn(() => Promise.resolve()));
jest.mock('~/server/services/Endpoints/google/title', () => jest.fn(() => Promise.resolve()));

jest.mock('~/server/services/Files/process', () => ({
  uploadImageBuffer: jest.fn(),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

const generateOpenAIImage = require('./openAI');
const { Readable } = require('stream');
const { saveMessage, saveConvo, getFiles } = require('~/models');
const { saveImageGeneration, saveImageGenerationUsage } = require('~/models/ImageGenerationStore');
const { initializeClient } = require('~/server/services/Endpoints/openAI');
const { initializeClient: initializeGoogleClient } = require('~/server/services/Endpoints/google');
const addGoogleTitle = require('~/server/services/Endpoints/google/title');
const { uploadImageBuffer } = require('~/server/services/Files/process');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { Constants } = require('librechat-data-provider');

function mockLatestImageGeneration(record) {
  mockImageGenerationFindOne.mockReturnValue({
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(record),
    }),
  });
}

describe('generateOpenAIImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLatestImageGeneration(null);
  });

  it('routes google image titles through the google title service for new conversations', async () => {
    initializeGoogleClient.mockResolvedValue({
      client: {
        generateImage: jest.fn().mockResolvedValue({
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 25,
            totalTokenCount: 40,
          },
          candidates: [
            {
              content: {
                parts: [
                  {
                    inline_data: {
                      mime_type: 'image/png',
                      data: Buffer.from('google-image').toString('base64'),
                    },
                  },
                ],
              },
            },
          ],
        }),
        titleConvo: jest.fn().mockResolvedValue('client-title-should-not-be-used'),
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '33333333-3333-3333-3333-333333333333',
      title: 'New Chat',
    });
    saveMessage.mockResolvedValue({});
    uploadImageBuffer.mockResolvedValue({
      file_id: 'file-google-title-1',
      filepath: '/images/user/file-google-title-1.png',
      filename: 'file-google-title-1.png',
      width: 1024,
      height: 1024,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-google-title-1' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-google-title-1' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: '生成一张老人钓鱼的图',
        model: 'gemini-3-pro-image-preview',
        endpoint: 'google',
        endpointType: 'google',
        conversationId: Constants.NEW_CONVO,
        parentMessageId: Constants.NO_PARENT,
        imageSize: '16:9',
        endpointOption: {
          model_parameters: {
            model: 'gemini-3-pro-image-preview',
          },
        },
      },
      abortController: { signal: {} },
      config: {},
    };
    const res = { end: jest.fn() };

    await generateOpenAIImage(req, res);

    expect(addGoogleTitle).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        text: '生成一张老人钓鱼的图',
        client: expect.objectContaining({
          generateImage: expect.any(Function),
        }),
        response: expect.objectContaining({
          conversationId: Constants.NEW_CONVO,
          endpoint: 'google',
          model: 'gemini-3-pro-image-preview',
        }),
      }),
    );
  });

  it('routes google image mode through the google endpoint client', async () => {
    initializeGoogleClient.mockResolvedValue({
      client: {
        generateImage: jest.fn().mockResolvedValue({
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 25,
            totalTokenCount: 40,
          },
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '**Refining Object Presentation**\n\nVerbose text should be ignored.',
                  },
                  {
                    inline_data: {
                      mime_type: 'image/png',
                      data: Buffer.from('google-image').toString('base64'),
                    },
                  },
                ],
              },
            },
          ],
        }),
        titleConvo: jest.fn().mockResolvedValue('Google Image Chat'),
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '22222222-2222-2222-2222-222222222222',
      title: 'Google Image Chat',
    });
    saveMessage.mockResolvedValue({});
    uploadImageBuffer.mockResolvedValue({
      file_id: 'file-google-1',
      filepath: '/images/user/file-google-1.png',
      filename: 'file-google-1.png',
      width: 1024,
      height: 1024,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-google-1' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-google-1' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: '生成一张老人钓鱼的图',
        model: 'gemini-3-pro-image-preview',
        endpoint: 'google',
        endpointType: 'google',
        conversationId: '22222222-2222-2222-2222-222222222222',
        parentMessageId: Constants.NO_PARENT,
        imageSize: '16:9',
        endpointOption: {
          model_parameters: {
            model: 'gemini-3-pro-image-preview',
          },
        },
      },
      abortController: { signal: {} },
      config: {},
    };
    const res = { end: jest.fn() };

    await generateOpenAIImage(req, res);

    expect(initializeGoogleClient).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        res,
        overrideModel: 'gemini-3-pro-image-preview',
      }),
    );

    expect(uploadImageBuffer).toHaveBeenCalledTimes(1);

    expect(saveImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'google',
        endpointType: 'google',
        model: 'gemini-3-pro-image-preview',
        responseText: '',
      }),
    );

    expect(saveMessage).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        text: '',
        content: [
          expect.objectContaining({
            type: 'image_file',
          }),
        ],
      }),
      expect.any(Object),
    );

    expect(saveImageGenerationUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'google',
        model: 'gemini-3-pro-image-preview',
        size: '16:9',
        total_tokens: 40,
        input_tokens: 15,
        output_tokens: 25,
      }),
    );
  });

  it('ignores Google thought images and persists only the final image', async () => {
    initializeGoogleClient.mockResolvedValue({
      client: {
        generateImage: jest.fn().mockResolvedValue({
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 25,
            totalTokenCount: 40,
          },
          candidates: [
            {
              content: {
                parts: [
                  {
                    thought: true,
                    inline_data: {
                      mime_type: 'image/png',
                      data: Buffer.from('google-thought-image').toString('base64'),
                    },
                  },
                  {
                    inline_data: {
                      mime_type: 'image/png',
                      data: Buffer.from('google-final-image').toString('base64'),
                    },
                  },
                ],
              },
            },
          ],
        }),
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '44444444-4444-4444-4444-444444444444',
      title: 'New Chat',
    });
    saveMessage.mockResolvedValue({});
    uploadImageBuffer.mockResolvedValue({
      file_id: 'file-google-final-1',
      filepath: '/images/user/file-google-final-1.png',
      filename: 'file-google-final-1.png',
      width: 1024,
      height: 1024,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-google-final-1' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-google-final-1' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: '生成一张老人钓鱼的图',
        model: 'gemini-3-pro-image-preview',
        endpoint: 'google',
        endpointType: 'google',
        conversationId: '44444444-4444-4444-4444-444444444444',
        parentMessageId: Constants.NO_PARENT,
        imageSize: '16:9',
        endpointOption: {
          model_parameters: {
            model: 'gemini-3-pro-image-preview',
          },
        },
      },
      abortController: { signal: {} },
      config: {},
    };
    const res = { end: jest.fn() };

    await generateOpenAIImage(req, res);

    expect(uploadImageBuffer).toHaveBeenCalledTimes(1);
    expect(saveImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        imageCount: 1,
      }),
    );
  });

  it('stores image result and usage in separate collections', async () => {
    initializeClient.mockResolvedValue({
      client: {
        generateImage: jest.fn().mockResolvedValue({
          created: 1713833628,
          output_format: 'png',
          data: [
            {
              b64_json: Buffer.from('image-bytes').toString('base64'),
              revised_prompt: '一只小黑猫在抓鱼',
            },
          ],
          usage: {
            total_tokens: 100,
            input_tokens: 50,
            output_tokens: 50,
            input_tokens_details: {
              text_tokens: 10,
              image_tokens: 40,
            },
          },
        }),
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '11111111-1111-1111-1111-111111111111',
      title: 'Image Chat',
    });
    saveMessage.mockResolvedValue({});
    uploadImageBuffer.mockResolvedValue({
      file_id: 'file-123',
      filepath: '/images/user/file-123.png',
      filename: 'file-123.png',
      width: 1024,
      height: 1024,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-1' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-1' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: '生成一张小黑猫抓鱼的图片',
        model: 'gpt-image-1',
        endpoint: 'openAI',
        endpointType: 'openAI',
        conversationId: '11111111-1111-1111-1111-111111111111',
        parentMessageId: Constants.NO_PARENT,
        endpointOption: {
          model_parameters: {
            size: '1024x1024',
          },
        },
      },
      abortController: { signal: {} },
      config: {},
    };
    const res = { end: jest.fn() };

    await generateOpenAIImage(req, res);

    expect(saveImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'user-123',
        conversationId: '11111111-1111-1111-1111-111111111111',
        endpoint: 'openAI',
        endpointType: 'openAI',
        model: 'gpt-image-1',
        operationType: 'generation',
        prompt: '生成一张小黑猫抓鱼的图片',
        sourceImageFileIds: [],
        sourceImageCount: 0,
        responseText: '一只小黑猫在抓鱼',
        created: 1713833628,
        outputFormat: 'png',
        imageCount: 1,
        providerResponse: {
          created: 1713833628,
          output_format: 'png',
          data: [
            expect.objectContaining({
              revised_prompt: '一只小黑猫在抓鱼',
              has_b64_json: true,
              file_id: 'file-123',
            }),
          ],
        },
      }),
    );

    expect(saveImageGenerationUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'user-123',
        conversationId: '11111111-1111-1111-1111-111111111111',
        imageGenerationId: 'image-generation-1',
        endpoint: 'openAI',
        endpointType: 'openAI',
        model: 'gpt-image-1',
        total_tokens: 100,
        input_tokens: 50,
        output_tokens: 50,
        size: '1024x1024',
        input_tokens_details: {
          text_tokens: 10,
          image_tokens: 40,
        },
        output_tokens_details: undefined,
      }),
    );

    expect(getFiles).not.toHaveBeenCalled();
  });

  it('uses OpenAI image edit when source images are attached', async () => {
    const editImage = jest.fn().mockResolvedValue({
      created: 1713833629,
      output_format: 'png',
      data: [
        {
          b64_json: Buffer.from('edited-image-bytes').toString('base64'),
          revised_prompt: '把这只猫改成戴红围巾',
        },
      ],
      usage: {
        total_tokens: 120,
        input_tokens: 80,
        output_tokens: 40,
      },
    });

    initializeClient.mockResolvedValue({
      client: {
        generateImage: jest.fn(),
        editImage,
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '11111111-1111-1111-1111-111111111111',
      title: 'Image Chat',
    });
    saveMessage.mockResolvedValue({});
    getFiles.mockResolvedValue([
      {
        file_id: 'source-1',
        filepath: '/images/user/source-1.png',
        filename: 'source-1.png',
        width: 512,
        height: 512,
        source: 'local',
        type: 'image/png',
      },
    ]);
    getStrategyFunctions.mockReturnValue({
      getDownloadStream: jest.fn().mockResolvedValue(Readable.from([Buffer.from('source-image')])),
    });
    uploadImageBuffer.mockResolvedValue({
      file_id: 'file-456',
      filepath: '/images/user/file-456.png',
      filename: 'file-456.png',
      width: 1024,
      height: 1024,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-2' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-2' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: '给这只猫加一条红围巾',
        model: 'gpt-image-1',
        endpoint: 'openAI',
        endpointType: 'openAI',
        conversationId: '11111111-1111-1111-1111-111111111111',
        parentMessageId: Constants.NO_PARENT,
        files: [
          {
            file_id: 'source-1',
            filepath: '/images/user/source-1.png',
            type: 'image/png',
            width: 512,
            height: 512,
          },
        ],
        endpointOption: {
          model_parameters: {
            size: '1024x1024',
          },
        },
      },
      abortController: { signal: {} },
      config: {},
    };
    const res = { end: jest.fn() };

    await generateOpenAIImage(req, res);

    expect(editImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: '给这只猫加一条红围巾',
        model: 'gpt-image-1',
        size: '1024x1024',
        n: 1,
        imageFiles: [
          expect.objectContaining({
            file_id: 'source-1',
            filename: 'source-1.png',
            type: 'image/png',
            buffer: expect.any(Buffer),
          }),
        ],
      }),
      req.abortController,
    );

    expect(saveMessage).toHaveBeenNthCalledWith(
      1,
      req,
      expect.objectContaining({
        text: '给这只猫加一条红围巾',
        files: [
          expect.objectContaining({
            file_id: 'source-1',
          }),
        ],
      }),
      expect.any(Object),
    );

    expect(saveImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'edit',
        sourceImageFileIds: ['source-1'],
        sourceImageCount: 1,
      }),
    );
  });

  it('inherits the latest generated image for OpenAI edits when no image is uploaded', async () => {
    mockLatestImageGeneration({
      responseMessageId: 'previous-response',
      providerResponse: {
        data: [
          {
            file_id: 'generated-source-1',
            filepath: '/images/user/generated-source-1.png',
          },
        ],
      },
    });

    const editImage = jest.fn().mockResolvedValue({
      created: 123,
      output_format: 'png',
      data: [
        {
          b64_json: Buffer.from('edited-from-inherited-image').toString('base64'),
          revised_prompt: 'make the background rainy',
        },
      ],
      usage: {
        total_tokens: 120,
        input_tokens: 80,
        output_tokens: 40,
      },
    });

    initializeClient.mockResolvedValue({
      client: {
        generateImage: jest.fn(),
        editImage,
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '11111111-1111-1111-1111-111111111111',
      title: 'Image Chat',
    });
    saveMessage.mockResolvedValue({});
    getFiles.mockResolvedValue([
      {
        file_id: 'generated-source-1',
        filepath: '/images/user/generated-source-1.png',
        filename: 'generated-source-1.png',
        width: 1024,
        height: 1024,
        source: 'local',
        type: 'image/png',
      },
    ]);
    getStrategyFunctions.mockReturnValue({
      getDownloadStream: jest
        .fn()
        .mockResolvedValue(Readable.from([Buffer.from('generated-source-image')])),
    });
    uploadImageBuffer.mockResolvedValue({
      file_id: 'file-edited',
      filepath: '/images/user/file-edited.png',
      filename: 'file-edited.png',
      width: 1024,
      height: 1024,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-inherited-openai' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-inherited-openai' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'make the background rainy',
        model: 'gpt-image-1',
        endpoint: 'openAI',
        endpointType: 'openAI',
        conversationId: '11111111-1111-1111-1111-111111111111',
        parentMessageId: 'previous-user-message',
        endpointOption: {
          model_parameters: {
            size: '1024x1024',
          },
        },
      },
      abortController: { signal: {} },
      config: {},
    };
    const res = { end: jest.fn() };

    await generateOpenAIImage(req, res);

    expect(mockImageGenerationFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'user-123',
        conversationId: '11111111-1111-1111-1111-111111111111',
      }),
    );
    expect(editImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'make the background rainy',
        model: 'gpt-image-1',
        imageFiles: [
          expect.objectContaining({
            file_id: 'generated-source-1',
            filename: 'generated-source-1.png',
            buffer: expect.any(Buffer),
          }),
        ],
      }),
      req.abortController,
    );
    expect(saveImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'edit',
        sourceImageFileIds: ['generated-source-1'],
        sourceImageCount: 1,
      }),
    );
  });

  it('inherits the latest generated image for Google image generation requests', async () => {
    mockLatestImageGeneration({
      responseMessageId: 'previous-google-response',
      providerResponse: {
        data: [
          {
            file_id: 'google-generated-source-1',
            filepath: '/images/user/google-generated-source-1.png',
          },
        ],
      },
    });

    const generateImage = jest.fn().mockResolvedValue({
      usageMetadata: {
        promptTokenCount: 15,
        candidatesTokenCount: 25,
        totalTokenCount: 40,
      },
      candidates: [
        {
          content: {
            parts: [
              {
                inline_data: {
                  mime_type: 'image/png',
                  data: Buffer.from('google-edited-image').toString('base64'),
                },
              },
            ],
          },
        },
      ],
    });

    initializeGoogleClient.mockResolvedValue({
      client: {
        generateImage,
        titleConvo: jest.fn(),
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '33333333-3333-3333-3333-333333333333',
      title: 'Image Chat',
    });
    saveMessage.mockResolvedValue({});
    getFiles.mockResolvedValue([
      {
        file_id: 'google-generated-source-1',
        filepath: '/images/user/google-generated-source-1.png',
        filename: 'google-generated-source-1.png',
        width: 1024,
        height: 1024,
        source: 'local',
        type: 'image/png',
      },
    ]);
    getStrategyFunctions.mockReturnValue({
      getDownloadStream: jest
        .fn()
        .mockResolvedValue(Readable.from([Buffer.from('google-generated-source-image')])),
    });
    uploadImageBuffer.mockResolvedValue({
      file_id: 'google-file-edited',
      filepath: '/images/user/google-file-edited.png',
      filename: 'google-file-edited.png',
      width: 1024,
      height: 1024,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-inherited-google' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-inherited-google' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'make it night time',
        model: 'gemini-3-pro-image-preview',
        endpoint: 'google',
        endpointType: 'google',
        conversationId: '33333333-3333-3333-3333-333333333333',
        parentMessageId: 'previous-user-message',
        imageSize: '1:1',
        endpointOption: {
          model_parameters: {
            model: 'gemini-3-pro-image-preview',
          },
        },
      },
      abortController: { signal: {} },
      config: {},
    };
    const res = { end: jest.fn() };

    await generateOpenAIImage(req, res);

    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'make it night time',
        model: 'gemini-3-pro-image-preview',
        imageFiles: [
          expect.objectContaining({
            file_id: 'google-generated-source-1',
            filename: 'google-generated-source-1.png',
            buffer: expect.any(Buffer),
          }),
        ],
      }),
      req.abortController,
    );
    expect(saveImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'edit',
        sourceImageFileIds: ['google-generated-source-1'],
        sourceImageCount: 1,
      }),
    );
  });
});
