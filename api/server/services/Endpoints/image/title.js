const { isEnabled } = require('@librechat/api');
const { CacheKeys, Constants, EModelEndpoint, googleSettings } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const { saveConvo } = require('~/models');
const initializeOpenAIClient = require('~/server/services/Endpoints/openAI/initialize');
const initializeGoogleClient = require('~/server/services/Endpoints/google/initialize');
const { truncateText } = require('~/app/clients/prompts');

const DEFAULT_TITLE_PROMPT =
  'Generate a concise conversation title in 3 to 8 words. Reply with the title only.';

const TITLE_INITIALIZERS = {
  [EModelEndpoint.openAI]: initializeOpenAIClient,
  [EModelEndpoint.google]: initializeGoogleClient,
};

const TITLE_MODEL_ENV_KEYS = {
  [EModelEndpoint.openAI]: 'OPENAI_TITLE_MODEL',
  [EModelEndpoint.google]: 'GOOGLE_TITLE_MODEL',
};

const TITLE_MODEL_DEFAULTS = {
  [EModelEndpoint.openAI]: 'gpt-4o-mini',
  [EModelEndpoint.google]: googleSettings.model.default,
};

function getEndpointConfig(req, endpoint) {
  const endpoints = req?.config?.endpoints ?? {};
  return {
    ...(endpoints.all ?? {}),
    ...(endpoints[endpoint] ?? {}),
  };
}

function getPresetModel(preset) {
  if (!preset || typeof preset !== 'object') {
    return null;
  }

  return preset.model ?? preset.model_parameters?.model ?? preset.modelOptions?.model ?? null;
}

function getCurrentSpec(req, currentSpecName) {
  const specs = req?.config?.modelSpecs?.list;
  if (!Array.isArray(specs) || !currentSpecName || typeof currentSpecName !== 'string') {
    return null;
  }

  return specs.find((spec) => spec?.name === currentSpecName) ?? null;
}

function resolveFirstChatModelBySpec({ req, titleEndpoint, currentSpecName }) {
  const specs = req?.config?.modelSpecs?.list;
  if (!Array.isArray(specs) || specs.length === 0) {
    return null;
  }

  const currentSpec = getCurrentSpec(req, currentSpecName);
  const currentGroup = currentSpec?.group;
  const chatSpecs = specs.filter((spec) => {
    const preset = spec?.preset;
    if (!preset || preset.endpoint !== titleEndpoint) {
      return false;
    }

    const mode = preset.mode ?? 'chat';
    return mode === 'chat';
  });

  if (chatSpecs.length === 0) {
    return null;
  }

  const orderedSpecs = currentGroup
    ? [
        ...chatSpecs.filter((spec) => spec?.group === currentGroup),
        ...chatSpecs.filter((spec) => spec?.group !== currentGroup),
      ]
    : chatSpecs;

  for (const spec of orderedSpecs) {
    const model = getPresetModel(spec?.preset);
    if (typeof model === 'string' && model.length > 0) {
      return model;
    }
  }

  return null;
}

function isLikelyImageModel(model) {
  if (!model || typeof model !== 'string') {
    return false;
  }

  return /(image|dall-e|gpt-image|seedream)/i.test(model);
}

function resolveTitleEndpoint({ req, sourceEndpoint, forcedTitleEndpoint }) {
  const configuredEndpoint =
    forcedTitleEndpoint ??
    process.env.IMAGE_TITLE_ENDPOINT ??
    getEndpointConfig(req, sourceEndpoint).titleEndpoint;

  if (configuredEndpoint && TITLE_INITIALIZERS[configuredEndpoint]) {
    return configuredEndpoint;
  }

  if (TITLE_INITIALIZERS[sourceEndpoint]) {
    return sourceEndpoint;
  }

  if (process.env.OPENAI_API_KEY || req?.config?.endpoints?.[EModelEndpoint.openAI]) {
    return EModelEndpoint.openAI;
  }

  if (process.env.GOOGLE_KEY || req?.config?.endpoints?.[EModelEndpoint.google]) {
    return EModelEndpoint.google;
  }

  return null;
}

function resolveTitleModel({ req, client, sourceEndpoint, titleEndpoint }) {
  const sourceConfig = getEndpointConfig(req, sourceEndpoint);
  const titleConfig = getEndpointConfig(req, titleEndpoint);
  const titleEnvKey = TITLE_MODEL_ENV_KEYS[titleEndpoint];
  const currentSpecName = client?.options?.spec ?? req.body?.spec;
  const chatModelFromSpecs = resolveFirstChatModelBySpec({
    req,
    titleEndpoint,
    currentSpecName,
  });
  const currentModel = client?.options?.modelOptions?.model;
  const safeCurrentModel =
    titleEndpoint === sourceEndpoint && !isLikelyImageModel(currentModel) ? currentModel : null;

  let model =
    sourceConfig.titleModel ??
    process.env.IMAGE_TITLE_MODEL ??
    titleConfig.titleModel ??
    (titleEnvKey ? process.env[titleEnvKey] : null) ??
    chatModelFromSpecs ??
    client?.options?.titleModel ??
    safeCurrentModel ??
    TITLE_MODEL_DEFAULTS[titleEndpoint];

  if (model === Constants.CURRENT_MODEL) {
    model = safeCurrentModel ?? chatModelFromSpecs ?? TITLE_MODEL_DEFAULTS[titleEndpoint];
  }

  return model;
}

