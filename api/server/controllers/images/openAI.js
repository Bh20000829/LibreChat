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
const {
  saveImageGeneration,
  saveImageGenerationUsage,
  ImageGeneration,
} = require('~/models/ImageGenerationStore');
const { checkBalance } = require('~/models/balanceMethods');
const { calculateImageUsageCostCny } = require('~/models/pricingUtils');
const { incrementQuotaUsage } = require('~/models/quotaUsage');
const { initializeClient: initializeOpenAIClient } = require('~/server/services/Endpoints/openAI');
const { initializeClient: initializeGoogleClient } = require('~/server/services/Endpoints/google');
const initializeDoubaoClient = require('~/server/services/Endpoints/doubao/initialize');
const countTokens = require('~/server/utils/countTokens');
const { getAppConfig } = require('~/server/services/Config');
const addImageTitle = require('~/server/services/Endpoints/image/title');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { uploadImageBuffer } = require('~/server/services/Files/process');

const IMAGE_SIZE_MAP = {
  '1:1': '1024x1024',
  '16:9': '1536x1024',
  '4:3': '1536x1024',
  '9:16': '1024x1536',
  '3:4': '1024x1536',
};

const DOUBAO_IMAGE_SIZE_MAPS = {
  '2K': {
    '1:1': '2048x2048',
    '16:9': '2848x1600',
    '4:3': '2304x1728',
    '3:4': '1728x2304',
    '9:16': '1600x2848',
    '3:2': '2496x1664',
    '2:3': '1664x2496',
    '21:9': '3136x1344',
    '1024x1024': '2048x2048',
    '1536x1024': '2496x1664',
    '1024x1536': '1664x2496',
  },
  '4K': {
    '1:1': '4096x4096',
    '16:9': '5696x3200',
    '4:3': '4608x3456',
    '3:4': '3456x4608',
    '9:16': '3200x5696',
    '3:2': '4992x3328',
    '2:3': '3328x4992',
    '21:9': '6272x2688',
    '1024x1024': '4096x4096',
    '1536x1024': '4992x3328',
    '1024x1536': '3328x4992',
  },
};
const DOUBAO_MIN_IMAGE_PIXELS = 3686400;
const DOUBAO_IMAGE_SIZE_MULTIPLE = 16;
const DOUBAO_MAX_SOURCE_IMAGES = 14;
const OPENAI_MAX_SOURCE_IMAGES = 16;
const GOOGLE_MAX_SOURCE_IMAGES = 14;
const DEFAULT_MAX_SOURCE_IMAGES = 1;

const SUPPORTED_IMAGE_ENDPOINTS = new Set([
  EModelEndpoint.openAI,
  EModelEndpoint.google,
  EModelEndpoint.doubao,
]);
const IMAGE_GENERATION_HEARTBEAT_MS = 15000;

function getProviderLabel(endpoint) {
  if (endpoint === EModelEndpoint.google) {
    return 'Google';
  }

  if (endpoint === EModelEndpoint.doubao) {
    return 'Doubao';
  }

  return 'OpenAI';
}

function getInitializeClient(endpoint) {
  if (endpoint === EModelEndpoint.google) {
    return initializeGoogleClient;
  }

  if (endpoint === EModelEndpoint.doubao) {
    return initializeDoubaoClient;
  }

  return initializeOpenAIClient;
}

function resolveImageReverseProxy(endpoint) {
  const generic = process.env.IMAGE_REVERSE_PROXY?.trim();
  if (endpoint === EModelEndpoint.google) {
    return process.env.GOOGLE_IMAGE_REVERSE_PROXY?.trim() || generic || null;
  }

  if (endpoint === EModelEndpoint.doubao) {
    return (
      process.env.DOUBAO_IMAGE_REVERSE_PROXY?.trim() ||
      process.env.DOUBAO_IMAGE_BASEURL?.trim() ||
      generic ||
      null
    );
  }

  return process.env.OPENAI_IMAGE_REVERSE_PROXY?.trim() || generic || null;
}

function resolveImageProviderKeyPrefix(endpoint) {
  if (endpoint === EModelEndpoint.google) {
    return 'GOOGLE_IMAGE_KEY';
  }

  if (endpoint === EModelEndpoint.doubao) {
    return 'DOUBAO_IMAGE_KEY';
  }

  return 'OPENAI_IMAGE_API_KEY';
}

