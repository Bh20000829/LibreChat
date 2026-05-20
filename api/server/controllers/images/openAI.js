const { sendEvent, getBalanceConfig } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  Constants,
  ContentTypes,
  FileSources,
  EModelEndpoint,
  FileContext,
  getResponseSender,
} = require('librechat-data-provider');
const sharp = require('sharp');
const { saveMessage, saveConvo, getFiles } = require('~/models');
const { saveImageGeneration, saveImageGenerationUsage } = require('~/models/ImageGenerationStore');
const { checkBalance } = require('~/models/balanceMethods');
const { calculateUsageCostCny, calculateImageUsageCostCny } = require('~/models/pricingUtils');
const { incrementQuotaUsage } = require('~/models/quotaUsage');
const { initializeClient: initializeOpenAIClient } = require('~/server/services/Endpoints/openAI');
const { initializeClient: initializeGoogleClient } = require('~/server/services/Endpoints/google');
const countTokens = require('~/server/utils/countTokens');
const { getAppConfig } = require('~/server/services/Config');
const addTitle = require('~/server/services/Endpoints/openAI/title');
const addGoogleTitle = require('~/server/services/Endpoints/google/title');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { uploadImageBuffer } = require('~/server/services/Files/process');

const IMAGE_SIZE_MAP = {
  '1:1': '1024x1024',
  '16:9': '1536x1024',
  '4:3': '1536x1024',
  '9:16': '1024x1536',
  '3:4': '1024x1536',
};

const SUPPORTED_IMAGE_ENDPOINTS = new Set([EModelEndpoint.openAI, EModelEndpoint.google]);

const providerTitleGenerators = {
  [EModelEndpoint.openAI]: addTitle,
  [EModelEndpoint.google]: addGoogleTitle,
};

function getProviderLabel(endpoint) {
  if (endpoint === EModelEndpoint.google) {
    return 'Google';
  }

  return 'OpenAI';
}

function getInitializeClient(endpoint) {
  if (endpoint === EModelEndpoint.google) {
    return initializeGoogleClient;
  }

  return initializeOpenAIClient;
}

function resolveImageReverseProxy(endpoint) {
  const generic = process.env.IMAGE_REVERSE_PROXY?.trim();
  if (endpoint === EModelEndpoint.google) {
    return process.env.GOOGLE_IMAGE_REVERSE_PROXY?.trim() || generic || null;
  }

  return process.env.OPENAI_IMAGE_REVERSE_PROXY?.trim() || generic || null;
}

function resolveImageProviderKeyPrefix(endpoint) {
  if (endpoint === EModelEndpoint.google) {
    return 'GOOGLE_IMAGE_KEY';
  }

  return 'OPENAI_IMAGE_API_KEY';
}

function splitOverrideId(rawId) {
  if (!rawId || typeof rawId !== 'string') {
    return { id: null, skipSave: false };
  }

  const [id, index] = rawId.split(Constants.COMMON_DIVIDER);
  return {
    id: id || null,
    skipSave: index != null && index !== '0',
  };
}

function createTextPart(text) {
  return {
    type: ContentTypes.TEXT,
    text: {
      value: text,
    },
  };
}

function createImagePart(file) {
  return {
    type: ContentTypes.IMAGE_FILE,
    image_file: {
      file_id: file.file_id,
      filepath: file.filepath,
      filename: file.filename,
      width: file.width,
      height: file.height,
      source: file.source,
      type: file.type,
    },
  };
}

function normalizeModalityTokenDetails(details) {
  if (!Array.isArray(details)) {
    return null;
  }

  const byModality = {};

  for (const item of details) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const rawModality = item.modality ?? item.mode ?? 'MODALITY_UNSPECIFIED';
    const normalizedModality = String(rawModality)
      .toLowerCase()
      .replace(/^modality_/, '');
    const tokenCount = Number(item.tokenCount ?? item.token_count ?? 0);

    if (!Number.isFinite(tokenCount)) {
      continue;
    }

    byModality[normalizedModality] = (byModality[normalizedModality] ?? 0) + tokenCount;
  }

  return Object.keys(byModality).length > 0 ? byModality : null;
}

