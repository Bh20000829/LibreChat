const path = require('path');
const { EModelEndpoint, AuthKeys } = require('librechat-data-provider');
const { getGoogleConfig, isEnabled, loadServiceKey } = require('@librechat/api');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const { GoogleClient } = require('~/app');
const { getProviderKeyForUserGroup } = require('~/server/services/UserService');

const initializeClient = async ({ req, res, endpointOption, overrideModel, optionsOnly }) => {
  const { GOOGLE_KEY, GOOGLE_REVERSE_PROXY, GOOGLE_AUTH_HEADER, PROXY } = process.env;
  const isUserProvided = GOOGLE_KEY === 'user_provided';
  const { key: expiresAt } = req.body;

  let userKey = null;
  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(expiresAt, EModelEndpoint.google);
    userKey = await getUserKey({ userId: req.user.id, name: EModelEndpoint.google });
  }

  let serviceKey = {};

  /** Check if GOOGLE_KEY is provided at all (including 'user_provided') */
  const isGoogleKeyProvided =
    (GOOGLE_KEY && GOOGLE_KEY.trim() !== '') || (isUserProvided && userKey != null);

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

  // ========== ★★ 新增：按 groupType 动态选择 GOOGLE_KEY_{groupType} ★★ ==========
  let effectiveGoogleKey = GOOGLE_KEY;

  // 只有在不是用户自带 key、且有 req.user 时才按 groupType 切换
  if (!isUserProvided && req.user) {
    const keyInfo = await getProviderKeyForUserGroup({
      user: req.user,
      providerEnvPrefix: 'GOOGLE_KEY',
    });

    if (keyInfo && keyInfo.apiKey) {
      effectiveGoogleKey = keyInfo.apiKey;
      console.log(
        `===============[GOOGLE_KEY] User: ${req.user.id || req.user._id}, ` +
          `Type: ${keyInfo.groupType}, Env: ${keyInfo.envKey}, ` +
          `KeyPrefix: ${keyInfo.apiKey}`,
      );
    }
  };
  // ================================================================

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
  };

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