function startImageKeepAlive({ res, providerLabel, conversationId, model }) {
  const heartbeat = () => {
    if (res.writableEnded || res.destroyed) {
      return;
    }

    try {
      sendEvent(res, {
        event: 'image_generation_heartbeat',
        data: {
          conversationId,
          model,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      logger.debug(`[${providerLabel} Image Controller] Failed to send keep-alive heartbeat`, {
        conversationId,
        model,
        error: error.message,
      });
    }
  };

  const timer = setInterval(heartbeat, IMAGE_GENERATION_HEARTBEAT_MS);
  timer.unref?.();

  return () => clearInterval(timer);
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
    input_tokens_details: usage.input_tokens_details ?? toLegacyDetailMap(promptModalityDetails),
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

function getMaxSourceImages(endpoint) {
  if (endpoint === EModelEndpoint.doubao) {
    return DOUBAO_MAX_SOURCE_IMAGES;
  }
  if (endpoint === EModelEndpoint.openAI) {
    return OPENAI_MAX_SOURCE_IMAGES;
  }
  if (endpoint === EModelEndpoint.google) {
    return GOOGLE_MAX_SOURCE_IMAGES;
  }
  return DEFAULT_MAX_SOURCE_IMAGES;
}

function parseOptionalBoolean(value) {
  if (value == null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

function resolveDoubaoImageWatermark({ req, endpoint, endpointOption, imageModelOptions }) {
  if (endpoint !== EModelEndpoint.doubao || imageModelOptions.watermark != null) {
    return undefined;
  }

  return (
    parseOptionalBoolean(endpointOption?.watermark) ??
    parseOptionalBoolean(req?.config?.endpoints?.[EModelEndpoint.doubao]?.imageWatermark) ??
    parseOptionalBoolean(req?.config?.endpoints?.all?.imageWatermark) ??
    parseOptionalBoolean(process.env.DOUBAO_IMAGE_WATERMARK) ??
    false
  );
}

function resolveDoubaoSequentialImageOptions(endpoint, targetImageCount) {
  if (endpoint !== EModelEndpoint.doubao) {
    return {};
  }

  if (targetImageCount <= 1) {
    return {
      sequential_image_generation: 'disabled',
    };
  }

  return {
    sequential_image_generation: 'auto',
    sequential_image_generation_options: { max_images: targetImageCount },
  };
}

function resolveDoubaoMaxImages({ endpoint, req, endpointOption, imageModelOptions }) {
  if (endpoint !== EModelEndpoint.doubao) {
    return undefined;
  }

  const parsed = Number(
    req.body.imageMaxImages ??
      endpointOption.imageMaxImages ??
      imageModelOptions.imageMaxImages ??
      imageModelOptions.max_images ??
      imageModelOptions.sequential_image_generation_options?.max_images ??
      1,
  );

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 4);
}

function buildDoubaoImagePrompt({ prompt, targetImageCount, supplementIndex }) {
  if (targetImageCount <= 1) {
    return prompt;
  }

  if (supplementIndex != null) {
    return [
      `请补充生成第 ${supplementIndex} 张图片，只输出 1 张图片。`,
      `这张图需要和前面组图保持同一主题、风格、角色或主体一致，但构图、动作、角度或细节要有明显区别。`,
      `原始需求：${prompt}`,
    ].join('\n');
  }

  return [
    `请生成一组 ${targetImageCount} 张内容相关的图片，必须输出 ${targetImageCount} 张。`,
    `每张图片保持同一主题和整体风格，但构图、动作、角度或细节应有所区别。`,
    `原始需求：${prompt}`,
  ].join('\n');
}

function resolveImageSize(requestedSize) {
  if (
    typeof requestedSize !== 'string' ||
    requestedSize.trim().length === 0 ||
    requestedSize.trim().toLowerCase() === 'auto'
  ) {
    return IMAGE_SIZE_MAP['1:1'];
  }

  return IMAGE_SIZE_MAP[requestedSize] ?? requestedSize;
}

function normalizeDoubaoImageResolution(requestedResolution) {
  if (typeof requestedResolution !== 'string') {
    return '2K';
  }

  const normalizedResolution = requestedResolution.trim().toUpperCase();
  return normalizedResolution === '4K' ? '4K' : '2K';
}

function inferSmartImageAspectRatio(prompt) {
  const value = typeof prompt === 'string' ? prompt.toLowerCase() : '';
  if (!value) {
    return '1:1';
  }

  if (
    /(\u6a2a\u5e45|\u6a2a\u7248\u6d77\u62a5|banner|cinematic|\u7535\u5f71\u611f|\u8d85\u5bbd|\u5168\u666f|panorama|21:9)/i.test(
      value,
    )
  ) {
    return '21:9';
  }

  if (
    /(\u624b\u673a\u58c1\u7eb8|\u7ad6\u5c4f|\u7ad6\u7248|story|reels|tiktok|\u5c0f\u7ea2\u4e66\u5c01\u9762|9:16)/i.test(
      value,
    )
  ) {
    return '9:16';
  }

  if (
    /(\u6d77\u62a5|poster|\u5168\u8eab|\u4eba\u50cf|portrait|\u89d2\u8272|\u4eba\u7269|\u6a21\u7279|3:4)/i.test(
      value,
    )
  ) {
    return '3:4';
  }

  if (
    /(\u98ce\u666f|\u573a\u666f|\u80cc\u666f|\u58c1\u7eb8|landscape|desktop|wallpaper|16:9)/i.test(
      value,
    )
  ) {
    return '16:9';
  }

  if (
    /(\u5934\u50cf|\u56fe\u6807|logo|\u5546\u54c1|\u4ea7\u54c1|icon|avatar|product|1:1)/i.test(
      value,
    )
  ) {
    return '1:1';
  }

  return '1:1';
}

function resolveDoubaoImageSize({ requestedSize, imageResolution, prompt }) {
  const normalizedResolution = normalizeDoubaoImageResolution(imageResolution);
  const sizeMap = DOUBAO_IMAGE_SIZE_MAPS[normalizedResolution] ?? DOUBAO_IMAGE_SIZE_MAPS['2K'];
  const normalizedSize = typeof requestedSize === 'string' ? requestedSize.trim() : '';
  const aspectRatio =
    !normalizedSize || normalizedSize.toLowerCase() === 'auto'
      ? inferSmartImageAspectRatio(prompt)
      : normalizedSize;

  return sizeMap[aspectRatio] ?? aspectRatio;
}

function resolveProviderImageSize(requestedSize, endpoint, options = {}) {
  if (endpoint === EModelEndpoint.google) {
    if (
      typeof requestedSize !== 'string' ||
      requestedSize.trim().length === 0 ||
      requestedSize.trim().toLowerCase() === 'auto'
    ) {
      return '1:1';
    }

    return requestedSize;
  }

  if (endpoint === EModelEndpoint.doubao) {
    return resolveDoubaoImageSize({
      requestedSize,
      imageResolution: options.imageResolution,
      prompt: options.prompt,
    });
  }

  return resolveImageSize(requestedSize);
}

function isExplicitImageSizeSelection(requestedSize) {
  if (typeof requestedSize !== 'string') {
    return false;
  }

  const normalizedSize = requestedSize.trim().toLowerCase();
  return normalizedSize.length > 0 && normalizedSize !== 'auto';
}

function roundUpToMultiple(value, multiple) {
  return Math.ceil(value / multiple) * multiple;
}

function normalizeDoubaoEditImageSize(width, height) {
  const originalPixels = width * height;
  if (originalPixels >= DOUBAO_MIN_IMAGE_PIXELS) {
    return `${Math.round(width)}x${Math.round(height)}`;
  }

  const scale = Math.sqrt(DOUBAO_MIN_IMAGE_PIXELS / originalPixels);
  const normalizedWidth = roundUpToMultiple(Math.ceil(width * scale), DOUBAO_IMAGE_SIZE_MULTIPLE);
  const normalizedHeight = roundUpToMultiple(Math.ceil(height * scale), DOUBAO_IMAGE_SIZE_MULTIPLE);

  return `${normalizedWidth}x${normalizedHeight}`;
}

function getEditImageSize({ sourceImages, endpoint }) {
  if (!Array.isArray(sourceImages)) {
    return null;
  }

  for (const image of sourceImages) {
    const width = Number(image?.width);
    const height = Number(image?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      continue;
    }

    if (endpoint === EModelEndpoint.doubao) {
      return normalizeDoubaoEditImageSize(width, height);
    }

    return `${Math.round(width)}x${Math.round(height)}`;
  }

  return null;
}

function getImageOutputFormat(item, fallback = 'png') {
  if (item?.inlineData?.mimeType?.startsWith('image/')) {
    return item.inlineData.mimeType.replace('image/', '').split(';')[0];
  }

  if (item?.inline_data?.mime_type?.startsWith('image/')) {
    return item.inline_data.mime_type.replace('image/', '').split(';')[0];
  }

  if (typeof item?.url === 'string' && item.url.length > 0) {
    try {
      const pathname = new URL(item.url).pathname.toLowerCase();
      if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
        return 'jpeg';
      }
      if (pathname.endsWith('.png')) {
        return 'png';
      }
      if (pathname.endsWith('.webp')) {
        return 'webp';
      }
      if (pathname.endsWith('.gif')) {
        return 'gif';
      }
    } catch (_error) {
      // Ignore URL parsing errors and use fallback output format.
    }
  }

  return fallback;
}

function extractImageUrlFromText(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }

  const markdownMatch = text.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i);
  if (markdownMatch?.[1]) {
    return markdownMatch[1];
  }

  const urlMatch = text.match(/https?:\/\/[^\s)]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s)]*)?/i);
  if (urlMatch?.[0]) {
    return urlMatch[0];
  }

  return null;
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