function toLegacyDetailMap(byModality) {
  if (!byModality || typeof byModality !== 'object') {
    return undefined;
  }

  const legacy = {};
  for (const [modality, tokenCount] of Object.entries(byModality)) {
    legacy[`${modality}_tokens`] = tokenCount;
  }

  return Object.keys(legacy).length > 0 ? legacy : undefined;
}

function normalizeImageUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokenCount);
  const outputTokens = Number(
    usage.output_tokens ?? usage.completion_tokens ?? usage.candidatesTokenCount,
  );
  const fallbackTotal =
    (Number.isFinite(inputTokens) ? inputTokens : 0) +
    (Number.isFinite(outputTokens) ? outputTokens : 0);
  const totalTokens = Number(usage.total_tokens ?? usage.totalTokenCount ?? fallbackTotal);

  const promptModalityDetails = normalizeModalityTokenDetails(
    usage.promptTokensDetails ?? usage.prompt_tokens_details,
  );
  const cacheModalityDetails = normalizeModalityTokenDetails(
    usage.cacheTokensDetails ?? usage.cache_tokens_details,
  );
  const candidatesModalityDetails = normalizeModalityTokenDetails(
    usage.candidatesTokensDetails ?? usage.candidates_tokens_details,
  );
  const toolUsePromptModalityDetails = normalizeModalityTokenDetails(
    usage.toolUsePromptTokensDetails ?? usage.tool_use_prompt_tokens_details,
  );

  const cachedContentTokens = Number(
    usage.cachedContentTokenCount ?? usage.cached_content_token_count,
  );
  const toolUsePromptTokens = Number(
    usage.toolUsePromptTokenCount ?? usage.tool_use_prompt_token_count,
  );
  const thoughtsTokens = Number(usage.thoughtsTokenCount ?? usage.thoughts_token_count);

  return {
    total_tokens: Number.isFinite(totalTokens) ? totalTokens : 0,
    input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    input_tokens_details:
      usage.input_tokens_details ?? toLegacyDetailMap(promptModalityDetails),
    output_tokens_details:
      usage.output_tokens_details ?? toLegacyDetailMap(candidatesModalityDetails),
    cached_content_tokens: Number.isFinite(cachedContentTokens) ? cachedContentTokens : 0,
    tool_use_prompt_tokens: Number.isFinite(toolUsePromptTokens) ? toolUsePromptTokens : 0,
    thoughts_tokens: Number.isFinite(thoughtsTokens) ? thoughtsTokens : 0,
    input_token_modality_details: promptModalityDetails,
    cache_token_modality_details: cacheModalityDetails,
    output_token_modality_details: candidatesModalityDetails,
    tool_use_prompt_token_modality_details: toolUsePromptModalityDetails,
    provider_usage_metadata: usage,
  };
}

function getImageModelOptions(endpointOption = {}) {
  return endpointOption?.model_parameters ?? endpointOption?.modelOptions ?? {};
}

function resolveImageCount() {
  const parsed = Number(process.env.OPENAI_IMAGE_GENERATION_N ?? 1);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 10);
}

function resolveImageSize(requestedSize) {
  if (typeof requestedSize !== 'string' || requestedSize.trim().length === 0) {
    return IMAGE_SIZE_MAP['1:1'];
  }

  return IMAGE_SIZE_MAP[requestedSize] ?? requestedSize;
}

function resolveProviderImageSize(requestedSize, endpoint) {
  if (endpoint === EModelEndpoint.google) {
    if (typeof requestedSize !== 'string' || requestedSize.trim().length === 0) {
      return '1:1';
    }

    return requestedSize;
  }

  return resolveImageSize(requestedSize);
}

