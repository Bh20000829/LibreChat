const { isEnabled } = require('@librechat/api');
const { EModelEndpoint, CacheKeys, Constants, googleSettings } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const initializeClient = require('./initialize');
const { saveConvo } = require('~/models');

const DEFAULT_TITLE_PROMPT =
  'Generate a concise conversation title in 3 to 8 words. Reply with the title only.';

function buildTitleRequest({ text, responseText, titlePrompt, titlePromptTemplate }) {
  const conversation = `||>User:\n"${text}"\n||>Response:\n"${JSON.stringify(responseText ?? '')}"`;

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

const addTitle = async (req, { text, response, client }) => {
  const { TITLE_CONVO = 'true' } = process.env ?? {};
  if (!isEnabled(TITLE_CONVO)) {
    return;
  }

  if (client.options.titleConvo === false) {
    return;
  }
  const { GOOGLE_TITLE_MODEL } = process.env ?? {};
  const appConfig = req.config;
  const providerConfig = appConfig.endpoints?.[EModelEndpoint.google];
  let model =
    providerConfig?.titleModel ??
    GOOGLE_TITLE_MODEL ??
    client.options?.titleModel ??
    googleSettings.model.default ??
    client.options?.modelOptions.model;

  if (GOOGLE_TITLE_MODEL === Constants.CURRENT_MODEL) {
    model = client.options?.modelOptions.model;
  }

  const titleEndpointOptions = {
    ...client.options,
    modelOptions: { ...client.options?.modelOptions, model: model },
    attachments: undefined, // After a response, this is set to an empty array which results in an error during setOptions
  };

  const { client: titleClient } = await initializeClient({
    req,
    res: response,
    endpointOption: titleEndpointOptions,
  });

  const titleCache = getLogStores(CacheKeys.GEN_TITLE);
  const key = `${req.user.id}-${response.conversationId}`;

  const titleRequest = buildTitleRequest({
    text,
    responseText: response?.text ?? '',
    titlePrompt: providerConfig?.titlePrompt,
    titlePromptTemplate: providerConfig?.titlePromptTemplate,
  });

  const generatedTitle = normalizeTitle(
    await titleClient.chatCompletion({
      payload: [{ role: 'user', content: titleRequest }],
      onProgress: () => {},
      abortController: new AbortController(),
    }),
  );

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
    { context: 'api/server/services/Endpoints/google/addTitle.js' },
  );
};

module.exports = addTitle;