function isPreviousImageInheritanceEnabled() {
  const value = String(process.env.IMAGE_AUTO_INHERIT_PREVIOUS ?? 'true')
    .trim()
    .toLowerCase();

  return !['false', '0', 'off', 'no'].includes(value);
}

function parseImageInheritancePreference(value) {
  if (value == null) {
    return true;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'off', 'no'].includes(normalized)) {
      return false;
    }
    if (['true', '1', 'on', 'yes'].includes(normalized)) {
      return true;
    }
  }

  return Boolean(value);
}

async function resolveImageFilesByIds(req, fileIds, notFoundMessage, maxSourceImages) {
  if (fileIds.length === 0) {
    return [];
  }

  if (fileIds.length > maxSourceImages) {
    throw new Error(`Image editing supports up to ${maxSourceImages} source image(s)`);
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
      throw new Error(`${notFoundMessage}: ${fileId}`);
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

async function resolveSourceImages(req, files, maxSourceImages) {
  const fileIds = getRequestedFileIds(files);
  return resolveImageFilesByIds(
    req,
    fileIds,
    'Referenced image not found for editing',
    maxSourceImages,
  );
}

function getGeneratedFileIdsFromRecord(record) {
  const data = record?.providerResponse?.data;
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => item?.file_id)
    .filter((fileId) => typeof fileId === 'string' && fileId.length > 0);
}

async function resolveInheritedSourceImages({
  req,
  conversationId,
  responseMessageId,
  maxSourceImages,
}) {
  if (!isPreviousImageInheritanceEnabled() || !conversationId) {
    return [];
  }

  const query = {
    user: req.user.id,
    conversationId,
    imageCount: { $gt: 0 },
  };

  if (responseMessageId) {
    query.responseMessageId = { $ne: responseMessageId };
  }

  const latestGeneration = await ImageGeneration.findOne(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  if (Number(latestGeneration?.imageCount ?? 0) > 1) {
    return [];
  }

  const fileIds = getGeneratedFileIdsFromRecord(latestGeneration);
  if (fileIds.length > 1) {
    return [];
  }

  if (fileIds.length === 0) {
    return [];
  }

  let inheritedImages = [];
  try {
    inheritedImages = await resolveImageFilesByIds(
      req,
      fileIds.slice(0, maxSourceImages),
      'Inherited image not found for editing',
      maxSourceImages,
    );
  } catch (error) {
    logger.warn('[Image Controller] Failed to inherit previous generated image(s)', {
      conversationId,
      responseMessageId,
      fileIds,
      error: error.message,
    });
    return [];
  }

  return inheritedImages;
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
  const images = [];
  for (const part of parts) {
    if (part?.thought === true) {
      continue;
    }

    const hasInlineImage =
      (part?.inlineData?.mimeType?.startsWith('image/') && part.inlineData.data) ||
      (part?.inline_data?.mime_type?.startsWith('image/') && part.inline_data.data);

    if (hasInlineImage) {
      images.push(part);
      continue;
    }

    const imageUrl = extractImageUrlFromText(part?.text);
    if (imageUrl) {
      images.push({ url: imageUrl });
    }
  }
  const outputFormat = getImageOutputFormat(images[0], 'png');

  return {
    created: Date.now(),
    output_format: outputFormat,
    usage: response?.usageMetadata ?? response?.usage_metadata ?? response?.usage,
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
  return addImageTitle(req, {
    text,
    response: responseMessage,
    client,
    endpoint,
  });
}

async function generateOpenAIImage(req, res) {
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
  const isNewConversationRequest =
    !requestConversationId || requestConversationId === Constants.NEW_CONVO;
  const newConvo = !parsedConvo.id && isNewConversationRequest;

  const conversationId = parsedConvo.id ?? requestConversationId ?? crypto.randomUUID();
  const userMessageId = parsedUserMessage.id ?? req.body.messageId ?? crypto.randomUUID();
  const responseMessageId = requestedResponseMessageId ?? `${userMessageId}_`;
  const imageModelOptions = getImageModelOptions(endpointOption);
  const {
    imageSize: configuredImageSize,
    size: configuredSize,
    imageResolution: configuredImageResolution,
    resolution: configuredResolution,
    imageMaxImages: _configuredImageMaxImages,
    sequential_image_generation: _configuredSequentialImageGeneration,
    sequential_image_generation_options: _configuredSequentialImageGenerationOptions,
    n: _configuredN,
    ...providerImageOptions
  } = imageModelOptions;
  const explicitRequestedImageSize =
    req.body.imageSize ?? endpointOption.imageSize ?? endpointOption.size;
  const requestedImageSize =
    explicitRequestedImageSize ?? configuredImageSize ?? configuredSize;
  const requestedImageResolution =
    req.body.imageResolution ??
    endpointOption.imageResolution ??
    configuredImageResolution ??
    configuredResolution;
  const doubaoMaxImages = resolveDoubaoMaxImages({
    endpoint,
    req,
    endpointOption,
    imageModelOptions,
  });
  const doubaoSequentialImageOptions = resolveDoubaoSequentialImageOptions(
    endpoint,
    doubaoMaxImages,
  );
  const requestedGenerationImageSize = resolveProviderImageSize(requestedImageSize, endpoint, {
    imageResolution: requestedImageResolution,
    prompt: text,
  });
  const inheritPreviousImage = parseImageInheritancePreference(
    req.body.inheritPreviousImage ?? endpointOption.inheritPreviousImage,
  );
  const resolvedDoubaoWatermark = resolveDoubaoImageWatermark({
    req,
    endpoint,
    endpointOption,
    imageModelOptions,
  });
  const resolvedImageCount = DEFAULT_MAX_SOURCE_IMAGES;
  const maxSourceImages = getMaxSourceImages(endpoint);
  const resolvedModel = imageModelOptions.model ?? model;
  const providerLabel = getProviderLabel(endpoint);
  let stopImageKeepAlive = () => {};

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
    stopImageKeepAlive = startImageKeepAlive({
      res,
      providerLabel,
      conversationId,
      model: resolvedModel,
    });

    let sourceImages = await resolveSourceImages(req, req.body.files, maxSourceImages);
    if (
      inheritPreviousImage &&
      sourceImages.length === 0 &&
      !newConvo &&
      parentMessageId !== Constants.NO_PARENT
    ) {
      sourceImages = await resolveInheritedSourceImages({
        req,
        conversationId,
        responseMessageId,
        maxSourceImages,
      });
    }
    const operationType = sourceImages.length > 0 ? 'edit' : 'generation';
    const useRequestedSizeForEdit = isExplicitImageSizeSelection(explicitRequestedImageSize);
    const resolvedImageSize =
      operationType === 'edit'
        ? useRequestedSizeForEdit
          ? requestedGenerationImageSize
          : (getEditImageSize({ sourceImages, endpoint }) ?? requestedGenerationImageSize)
        : requestedGenerationImageSize;
    const initializeClient = getInitializeClient(endpoint);
    const imageReverseProxyUrl = resolveImageReverseProxy(endpoint);
    const imageProviderEnvPrefix = resolveImageProviderKeyPrefix(endpoint);
    const imageEndpointOptionBase = imageReverseProxyUrl
      ? { ...endpointOption, reverseProxyUrl: imageReverseProxyUrl }
      : endpointOption;
    const imageEndpointOption = {
      ...imageEndpointOptionBase,
      model_parameters: {
        ...(imageEndpointOptionBase?.model_parameters ?? {}),
        mode: 'image',
      },
      modelOptions: {
        ...(imageEndpointOptionBase?.modelOptions ?? {}),
        mode: 'image',
      },
    };
    const { client } = await initializeClient({
      req,
      res,
      endpointOption: imageEndpointOption,
      overrideModel: resolvedModel,
      providerEnvPrefix: imageProviderEnvPrefix,
      useUserProviderApiKey: false,
    });

    const promptText = text.trim();
    const imageRequest = {
      prompt:
        endpoint === EModelEndpoint.doubao
          ? buildDoubaoImagePrompt({ prompt: promptText, targetImageCount: doubaoMaxImages })
          : promptText,
      model: resolvedModel,
      ...providerImageOptions,
      ...(resolvedDoubaoWatermark != null ? { watermark: resolvedDoubaoWatermark } : {}),
      ...doubaoSequentialImageOptions,
      n: resolvedImageCount,
      size: resolvedImageSize,
    };
    const sendProviderDebug = (type, data) => {
      sendEvent(res, {
        event: 'ai_provider_debug',
        type,
        data,
      });
    };

    const requestImageFromProvider = async (request) =>
      endpoint === EModelEndpoint.openAI && operationType === 'edit'
        ? client.editImage(
            {
              ...request,
              imageFiles: sourceImages,
              onProviderRequest: (data) => sendProviderDebug('request', data),
              onProviderResponse: (data) => sendProviderDebug('response', data),
            },
            req.abortController,
          )
        : client.generateImage(
            {
              ...request,
              ...(sourceImages.length > 0 ? { imageFiles: sourceImages } : {}),
              onProviderRequest: (data) => sendProviderDebug('request', data),
              onProviderResponse: (data) => sendProviderDebug('response', data),
            },
            req.abortController,
          );

    const imageResult = await requestImageFromProvider(imageRequest);
    let normalizedResult = normalizeProviderImageResult({
      endpoint,
      imageResult,
      fallbackText: promptText,
    });

    if (endpoint === EModelEndpoint.doubao && doubaoMaxImages != null) {
      const combinedImages = Array.isArray(normalizedResult?.data)
        ? [...normalizedResult.data]
        : [];

      while (combinedImages.length < doubaoMaxImages) {
        const supplementRequest = {
          ...imageRequest,
          prompt: buildDoubaoImagePrompt({
            prompt: promptText,
            targetImageCount: doubaoMaxImages,
            supplementIndex: combinedImages.length + 1,
          }),
          sequential_image_generation: 'disabled',
        };
        delete supplementRequest.sequential_image_generation_options;

        const supplementResult = await requestImageFromProvider(supplementRequest);
        const normalizedSupplement = normalizeProviderImageResult({
          endpoint,
          imageResult: supplementResult,
          fallbackText: promptText,
        });
        const supplementImages = Array.isArray(normalizedSupplement?.data)
          ? normalizedSupplement.data
          : [];

        if (supplementImages.length === 0) {
          throw new Error(
            `Doubao image generation returned ${combinedImages.length}/${doubaoMaxImages} images`,
          );
        }

        combinedImages.push(...supplementImages);
      }

      normalizedResult = {
        ...normalizedResult,
        data: combinedImages.slice(0, doubaoMaxImages),
      };
    }

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

    for (const [index, item] of images.entries()) {
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
    }

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

    stopImageKeepAlive();
    sendEvent(res, {
      final: true,
      conversation,
      title: conversation.title,
      requestMessage: userMessage,
      responseMessage,
    });

    res.end();

    if (
      !parsedConvo.skipSave &&
      parentMessageId === Constants.NO_PARENT &&
      isNewConversationRequest
    ) {
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
    stopImageKeepAlive();
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