function getImageOutputFormat(item, fallback = 'png') {
  if (item?.inlineData?.mimeType?.startsWith('image/')) {
    return item.inlineData.mimeType.replace('image/', '').split(';')[0];
  }

  if (item?.inline_data?.mime_type?.startsWith('image/')) {
    return item.inline_data.mime_type.replace('image/', '').split(';')[0];
  }

  return fallback;
}

function createImageAsset(item) {
  return {
    revised_prompt: item?.revised_prompt,
    url: item?.url,
    has_b64_json:
      (typeof item?.b64_json === 'string' && item.b64_json.length > 0) ||
      (typeof item?.inlineData?.data === 'string' && item.inlineData.data.length > 0) ||
      (typeof item?.inline_data?.data === 'string' && item.inline_data.data.length > 0),
  };
}

function createProviderResponse({ created, outputFormat, assets }) {
  return {
    created,
    output_format: outputFormat,
    data: assets.map((asset) => ({
      revised_prompt: asset.revised_prompt,
      url: asset.url,
      has_b64_json: asset.has_b64_json,
      file_id: asset.file_id,
      filepath: asset.filepath,
      filename: asset.filename,
      width: asset.width,
      height: asset.height,
      source: asset.source,
      type: asset.type,
    })),
  };
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    stream.on('error', reject);
  }).finally(() => {
    if (typeof stream?.destroy === 'function') {
      stream.destroy();
    }
  });
}

function getRequestedFileIds(files) {
  if (!Array.isArray(files)) {
    return [];
  }

  return files
    .map((file) => file?.file_id)
    .filter((fileId) => typeof fileId === 'string' && fileId.length > 0);
}

async function resolveSourceImages(req, files) {
  const fileIds = getRequestedFileIds(files);
  if (fileIds.length === 0) {
    return [];
  }

  if (fileIds.length > 16) {
    throw new Error('OpenAI image editing supports up to 16 source images');
  }

  const storedFiles = await getFiles(
    {
      user: req.user.id,
      file_id: { $in: fileIds },
      height: { $exists: true },
      width: { $exists: true },
    },
    {},
    {},
  );

  const storedFileMap = new Map(storedFiles.map((file) => [file.file_id, file]));
  const resolvedFiles = [];

  for (const fileId of fileIds) {
    const file = storedFileMap.get(fileId);

    if (!file || !file.type?.startsWith('image/')) {
      throw new Error(`Referenced image not found for editing: ${fileId}`);
    }

    const source = file.source ?? FileSources.local;
    const { getDownloadStream } = getStrategyFunctions(source);

    if (!getDownloadStream) {
      throw new Error(`No download stream method found for source image: ${source}`);
    }

    const stream = await getDownloadStream(req, file.filepath);
    if (!stream) {
      throw new Error(`Failed to load source image: ${fileId}`);
    }

    const buffer = await streamToBuffer(stream);
    resolvedFiles.push({ ...file, buffer, source });
  }

  return resolvedFiles;
}

