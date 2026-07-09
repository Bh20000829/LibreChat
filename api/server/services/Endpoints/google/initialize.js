const path = require('path');
const { EModelEndpoint, AuthKeys } = require('librechat-data-provider');
const { getGoogleConfig, isEnabled, loadServiceKey } = require('@librechat/api');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const { GoogleClient } = require('~/app');
const { resolveProviderApiKeyForUser } = require('~/server/services/UserService');

const initializeClient = async ({
  req,
  res,
  endpointOption,
  overrideModel,
  optionsOnly,
  providerEnvPrefix,
  useUserProviderApiKey,
}) => {
  const { GOOGLE_KEY, GOOGLE_REVERSE_PROXY, GOOGLE_AUTH_HEADER, PROXY } = process.env;
  const selectedProviderEnvPrefix = providerEnvPrefix ?? 'GOOGLE_KEY';
  const prefixedDefaultGoogleKey = process.env[selectedProviderEnvPrefix];
  const isUserProvided = (prefixedDefaultGoogleKey ?? GOOGLE_KEY) === 'user_provided';
  const { key: expiresAt } = req.body;

  let userKey = null;
  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(expiresAt, EModelEndpoint.google);
    userKey = await getUserKey({ userId: req.user.id, name: EModelEndpoint.google });
  }

  let serviceKey = {};

  let effectiveGoogleKey = prefixedDefaultGoogleKey ?? GOOGLE_KEY;

  /** Check if a google key is provided at all (including 'user_provided') */
  const isGoogleKeyProvided =
    (effectiveGoogleKey && effectiveGoogleKey.trim() !== '') || (isUserProvided && userKey != null);

  if (!isGoogleKeyProvided) {
    /** Only attempt to load service key if GOOGLE_KEY is not provided */
    try {
      const serviceKeyPath =
        process.env.GOOGLE_SERVICE_KEY_FILE ||
        path.join(__dirname, '../../../..', 'data', 'auth.json');
      serviceKey = await loadServiceKey(serviceKeyPath);
      if (!serviceKey) {
        serviceKey = {};
      }
    } catch (_e) {
      // Service key loading failed, but that's okay if not required
      serviceKey = {};
    }
  }

  if (!isUserProvided && req.user) {
    const routing = await resolveProviderApiKeyForUser({
      user: req.user,
      providerEnvPrefix: selectedProviderEnvPrefix,
      defaultApiKey: effectiveGoogleKey,
      useUserProviderApiKey,
    });

    effectiveGoogleKey = routing.apiKey;
  }

  const credentials = isUserProvided
    ? userKey
    : {
        [AuthKeys.GOOGLE_SERVICE_KEY]: serviceKey,
        [AuthKeys.GOOGLE_API_KEY]: effectiveGoogleKey,
      };

  let clientOptions = {};

  const appConfig = req.config;
  /** @type {undefined | TBaseEndpoint} */
  const allConfig = appConfig.endpoints?.all;
  /** @type {undefined | TBaseEndpoint} */
  const googleConfig = appConfig.endpoints?.[EModelEndpoint.google];

  if (googleConfig) {
    clientOptions.streamRate = googleConfig.streamRate;
    clientOptions.titleModel = googleConfig.titleModel;
  }

  if (allConfig) {
    clientOptions.streamRate = allConfig.streamRate;
  }

  clientOptions = {
    req,
    res,
    reverseProxyUrl: GOOGLE_REVERSE_PROXY ?? null,
    authHeader: isEnabled(GOOGLE_AUTH_HEADER) ?? null,
    proxy: PROXY ?? null,
    ...clientOptions,
    ...endpointOption,
    modelOptions: {
      ...(endpointOption?.modelOptions ?? {}),
      ...(endpointOption?.model_parameters ?? {}),
    },
  };

  if (overrideModel) {
    clientOptions.modelOptions.model = overrideModel;
  }

  if (optionsOnly) {
    clientOptions = Object.assign(
      {
        modelOptions: endpointOption?.model_parameters ?? {},
      },
      clientOptions,
    );
    if (overrideModel) {
      clientOptions.modelOptions.model = overrideModel;
    }
    return getGoogleConfig(credentials, clientOptions);
  }

  const client = new GoogleClient(credentials, clientOptions);

  return {
    client,
    credentials,
  };
};

module.exports = initializeClient;
