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
      doubao: 'doubao',
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
    rotate: jest.fn().mockReturnThis(),
    resize: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('resized-image')),
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

jest.mock('~/server/services/Endpoints/doubao/initialize', () => jest.fn());

jest.mock('~/server/services/Endpoints/image/title', () => jest.fn(() => Promise.resolve()));

jest.mock('~/server/services/Files/process', () => ({
  uploadImageBuffer: jest.fn(),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

const generateOpenAIImage = require('./openAI');
const { Readable } = require('stream');
const { sendEvent } = require('@librechat/api');
const { saveMessage, saveConvo, getFiles } = require('~/models');
const { saveImageGeneration, saveImageGenerationUsage } = require('~/models/ImageGenerationStore');
const { initializeClient } = require('~/server/services/Endpoints/openAI');
const { initializeClient: initializeGoogleClient } = require('~/server/services/Endpoints/google');
const initializeDoubaoClient = require('~/server/services/Endpoints/doubao/initialize');
const addImageTitle = require('~/server/services/Endpoints/image/title');
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
    delete process.env.DOUBAO_IMAGE_WATERMARK;
    mockLatestImageGeneration(null);
  });

  it('routes google image titles through the shared image title service for new conversations', async () => {
    const overrideConversationId = '33333333-3333-3333-3333-333333333333';

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
        overrideConvoId: `${overrideConversationId}${Constants.COMMON_DIVIDER}0`,
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

    expect(addImageTitle).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        text: '生成一张老人钓鱼的图',
        client: expect.objectContaining({
          generateImage: expect.any(Function),
        }),
        response: expect.objectContaining({
          conversationId: overrideConversationId,
          endpoint: 'google',
          model: 'gemini-3-pro-image-preview',
        }),
        endpoint: 'google',
      }),
    );
  });

  it('does not generate image titles for added image branches', async () => {
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
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '33333333-3333-3333-3333-333333333333',
      title: 'New Chat',
    });
    saveMessage.mockResolvedValue({});
    uploadImageBuffer.mockResolvedValue({
      file_id: 'file-google-added-title-1',
      filepath: '/images/user/file-google-added-title-1.png',
      filename: 'file-google-added-title-1.png',
      width: 1024,
      height: 1024,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-google-added-title-1' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-google-added-title-1' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: '生成一张老人钓鱼的图',
        model: 'gemini-3-pro-image-preview',
        endpoint: 'google',
        endpointType: 'google',
        conversationId: Constants.NEW_CONVO,
        parentMessageId: Constants.NO_PARENT,
        overrideConvoId: `33333333-3333-3333-3333-333333333333${Constants.COMMON_DIVIDER}1`,
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

    expect(addImageTitle).not.toHaveBeenCalled();
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
    expect(sendEvent).toHaveBeenCalledWith(res, expect.objectContaining({ final: true }));
    expect(sendEvent).not.toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        imageProviderRequest: expect.anything(),
      }),
    );
  });

  it('uses imageSize from endpointOption when image requests omit top-level imageSize', async () => {
    const generateImage = jest.fn().mockResolvedValue({
      usageMetadata: {
        totalTokenCount: 0,
      },
      candidates: [
        {
          content: {
            parts: [
              {
                inline_data: {
                  mime_type: 'image/png',
                  data: Buffer.from('google-wide-image').toString('base64'),
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
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '55555555-5555-5555-5555-555555555555',
      title: 'Google Image Chat',
    });
    saveMessage.mockResolvedValue({});
    uploadImageBuffer.mockResolvedValue({
      file_id: 'file-google-wide-1',
      filepath: '/images/user/file-google-wide-1.png',
      filename: 'file-google-wide-1.png',
      width: 1536,
      height: 864,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-google-wide-1' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-google-wide-1' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'generate a wide landscape',
        model: 'gemini-3-pro-image-preview',
        endpoint: 'google',
        endpointType: 'google',
        conversationId: '55555555-5555-5555-5555-555555555555',
        parentMessageId: Constants.NO_PARENT,
        endpointOption: {
          imageSize: '16:9',
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
        prompt: 'generate a wide landscape',
        model: 'gemini-3-pro-image-preview',
        size: '16:9',
      }),
      req.abortController,
    );
    expect(saveImageGenerationUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'google',
        model: 'gemini-3-pro-image-preview',
        size: '16:9',
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

  it('maps OpenAI imageSize from endpointOption when top-level imageSize is omitted', async () => {
    const generateImage = jest.fn().mockResolvedValue({
      created: 1713833628,
      output_format: 'png',
      data: [
        {
          b64_json: Buffer.from('wide-image-bytes').toString('base64'),
        },
      ],
      usage: {
        total_tokens: 0,
      },
    });

    initializeClient.mockResolvedValue({
      client: {
        generateImage,
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '66666666-6666-6666-6666-666666666666',
      title: 'Image Chat',
    });
    saveMessage.mockResolvedValue({});
    uploadImageBuffer.mockResolvedValue({
      file_id: 'file-openai-wide-1',
      filepath: '/images/user/file-openai-wide-1.png',
      filename: 'file-openai-wide-1.png',
      width: 1536,
      height: 1024,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-openai-wide-1' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-openai-wide-1' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'generate a wide landscape',
        model: 'gpt-image-1',
        endpoint: 'openAI',
        endpointType: 'openAI',
        conversationId: '66666666-6666-6666-6666-666666666666',
        parentMessageId: Constants.NO_PARENT,
        endpointOption: {
          imageSize: '16:9',
          model_parameters: {
            model: 'gpt-image-1',
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
        prompt: 'generate a wide landscape',
        model: 'gpt-image-1',
        size: '1536x1024',
      }),
      req.abortController,
    );
    expect(saveImageGenerationUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'openAI',
        model: 'gpt-image-1',
        size: '1536x1024',
      }),
    );
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
        width: 768,
        height: 1076,
        source: 'local',
        type: 'image/png',
      },
      {
        file_id: 'source-2',
        filepath: '/images/user/source-2.png',
        filename: 'source-2.png',
        width: 1024,
        height: 1024,
        source: 'local',
        type: 'image/png',
      },
    ]);
    getStrategyFunctions.mockReturnValue({
      getDownloadStream: jest
        .fn()
        .mockImplementation(() => Promise.resolve(Readable.from([Buffer.from('source-image')]))),
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
            width: 768,
            height: 1076,
          },
          {
            file_id: 'source-2',
            filepath: '/images/user/source-2.png',
            type: 'image/png',
            width: 1024,
            height: 1024,
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
        size: '768x1076',
        n: 1,
        imageFiles: [
          expect.objectContaining({
            file_id: 'source-1',
            filename: 'source-1.png',
            type: 'image/png',
            buffer: expect.any(Buffer),
          }),
          expect.objectContaining({
            file_id: 'source-2',
            filename: 'source-2.png',
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
          expect.objectContaining({
            file_id: 'source-2',
          }),
        ],
      }),
      expect.any(Object),
    );

    expect(saveImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'edit',
        sourceImageFileIds: ['source-1', 'source-2'],
        sourceImageCount: 2,
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

  it('does not inherit a previous image on the first message of a pre-created conversation', async () => {
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

    const generateImage = jest.fn().mockResolvedValue({
      created: 123,
      output_format: 'png',
      data: [
        {
          b64_json: Buffer.from('new-square-image').toString('base64'),
        },
      ],
      usage: {
        total_tokens: 100,
      },
    });

    initializeClient.mockResolvedValue({
      client: {
        generateImage,
        editImage: jest.fn(),
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '77777777-7777-7777-7777-777777777777',
      title: 'Image Chat',
    });
    saveMessage.mockResolvedValue({});
    uploadImageBuffer.mockResolvedValue({
      file_id: 'file-new-square',
      filepath: '/images/user/file-new-square.png',
      filename: 'file-new-square.png',
      width: 1024,
      height: 1024,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-new-square' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-new-square' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'make a square dog image',
        model: 'gpt-image-1',
        endpoint: 'openAI',
        endpointType: 'openAI',
        conversationId: '77777777-7777-7777-7777-777777777777',
        parentMessageId: Constants.NO_PARENT,
        imageSize: '1:1',
        endpointOption: {
          model_parameters: {
            model: 'gpt-image-1',
          },
        },
      },
      abortController: { signal: {} },
      config: {},
    };
    const res = { end: jest.fn() };

    await generateOpenAIImage(req, res);

    expect(mockImageGenerationFindOne).not.toHaveBeenCalled();
    expect(getFiles).not.toHaveBeenCalled();
    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'make a square dog image',
        model: 'gpt-image-1',
        size: '1024x1024',
      }),
      req.abortController,
    );
    expect(generateImage.mock.calls[0][0].imageFiles).toBeUndefined();
    expect(saveImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'generation',
        sourceImageFileIds: [],
        sourceImageCount: 0,
      }),
    );
  });

  it('does not inherit a previous image when image inheritance is disabled', async () => {
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

    const generateImage = jest.fn().mockResolvedValue({
      created: 123,
      output_format: 'png',
      data: [
        {
          b64_json: Buffer.from('fresh-generated-image').toString('base64'),
        },
      ],
      usage: {
        total_tokens: 100,
      },
    });

    initializeClient.mockResolvedValue({
      client: {
        generateImage,
        editImage: jest.fn(),
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '22222222-2222-2222-2222-222222222222',
      title: 'Image Chat',
    });
    saveMessage.mockResolvedValue({});
    uploadImageBuffer.mockResolvedValue({
      file_id: 'file-fresh',
      filepath: '/images/user/file-fresh.png',
      filename: 'file-fresh.png',
      width: 1024,
      height: 1024,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-fresh' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-fresh' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'make a fresh square image',
        model: 'gpt-image-1',
        endpoint: 'openAI',
        endpointType: 'openAI',
        conversationId: '22222222-2222-2222-2222-222222222222',
        parentMessageId: 'previous-user-message',
        imageSize: '1:1',
        inheritPreviousImage: false,
        endpointOption: {
          model_parameters: {
            model: 'gpt-image-1',
          },
        },
      },
      abortController: { signal: {} },
      config: {},
    };
    const res = { end: jest.fn() };

    await generateOpenAIImage(req, res);

    expect(mockImageGenerationFindOne).not.toHaveBeenCalled();
    expect(getFiles).not.toHaveBeenCalled();
    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'make a fresh square image',
        model: 'gpt-image-1',
        size: '1024x1024',
      }),
      req.abortController,
    );
    expect(generateImage.mock.calls[0][0].imageFiles).toBeUndefined();
    expect(saveImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'generation',
        sourceImageFileIds: [],
        sourceImageCount: 0,
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

  it('passes multiple uploaded source images to Google image generation requests', async () => {
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
                  data: Buffer.from('google-multi-image-edit').toString('base64'),
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
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '44444444-4444-4444-4444-444444444444',
      title: 'Image Chat',
    });
    saveMessage.mockResolvedValue({});
    getFiles.mockResolvedValue([
      {
        file_id: 'google-upload-source-1',
        filepath: '/images/user/google-upload-source-1.png',
        filename: 'google-upload-source-1.png',
        width: 1200,
        height: 800,
        source: 'local',
        type: 'image/png',
      },
      {
        file_id: 'google-upload-source-2',
        filepath: '/images/user/google-upload-source-2.jpg',
        filename: 'google-upload-source-2.jpg',
        width: 900,
        height: 900,
        source: 'local',
        type: 'image/jpeg',
      },
    ]);
    getStrategyFunctions.mockReturnValue({
      getDownloadStream: jest
        .fn()
        .mockImplementation(() => Promise.resolve(Readable.from([Buffer.from('google-source')]))),
    });
    uploadImageBuffer.mockResolvedValue({
      file_id: 'google-file-multi-edit',
      filepath: '/images/user/google-file-multi-edit.png',
      filename: 'google-file-multi-edit.png',
      width: 1024,
      height: 1024,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-google-multi-edit' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-google-multi-edit' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'combine the character and background',
        model: 'gemini-3-pro-image-preview',
        endpoint: 'google',
        endpointType: 'google',
        conversationId: '44444444-4444-4444-4444-444444444444',
        parentMessageId: Constants.NO_PARENT,
        files: [
          {
            file_id: 'google-upload-source-1',
            filepath: '/images/user/google-upload-source-1.png',
            type: 'image/png',
            width: 1200,
            height: 800,
          },
          {
            file_id: 'google-upload-source-2',
            filepath: '/images/user/google-upload-source-2.jpg',
            type: 'image/jpeg',
            width: 900,
            height: 900,
          },
        ],
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
        prompt: 'combine the character and background',
        model: 'gemini-3-pro-image-preview',
        imageFiles: [
          expect.objectContaining({
            file_id: 'google-upload-source-1',
            filename: 'google-upload-source-1.png',
            type: 'image/png',
            buffer: expect.any(Buffer),
          }),
          expect.objectContaining({
            file_id: 'google-upload-source-2',
            filename: 'google-upload-source-2.jpg',
            type: 'image/jpeg',
            buffer: expect.any(Buffer),
          }),
        ],
      }),
      req.abortController,
    );
    expect(saveImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'edit',
        sourceImageFileIds: ['google-upload-source-1', 'google-upload-source-2'],
        sourceImageCount: 2,
      }),
    );
  });

  it('uses the selected image size for Google edits when explicitly requested', async () => {
    const inheritedSourceBuffer = Buffer.from('wide-source');
    mockLatestImageGeneration({
      responseMessageId: 'previous-google-response',
      providerResponse: {
        data: [
          {
            file_id: 'wide-google-source',
            filepath: '/images/user/wide-google-source.png',
          },
        ],
      },
    });

    const generateImage = jest.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                inline_data: {
                  mime_type: 'image/png',
                  data: Buffer.from('google-square-image').toString('base64'),
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
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '88888888-8888-8888-8888-888888888888',
      title: 'Image Chat',
    });
    saveMessage.mockResolvedValue({});
    getFiles.mockResolvedValue([
      {
        file_id: 'wide-google-source',
        filepath: '/images/user/wide-google-source.png',
        filename: 'wide-google-source.png',
        width: 1699,
        height: 926,
        source: 'local',
        type: 'image/png',
      },
    ]);
    getStrategyFunctions.mockReturnValue({
      getDownloadStream: jest.fn().mockResolvedValue(Readable.from([inheritedSourceBuffer])),
    });
    uploadImageBuffer.mockResolvedValue({
      file_id: 'google-square-file',
      filepath: '/images/user/google-square-file.png',
      filename: 'google-square-file.png',
      width: 926,
      height: 926,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-square-google' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-square-google' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'make it a square poster',
        model: 'gemini-3-pro-image-preview',
        endpoint: 'google',
        endpointType: 'google',
        conversationId: '88888888-8888-8888-8888-888888888888',
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
        size: '1:1',
        imageFiles: [
          expect.objectContaining({
            file_id: 'wide-google-source',
            buffer: inheritedSourceBuffer,
            width: 1699,
            height: 926,
          }),
        ],
      }),
      req.abortController,
    );
  });

  it('maps Doubao smart aspect ratio and image resolution for text-to-image requests', async () => {
    const generateImage = jest.fn().mockResolvedValue({
      created: 123,
      output_format: 'png',
      data: [
        {
          b64_json: Buffer.from('doubao-banner-result').toString('base64'),
        },
      ],
      usage: {
        total_tokens: 0,
      },
    });

    initializeDoubaoClient.mockResolvedValue({
      client: {
        generateImage,
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '99999999-9999-9999-9999-999999999999',
      title: 'Image Chat',
    });
    saveMessage.mockResolvedValue({});
    uploadImageBuffer.mockResolvedValue({
      file_id: 'doubao-banner-file',
      filepath: '/images/user/doubao-banner-file.png',
      filename: 'doubao-banner-file.png',
      width: 6272,
      height: 2688,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-doubao-banner' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-doubao-banner' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'make a cinematic banner for a new product',
        model: 'doubao-seedream-5-0-260128',
        endpoint: 'doubao',
        endpointType: 'doubao',
        conversationId: '99999999-9999-9999-9999-999999999999',
        parentMessageId: Constants.NO_PARENT,
        imageSize: 'auto',
        imageResolution: '4K',
        imageMaxImages: 3,
        endpointOption: {
          model_parameters: {
            model: 'doubao-seedream-5-0-260128',
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
        prompt: expect.stringContaining('make a cinematic banner for a new product'),
        model: 'doubao-seedream-5-0-260128',
        size: '6272x2688',
        watermark: false,
        sequential_image_generation: 'auto',
        sequential_image_generation_options: {
          max_images: 3,
        },
      }),
      req.abortController,
    );
    expect(generateImage.mock.calls[0][0].prompt).toContain('必须输出 3 张');
    expect(generateImage.mock.calls[0][0].imageFiles).toBeUndefined();
    expect(generateImage).toHaveBeenCalledTimes(3);
    expect(generateImage.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        prompt: expect.stringContaining('请补充生成第 2 张图片'),
        sequential_image_generation: 'disabled',
      }),
    );
    expect(generateImage.mock.calls[1][0].sequential_image_generation_options).toBeUndefined();
    expect(saveImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'doubao',
        operationType: 'generation',
        sourceImageFileIds: [],
        sourceImageCount: 0,
      }),
    );
  });

  it('routes Doubao image requests with multiple source images through the Doubao client', async () => {
    const generateImage = jest.fn().mockResolvedValue({
      created: 123,
      output_format: 'png',
      data: [
        {
          b64_json: Buffer.from('doubao-result').toString('base64'),
        },
      ],
      usage: {
        total_tokens: 0,
      },
    });

    initializeDoubaoClient.mockResolvedValue({
      client: {
        generateImage,
      },
    });

    saveConvo.mockResolvedValue({
      conversationId: '44444444-4444-4444-4444-444444444444',
      title: 'Image Chat',
    });
    saveMessage.mockResolvedValue({});
    getFiles.mockResolvedValue([
      {
        file_id: 'source-1',
        filepath: '/images/user/source-1.png',
        filename: 'source-1.png',
        width: 768,
        height: 1076,
        source: 'local',
        type: 'image/png',
      },
      {
        file_id: 'source-2',
        filepath: '/images/user/source-2.png',
        filename: 'source-2.png',
        width: 512,
        height: 512,
        source: 'local',
        type: 'image/png',
      },
    ]);
    getStrategyFunctions.mockReturnValue({
      getDownloadStream: jest.fn((_, filepath) =>
        Promise.resolve(Readable.from([Buffer.from(`image:${filepath}`)])),
      ),
    });
    uploadImageBuffer.mockResolvedValue({
      file_id: 'doubao-file-1',
      filepath: '/images/user/doubao-file-1.png',
      filename: 'doubao-file-1.png',
      width: 1024,
      height: 1024,
      source: 'local',
      type: 'image/png',
    });
    saveImageGeneration.mockResolvedValue({ _id: 'image-generation-doubao' });
    saveImageGenerationUsage.mockResolvedValue({ _id: 'image-usage-doubao' });

    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'merge these references into a poster',
        model: 'doubao-seedream-5-0-260128',
        endpoint: 'doubao',
        endpointType: 'doubao',
        conversationId: '44444444-4444-4444-4444-444444444444',
        parentMessageId: Constants.NO_PARENT,
        files: [
          {
            file_id: 'source-1',
            filepath: '/images/user/source-1.png',
            type: 'image/png',
            width: 768,
            height: 1076,
          },
          {
            file_id: 'source-2',
            filepath: '/images/user/source-2.png',
            type: 'image/png',
            width: 512,
            height: 512,
          },
        ],
        imageSize: '16:9',
        endpointOption: {
          imageMaxImages: 6,
          model_parameters: {
            model: 'doubao-seedream-5-0-260128',
          },
        },
      },
      abortController: { signal: {} },
      config: {},
    };
    const res = { end: jest.fn() };

    await generateOpenAIImage(req, res);

    expect(initializeDoubaoClient).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEnvPrefix: 'DOUBAO_IMAGE_KEY',
        overrideModel: 'doubao-seedream-5-0-260128',
      }),
    );
    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('merge these references into a poster'),
        model: 'doubao-seedream-5-0-260128',
        size: '2848x1600',
        watermark: false,
        sequential_image_generation: 'auto',
        sequential_image_generation_options: {
          max_images: 4,
        },
        imageFiles: [
          expect.objectContaining({ file_id: 'source-1', buffer: expect.any(Buffer) }),
          expect.objectContaining({ file_id: 'source-2', buffer: expect.any(Buffer) }),
        ],
      }),
      req.abortController,
    );
    expect(generateImage.mock.calls[0][0].prompt).toContain('必须输出 4 张');
    expect(saveImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'doubao',
        operationType: 'edit',
        sourceImageFileIds: ['source-1', 'source-2'],
        sourceImageCount: 2,
      }),
    );
  });
});