async function getGeneratedImageBuffer(item) {
  if (item?.b64_json) {
    return Buffer.from(item.b64_json, 'base64');
  }

  if (item?.inlineData?.data) {
    return Buffer.from(item.inlineData.data, 'base64');
  }

  if (item?.inline_data?.data) {
    return Buffer.from(item.inline_data.data, 'base64');
  }

  if (!item?.url) {
    return null;
  }

  const response = await fetch(item.url);
  if (!response.ok) {
    throw new Error(`Failed to download generated image: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function persistGeneratedImage({ req, item, outputFormat, responseMessageId, index }) {
  const buffer = await getGeneratedImageBuffer(item);
  if (!buffer) {
    return null;
  }

  const resolvedOutputFormat = getImageOutputFormat(item, outputFormat);
  const metadata = await sharp(buffer).metadata();
  const file = await uploadImageBuffer({
    req,
    context: FileContext.image_generation,
    resize: false,
    metadata: {
      buffer,
      width: metadata.width,
      height: metadata.height,
      bytes: buffer.byteLength,
      filename: `${responseMessageId}-${index}.${resolvedOutputFormat}`,
      file_id: crypto.randomUUID(),
      type: `image/${resolvedOutputFormat}`,
    },
  });

  return file;
}

function normalizeGoogleImageResult(imageResult, _fallbackText) {
  const response = imageResult?.response ?? imageResult;
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  const parts = candidates.flatMap((candidate) => candidate?.content?.parts ?? []);
  const images = parts.filter(
    (part) =>
      part?.thought !== true &&
      ((part?.inlineData?.mimeType?.startsWith('image/') && part.inlineData.data) ||
        (part?.inline_data?.mime_type?.startsWith('image/') && part.inline_data.data)),
  );
  const outputFormat = getImageOutputFormat(images[0], 'png');

  return {
    created: Date.now(),
    output_format: outputFormat,
    usage: response?.usageMetadata,
    data: images,
    responseText: null,
  };
}

function normalizeProviderImageResult({ endpoint, imageResult, fallbackText }) {
  if (endpoint === EModelEndpoint.google) {
    return normalizeGoogleImageResult(imageResult, fallbackText);
  }

  const images = Array.isArray(imageResult?.data) ? imageResult.data : [];
  const revisedPrompts = images
    .map((item) => item?.revised_prompt)
    .filter((value) => typeof value === 'string' && value.length > 0);

  return {
    ...imageResult,
    responseText: revisedPrompts[0] ?? fallbackText,
  };
}

async function maybeAddImageTitle({ req, text, responseMessage, client, endpoint }) {
  const providerTitleGenerator = providerTitleGenerators[endpoint];

  if (providerTitleGenerator) {
    return providerTitleGenerator(req, {
      text,
      response: responseMessage,
      client,
    });
  }

  if (typeof client?.titleConvo !== 'function') {
    return undefined;
  }

  const title = await client.titleConvo({
    text,
    responseText: responseMessage?.text ?? '',
  });

  if (!title || typeof title !== 'string') {
    return undefined;
  }

  return saveConvo(
    req,
    {
      conversationId: responseMessage.conversationId,
      title: title
        .split('\n')[0]
        .trim()
        .replace(/^['"\s]+|['"\s]+$/g, ''),
    },
    { context: 'api/server/controllers/images/openAI.js - save generated title' },
  );
}

async function generateOpenAIImage(req, res) {
  const startedAt = Date.now();
  const {
    text,
    model,
    endpoint,
    endpointType,
    conversationId: requestConversationId,
    parentMessageId = Constants.NO_PARENT,
    responseMessageId: requestedResponseMessageId,
    overrideConvoId,
    overrideUserMessageId,
    endpointOption = {},
  } = req.body;

  const parsedConvo = splitOverrideId(overrideConvoId);
  const parsedUserMessage = splitOverrideId(overrideUserMessageId);
  const newConvo =
    !parsedConvo.id && (!requestConversationId || requestConversationId === Constants.NEW_CONVO);

  const conversationId = parsedConvo.id ?? requestConversationId ?? crypto.randomUUID();
  const userMessageId = parsedUserMessage.id ?? req.body.messageId ?? crypto.randomUUID();
  const responseMessageId = requestedResponseMessageId ?? `${userMessageId}_`;
  const imageModelOptions = getImageModelOptions(endpointOption);
  const {
    imageSize: configuredImageSize,
    size: configuredSize,
    n: _configuredN,
    ...providerImageOptions
  } = imageModelOptions;
  const requestedImageSize = req.body.imageSize ?? configuredImageSize ?? configuredSize;
  const resolvedImageSize = resolveProviderImageSize(requestedImageSize, endpoint);
  const resolvedImageCount = resolveImageCount();
  const resolvedModel = imageModelOptions.model ?? model;
  const providerLabel = getProviderLabel(endpoint);

  const sender = getResponseSender({
    model: resolvedModel,
    endpoint,
    endpointType,
    modelDisplayLabel: endpointOption.modelDisplayLabel,
    chatGptLabel: endpointOption.chatGptLabel ?? endpointOption.modelLabel,
  });

  const userMessage = {
    messageId: userMessageId,
    parentMessageId,
    conversationId,
    sender: 'User',
    text,
    endpoint,
    model: resolvedModel,
    isCreatedByUser: true,
    ...(Array.isArray(req.body.files) && req.body.files.length > 0
      ? { files: req.body.files }
      : {}),
  };

  const saveConversation = async () => {
    const convo = await saveConvo(
      req,
      {
        conversationId,
        endpoint,
        endpointType,
        model: resolvedModel,
        mode: 'image',
        iconURL: endpointOption.iconURL,
        spec: endpointOption.spec,
      },
      { context: 'api/server/controllers/images/openAI.js - saveConvo' },
    );

    return {
      ...convo,
      title: !convo?.title ? 'New Chat' : convo.title,
    };
  };

  try {
    if (!text?.trim()) {
      throw new Error('Prompt is required');
    }

    if (!SUPPORTED_IMAGE_ENDPOINTS.has(endpoint)) {
      throw new Error('Image generation is only supported for OpenAI and Google right now');
    }

    const appConfig = await getAppConfig({ role: req.user?.role });
    const balanceConfig = getBalanceConfig(appConfig);

    if (balanceConfig?.enabled) {
      const promptTokens = await countTokens(text.trim(), resolvedModel || 'gpt-3.5-turbo');
      await checkBalance({
        req,
        res,
        txData: {
          user: req.user.id,
          tokenType: 'prompt',
          amount: promptTokens,
          endpoint,
          model: resolvedModel,
        },
      });
    }

    if (!parsedUserMessage.skipSave) {
      await saveMessage(req, userMessage, {
        context: 'api/server/controllers/images/openAI.js - save user message',
      });
    }

    await saveConversation();
    sendEvent(res, { message: userMessage, created: true });

    logger.info(`[${providerLabel} Image Controller] Stage completed`, {
      stage: 'pre-provider',
      conversationId,
      model: resolvedModel,
      durationMs: Date.now() - startedAt,
    });

    const providerStartedAt = Date.now();
    const sourceImages = await resolveSourceImages(req, req.body.files);
    const operationType = sourceImages.length > 0 ? 'edit' : 'generation';
    const initializeClient = getInitializeClient(endpoint);
    const imageReverseProxyUrl = resolveImageReverseProxy(endpoint);
    const imageProviderEnvPrefix = resolveImageProviderKeyPrefix(endpoint);
    const imageEndpointOption = imageReverseProxyUrl
      ? { ...endpointOption, reverseProxyUrl: imageReverseProxyUrl }
      : endpointOption;
    const { client } = await initializeClient({
      req,
      res,
      endpointOption: imageEndpointOption,
      overrideModel: resolvedModel,
      providerEnvPrefix: imageProviderEnvPrefix,
      useUserProviderApiKey: false,
    });

    const imageRequest = {
      prompt: text.trim(),
      model: resolvedModel,
      ...providerImageOptions,
      n: resolvedImageCount,
      size: resolvedImageSize,
    };

    const imageResult = await (endpoint === EModelEndpoint.openAI && operationType === 'edit'
      ? client.editImage(
          {
            ...imageRequest,
            imageFiles: sourceImages,
          },
          req.abortController,
        )
      : client.generateImage(
          {
            ...imageRequest,
            ...(sourceImages.length > 0 ? { imageFiles: sourceImages } : {}),
          },
          req.abortController,
        ));

    const normalizedResult = normalizeProviderImageResult({
      endpoint,
      imageResult,
      fallbackText: text.trim(),
    });

    logger.info(`[${providerLabel} Image Controller] Stage completed`, {
      stage: 'provider-response',
      conversationId,
      model: resolvedModel,
      operationType,
      durationMs: Date.now() - providerStartedAt,
      totalDurationMs: Date.now() - startedAt,
    });

    logger.info(`[${providerLabel} Image Controller] Raw provider image response received`, {
      conversationId,
      model: resolvedModel,
      created: normalizedResult?.created,
      output_format: normalizedResult?.output_format,
      usage: normalizedResult?.usage,
      data: Array.isArray(normalizedResult?.data)
        ? normalizedResult.data.map((item) => ({
            has_b64_json: typeof item?.b64_json === 'string' && item.b64_json.length > 0,
            has_inline_data:
              typeof item?.inlineData?.data === 'string' && item.inlineData.data.length > 0,
            revised_prompt: item?.revised_prompt,
            url: item?.url,
            mimeType: item?.inlineData?.mimeType,
          }))
        : normalizedResult?.data,
    });

    const outputFormat =
      normalizedResult?.output_format ?? endpointOption.model_parameters?.output_format ?? 'png';
    const images = Array.isArray(normalizedResult?.data) ? normalizedResult.data : [];
    const assets = images.map((item) => createImageAsset(item));
    const content = [];
    const responseText =
      endpoint === EModelEndpoint.google
        ? (normalizedResult?.responseText ?? '')
        : (normalizedResult?.responseText ?? text.trim());
    if (responseText) {
      content.push(createTextPart(responseText));
    }

    const persistStartedAt = Date.now();
    for (const [index, item] of images.entries()) {
      const singleImageStartedAt = Date.now();
      let imageFile;

      try {
        imageFile = await persistGeneratedImage({
          req,
          item,
          outputFormat,
          responseMessageId,
          index,
        });
      } catch (imageError) {
        logger.error(`[${providerLabel} Image Controller] Failed to persist generated image`, {
          conversationId,
          model: resolvedModel,
          index,
          error: imageError.message,
        });
        continue;
      }

      if (!imageFile) {
        continue;
      }

      Object.assign(assets[index], {
        file_id: imageFile.file_id,
        filepath: imageFile.filepath,
        filename: imageFile.filename,
        width: imageFile.width,
        height: imageFile.height,
        source: imageFile.source,
        type: imageFile.type,
      });

      content.push(createImagePart(imageFile));

      logger.info(`[${providerLabel} Image Controller] Stage completed`, {
        stage: 'persist-image',
        conversationId,
        model: resolvedModel,
        index,
        durationMs: Date.now() - singleImageStartedAt,
        totalDurationMs: Date.now() - startedAt,
      });
    }

    logger.info(`[${providerLabel} Image Controller] Stage completed`, {
      stage: 'persist-images-total',
      conversationId,
      model: resolvedModel,
      imageCount: images.length,
      durationMs: Date.now() - persistStartedAt,
      totalDurationMs: Date.now() - startedAt,
    });

    if (content.length === 0) {
      throw new Error(`${providerLabel} did not return any image data`);
    }

    const responseMessage = {
      messageId: responseMessageId,
      parentMessageId: userMessageId,
      conversationId,
      sender,
      endpoint,
      model: resolvedModel,
      isCreatedByUser: false,
      text: responseText,
      content,
    };

    await saveMessage(req, responseMessage, {
      context: 'api/server/controllers/images/openAI.js - save response message',
    });

    const normalizedUsage = normalizeImageUsage(normalizedResult?.usage);
    const size = resolvedImageSize;
    const imageCostCny = await calculateImageUsageCostCny({
      usage: normalizedUsage ?? {},
      model: resolvedModel,
      endpoint,
      generatedCount: assets.length,
    });
    const providerResponse = createProviderResponse({
      created: normalizedResult?.created,
      outputFormat,
      assets,
    });

    try {
      const imageGeneration = await saveImageGeneration({
        user: req.user.id,
        conversationId,
        requestMessageId: userMessageId,
        responseMessageId,
        endpoint,
        endpointType,
        model: resolvedModel,
        operationType,
        prompt: text.trim(),
        sourceImageFileIds: sourceImages.map((file) => file.file_id),
        sourceImageCount: sourceImages.length,
        responseText,
        created: normalizedResult?.created,
        outputFormat,
        imageCount: assets.length,
        providerResponse,
      });

      if (normalizedUsage != null) {
        await saveImageGenerationUsage({
          user: req.user.id,
          conversationId,
          requestMessageId: userMessageId,
          responseMessageId,
          imageGenerationId: imageGeneration?._id,
          endpoint,
          endpointType,
          model: resolvedModel,
          size,
          ...normalizedUsage,
        });
      }
    } catch (storageError) {
      logger.error(`[${providerLabel} Image Controller] Failed to save image generation records`, {
        conversationId,
        model: resolvedModel,
        error: storageError.message,
      });
    }

    if (normalizedUsage != null || imageCostCny > 0) {
      await incrementQuotaUsage(req.user.id, {
        inputTokens: normalizedUsage?.input_tokens ?? 0,
        outputTokens: normalizedUsage?.output_tokens ?? 0,
        cacheTokens: normalizedUsage?.cached_content_tokens ?? 0,
        costCny: imageCostCny,
      });
    }

    const conversation = await saveConversation();

    logger.info(`[${providerLabel} Image Controller] Stage completed`, {
      stage: 'post-persist-save',
      conversationId,
      model: resolvedModel,
      durationMs: Date.now() - startedAt,
    });

    sendEvent(res, {
      final: true,
      conversation,
      title: conversation.title,
      requestMessage: userMessage,
      responseMessage,
    });

    logger.info(`[${providerLabel} Image Controller] Stage completed`, {
      stage: 'final-sse-sent',
      conversationId,
      model: resolvedModel,
      totalDurationMs: Date.now() - startedAt,
    });
    res.end();

    if (parentMessageId === Constants.NO_PARENT && newConvo) {
      maybeAddImageTitle({
        req,
        text,
        responseMessage,
        client,
        endpoint,
      })
        .then(() => {
          logger.debug(`[${providerLabel} Image Controller] Title generation started`);
        })
        .catch((titleError) => {
          logger.error(`[${providerLabel} Image Controller] Error in title generation`, titleError);
        })
        .finally(() => {
          logger.debug(`[${providerLabel} Image Controller] Title generation completed`);
        });
    }
  } catch (error) {
    logger.error(`[${providerLabel} Image Controller] Image generation failed`, error);

    const errorResponse = {
      messageId: responseMessageId,
      parentMessageId: userMessageId,
      conversationId,
      sender,
      endpoint,
      model: resolvedModel,
      isCreatedByUser: false,
      text: error.message,
      error: true,
      content: [
        {
          type: ContentTypes.ERROR,
          error: error.message,
        },
      ],
    };

    try {
      await saveMessage(req, errorResponse, {
        context: 'api/server/controllers/images/openAI.js - save error response',
      });
    } catch (saveError) {
      logger.error(`[${providerLabel} Image Controller] Failed to save error message`, saveError);
    }

    let conversation = {
      conversationId,
      endpoint,
      endpointType,
      model: resolvedModel,
      mode: 'image',
      title: 'New Chat',
    };

    try {
      conversation = await saveConversation();
    } catch (saveError) {
      logger.error(
        `[${providerLabel} Image Controller] Failed to save conversation after error`,
        saveError,
      );
    }

    sendEvent(res, {
      final: true,
      conversation,
      title: conversation.title,
      requestMessage: userMessage,
      responseMessage: errorResponse,
      error: { message: error.message },
    });
    res.end();
  }
}

module.exports = generateOpenAIImage;
