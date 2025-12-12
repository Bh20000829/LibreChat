const {
  resolveHeaders,
  isUserProvided,
  getOpenAIConfig,
  getCustomEndpointConfig,
} = require('@librechat/api');
const {
  CacheKeys,
  ErrorTypes,
  envVarRegex,
  FetchTokenConfig,
  extractEnvVariable,
} = require('librechat-data-provider');
const { getUserKeyValues, checkUserKeyExpiry } = require('~/server/services/UserService');
const { fetchModels } = require('~/server/services/ModelService');
const OpenAIClient = require('~/app/clients/OpenAIClient');
const getLogStores = require('~/cache/getLogStores');
const {
  getGroupTypeWithCache,
  getKeyByGroupTypeAndPrefix,
} = require('~/server/services/UserService');

const { PROXY } = process.env;

const initializeClient = async ({ req, res, endpointOption, optionsOnly, overrideEndpoint }) => {
  const appConfig = req.config;
  const { key: expiresAt } = req.body;
  const endpoint = overrideEndpoint ?? req.body.endpoint;

  const endpointConfig = getCustomEndpointConfig({
    endpoint,
    appConfig,
  });
  if (!endpointConfig) {
    throw new Error(`Config not found for the ${endpoint} custom endpoint.`);
  }

  const CUSTOM_API_KEY = extractEnvVariable(endpointConfig.apiKey);
  const CUSTOM_BASE_URL = extractEnvVariable(endpointConfig.baseURL);

  /** Intentionally excludes passing `body`, i.e. `req.body`, as
   *  values may not be accurate until `AgentClient` is initialized
   */
  let resolvedHeaders = resolveHeaders({
    headers: endpointConfig.headers,
    user: req.user,
  });

  if (CUSTOM_API_KEY.match(envVarRegex)) {
    throw new Error(`Missing API Key for ${endpoint}.`);
  }

  if (CUSTOM_BASE_URL.match(envVarRegex)) {
    throw new Error(`Missing Base URL for ${endpoint}.`);
  }

  const userProvidesKey = isUserProvided(CUSTOM_API_KEY);
  const userProvidesURL = isUserProvided(CUSTOM_BASE_URL);

  let userValues = null;
  if (expiresAt && (userProvidesKey || userProvidesURL)) {
    checkUserKeyExpiry(expiresAt, endpoint);
    userValues = await getUserKeyValues({ userId: req.user.id, name: endpoint });
  }

  // ==== ★★ 这里加入 groupType 动态 key 逻辑（仅在不是 user_provided 时）★★ ====
  let effectiveApiKey = CUSTOM_API_KEY;

  if (!userProvidesKey && req.user) {
    // 从用户表或缓存中获取 groupType
    const groupType = await getGroupTypeWithCache(req.user._id || req.user.id);
    if (groupType) {
      /**
       * 约定使用法：
       *   - endpointConfig.apiKey 在配置里写的是一个 env 变量名，比如 'MYAPI_KEY'
       *   - extractEnvVariable(endpointConfig.apiKey) 读取的是 process.env.MYAPI_KEY 的值
       *   - 我们这里希望基于 'MYAPI_KEY' 这个前缀，去查 'MYAPI_KEY_${groupType}'
       *
       * 因此要从 endpointConfig.apiKey 里取得前缀名：
       */
      const apiKeyEnvName = endpointConfig.apiKey.replace(/^\${?(.+?)}?$/, '$1'); // 比如 'MYAPI_KEY'
      const keyInfo = getKeyByGroupTypeAndPrefix(groupType, apiKeyEnvName);

      if (keyInfo && keyInfo.apiKey) {
        effectiveApiKey = keyInfo.apiKey;

        console.log(
          `===============[KeySwitch-Custom] Endpoint: ${endpoint}, User: ${
            req.user.id || req.user._id
          }, ` +
            `Type: ${groupType}, Env: ${keyInfo.envKey}, ` +
            `KeyPrefix: ${keyInfo.apiKey}`,
        );
      }
    }
  }
  // =====================================================================

  let apiKey = userProvidesKey ? userValues?.apiKey : effectiveApiKey;
  let baseURL = userProvidesURL ? userValues?.baseURL : CUSTOM_BASE_URL;

  if (userProvidesKey & !apiKey) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_USER_KEY,
      }),
    );
  }

  if (userProvidesURL && !baseURL) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_BASE_URL,
      }),
    );
  }

  if (!apiKey) {
    throw new Error(`${endpoint} API key not provided.`);
  }

  if (!baseURL) {
    throw new Error(`${endpoint} Base URL not provided.`);
  }

  const cache = getLogStores(CacheKeys.TOKEN_CONFIG);
  const tokenKey =
    !endpointConfig.tokenConfig && (userProvidesKey || userProvidesURL)
      ? `${endpoint}:${req.user.id}`
      : endpoint;

  let endpointTokenConfig =
    !endpointConfig.tokenConfig &&
    FetchTokenConfig[endpoint.toLowerCase()] &&
    (await cache.get(tokenKey));

  if (
    FetchTokenConfig[endpoint.toLowerCase()] &&
    endpointConfig &&
    endpointConfig.models.fetch &&
    !endpointTokenConfig
  ) {
    await fetchModels({ apiKey, baseURL, name: endpoint, user: req.user.id, tokenKey });
    endpointTokenConfig = await cache.get(tokenKey);
  }

  const customOptions = {
    headers: resolvedHeaders,
    addParams: endpointConfig.addParams,
    dropParams: endpointConfig.dropParams,
    customParams: endpointConfig.customParams,
    titleConvo: endpointConfig.titleConvo,
    titleModel: endpointConfig.titleModel,
    forcePrompt: endpointConfig.forcePrompt,
    summaryModel: endpointConfig.summaryModel,
    modelDisplayLabel: endpointConfig.modelDisplayLabel,
    titleMethod: endpointConfig.titleMethod ?? 'completion',
    contextStrategy: endpointConfig.summarize ? 'summarize' : null,
    directEndpoint: endpointConfig.directEndpoint,
    titleMessageRole: endpointConfig.titleMessageRole,
    streamRate: endpointConfig.streamRate,
    endpointTokenConfig,
  };

  const allConfig = appConfig.endpoints?.all;
  if (allConfig) {
    customOptions.streamRate = allConfig.streamRate;
  }

  let clientOptions = {
    reverseProxyUrl: baseURL ?? null,
    proxy: PROXY ?? null,
    req,
    res,
    ...customOptions,
    ...endpointOption,
  };

  if (optionsOnly) {
    const modelOptions = endpointOption?.model_parameters ?? {};
    clientOptions = Object.assign(
      {
        modelOptions,
      },
      clientOptions,
    );
    clientOptions.modelOptions.user = req.user.id;
    const options = getOpenAIConfig(apiKey, clientOptions, endpoint);
    if (options != null) {
      options.useLegacyContent = true;
      options.endpointTokenConfig = endpointTokenConfig;
    }
    if (!clientOptions.streamRate) {
      return options;
    }
    options.llmConfig._lc_stream_delay = clientOptions.streamRate;
    return options;
  }

  const client = new OpenAIClient(apiKey, clientOptions);
  return {
    client,
    openAIApiKey: apiKey,
  };
};

module.exports = initializeClient;