function buildTitleRequest({ text, responseText, titlePrompt, titlePromptTemplate }) {
  const conversation = `||>User:\n"${truncateText(text)}"\n||>Response:\n"${JSON.stringify(
    truncateText(responseText ?? ''),
  )}"`;

  const prompt = titlePrompt ?? DEFAULT_TITLE_PROMPT;
  const template = titlePromptTemplate ?? '{{conversation}}';
  return `${prompt}\n\n${template.replace('{{conversation}}', conversation)}`;
}

function normalizeTitle(title) {
  if (!title || typeof title !== 'string') {
    return null;
  }

  const lines = title
    .split('\n')
    .map((line) => line.replace(/[*_`#>]+/g, '').trim())
    .filter(Boolean);

  const preferredLine =
    lines.find((line) => !/[.:!?]$/.test(line) && line.split(/\s+/).length <= 12) ?? lines[0];
  const normalized = preferredLine?.replace(/^['"\s]+|['"\s]+$/g, '') ?? '';
  return normalized || null;
}

function buildFallbackTitle(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/^['"\s]+|['"\s]+$/g, '')
    .trim();

  if (!normalized) {
    return null;
  }

  if (/\s/.test(normalized)) {
    return normalized.split(' ').filter(Boolean).slice(0, 8).join(' ');
  }

  return normalized.slice(0, 24).trim();
}

function getTitleModelOptions(modelOptions, model) {
  const {
    mode: _ignoredMode,
    size: _ignoredSize,
    image: _ignoredImage,
    images: _ignoredImages,
    imageFiles: _ignoredImageFiles,
    output_format: _ignoredOutputFormat,
    response_format: _ignoredResponseFormat,
    quality: _ignoredQuality,
    n: _ignoredN,
    seed: _ignoredSeed,
    guidance_scale: _ignoredGuidanceScale,
    watermark: _ignoredWatermark,
    ...rest
  } = modelOptions ?? {};

  return {
    ...rest,
    model,
  };
}

async function addImageTitle(
  req,
  { text, response, client, endpoint, titleEndpoint: forcedTitleEndpoint },
) {
  const { TITLE_CONVO = 'true' } = process.env ?? {};
  if (!isEnabled(TITLE_CONVO)) {
    return;
  }

  const sourceEndpoint = endpoint ?? response?.endpoint ?? req.body?.endpoint;
  const sourceConfig = getEndpointConfig(req, sourceEndpoint);

  if (sourceConfig.titleConvo === false || client?.options?.titleConvo === false) {
    return;
  }

  const titleEndpoint = resolveTitleEndpoint({
    req,
    sourceEndpoint,
    forcedTitleEndpoint,
  });

  if (!titleEndpoint) {
    return;
  }

  const initializeClient = TITLE_INITIALIZERS[titleEndpoint];
  const model = resolveTitleModel({
    req,
    client,
    sourceEndpoint,
    titleEndpoint,
  });

  if (!model) {
    return;
  }

  const { reverseProxyUrl: _ignoredReverseProxyUrl, ...titleBaseOptions } = client?.options ?? {};
  const titleModelOptions = getTitleModelOptions(client?.options?.modelOptions, model);
  const titleEndpointOptions = {
    ...titleBaseOptions,
    model_parameters: titleModelOptions,
    modelOptions: titleModelOptions,
    attachments: undefined,
  };

  const initializeParams = {
    req,
    res: response,
    endpointOption: titleEndpointOptions,
    overrideModel: model,
  };

  if (titleEndpoint === EModelEndpoint.openAI) {
    initializeParams.overrideEndpoint = EModelEndpoint.openAI;
  }

  const { client: titleClient } = await initializeClient(initializeParams);
  titleClient.user = req.user?.id;
  titleClient.conversationId = response?.conversationId ?? req.body?.conversationId;
  titleClient.responseMessageId = response?.messageId ?? req.body?.responseMessageId;

  const titleConfig = getEndpointConfig(req, titleEndpoint);
  const titleRequest = buildTitleRequest({
    text,
    responseText: response?.text ?? '',
    titlePrompt: sourceConfig.titlePrompt ?? titleConfig.titlePrompt,
    titlePromptTemplate: sourceConfig.titlePromptTemplate ?? titleConfig.titlePromptTemplate,
  });

  const titleCache = getLogStores(CacheKeys.GEN_TITLE);
  const key = `${req.user.id}-${response.conversationId}`;
  const generatedTitle = normalizeTitle(
    await titleClient.chatCompletion({
      payload: [{ role: 'user', content: titleRequest }],
      onProgress: () => {},
      abortController: new AbortController(),
    }),
  );

  const usage =
    typeof titleClient.getStreamUsage === 'function' ? titleClient.getStreamUsage() : null;
  const promptTokens = Number(
    usage?.prompt_tokens ??
      usage?.input_tokens ??
      usage?.promptTokenCount ??
      usage?.prompt_token_count,
  );
  const completionTokens = Number(
    usage?.completion_tokens ??
      usage?.output_tokens ??
      usage?.candidatesTokenCount ??
      usage?.candidates_token_count,
  );

  if (
    typeof titleClient.recordTokenUsage === 'function' &&
    Number.isFinite(promptTokens) &&
    Number.isFinite(completionTokens)
  ) {
    await titleClient.recordTokenUsage({
      model,
      usage,
      promptTokens,
      completionTokens,
      context: 'title',
    });
  }

  const title = generatedTitle ?? buildFallbackTitle(text);
  if (!title) {
    return;
  }

  await titleCache.set(key, title, 120000);
  await saveConvo(
    req,
    {
      conversationId: response.conversationId,
      title,
    },
    { context: 'api/server/services/Endpoints/image/title.js' },
  );
}

module.exports = addImageTitle;
