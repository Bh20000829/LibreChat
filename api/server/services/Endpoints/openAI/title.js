const { isEnabled } = require('@librechat/api');
const { CacheKeys, Constants, EModelEndpoint } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const { saveConvo } = require('~/models');
const initializeClient = require('./initialize');
const { truncateText } = require('~/app/clients/prompts');

const DEFAULT_TITLE_PROMPT =
  'Generate a concise conversation title in 3 to 8 words. Reply with the title only.';

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

  const normalized = title.split('\n')[0].trim().replace(/^['"\s]+|['"\s]+$/g, '');
  return normalized || null;
}

const addTitle = async (req, { text, response, client }) => {
  const { TITLE_CONVO = 'true' } = process.env ?? {};
  if (!isEnabled(TITLE_CONVO)) {
    return;
  }

  if (client.options.titleConvo === false) {
    return;
  }

  const { OPENAI_TITLE_MODEL } = process.env ?? {};
  const providerConfig = req.config?.endpoints?.[EModelEndpoint.openAI] ?? {};
  let model =
    providerConfig.titleModel ??
    OPENAI_TITLE_MODEL ??
    client.options?.titleModel ??
    client.options?.modelOptions?.model ??
    'gpt-4o-mini';

  if (model === Constants.CURRENT_MODEL) {
    model = client.options?.modelOptions?.model ?? model;
  }

  const titleEndpointOptions = {
    ...client.options,
    model_parameters: {
      ...(client.options?.modelOptions ?? {}),
      model,
    },
    attachments: undefined,
  };

  const { client: titleClient } = await initializeClient({
    req,
    res: response,
    endpointOption: titleEndpointOptions,
    overrideEndpoint: EModelEndpoint.openAI,
    overrideModel: model,
  });

  const titleRequest = buildTitleRequest({
    text,
    responseText: response?.text ?? '',
    titlePrompt: providerConfig.titlePrompt,
    titlePromptTemplate: providerConfig.titlePromptTemplate,
  });

  const titleCache = getLogStores(CacheKeys.GEN_TITLE);
  const key = `${req.user.id}-${response.conversationId}`;

  const title = normalizeTitle(
    await titleClient.chatCompletion({
      payload: [{ role: 'user', content: titleRequest }],
      onProgress: () => {},
      abortController: new AbortController(),
    }),
  );

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
    { context: 'api/server/services/Endpoints/openAI/addTitle.js' },
  );
};

module.exports = addTitle;
