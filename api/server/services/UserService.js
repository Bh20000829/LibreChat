const { logger } = require('@librechat/data-schemas');
const { encrypt, decrypt } = require('@librechat/api');
const { ErrorTypes } = require('librechat-data-provider');
const { updateUser } = require('~/models');
const { Key } = require('~/db/models');
const mongoose = require('mongoose');

// 简单缓存
const userKeyRoutingCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

const invalidateUserKeyRoutingCache = (userId) => {
  if (!userId) {
    return;
  }
  userKeyRoutingCache.delete(userId.toString());
};

const clearUserKeyRoutingCache = () => {
  userKeyRoutingCache.clear();
};

/**
 * Updates the plugins for a user based on the action specified (install/uninstall).
 * @async
 * @param {Object} user - The user whose plugins are to be updated.
 * @param {string} pluginKey - The key of the plugin to install or uninstall.
 * @param {'install' | 'uninstall'} action - The action to perform, 'install' or 'uninstall'.
 * @returns {Promise<Object>} The result of the update operation.
 * @throws Logs the error internally if the update operation fails.
 * @description This function updates the plugin array of a user document based on the specified action.
 *              It adds a plugin key to the plugins array for an 'install' action, and removes it for an 'uninstall' action.
 */
const updateUserPluginsService = async (user, pluginKey, action) => {
  try {
    const userPlugins = user.plugins || [];
    if (action === 'install') {
      return await updateUser(user._id, { plugins: [...userPlugins, pluginKey] });
    } else if (action === 'uninstall') {
      return await updateUser(user._id, {
        plugins: userPlugins.filter((plugin) => plugin !== pluginKey),
      });
    }
  } catch (err) {
    logger.error('[updateUserPluginsService]', err);
    return err;
  }
};

/**
 * Retrieves and decrypts the key value for a given user identified by userId and identifier name.
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The unique identifier for the user.
 * @param {string} params.name - The name associated with the key.
 * @returns {Promise<string>} The decrypted key value.
 * @throws {Error} Throws an error if the key is not found or if there is a problem during key retrieval.
 * @description This function searches for a user's key in the database using their userId and name.
 *              If found, it decrypts the value of the key and returns it. If no key is found, it throws
 *              an error indicating that there is no user key available.
 */
const getUserKey = async ({ userId, name }) => {
  const keyValue = await Key.findOne({ userId, name }).lean();
  if (!keyValue) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_USER_KEY,
      }),
    );
  }
  return await decrypt(keyValue.value);
};

/**
 * Retrieves, decrypts, and parses the key values for a given user identified by userId and name.
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The unique identifier for the user.
 * @param {string} params.name - The name associated with the key.
 * @returns {Promise<Record<string,string>>} The decrypted and parsed key values.
 * @throws {Error} Throws an error if the key is invalid or if there is a problem during key value parsing.
 * @description This function retrieves a user's encrypted key using their userId and name, decrypts it,
 *              and then attempts to parse the decrypted string into a JSON object. If the parsing fails,
 *              it throws an error indicating that the user key is invalid.
 */
const getUserKeyValues = async ({ userId, name }) => {
  let userValues = await getUserKey({ userId, name });
  try {
    userValues = JSON.parse(userValues);
  } catch (e) {
    logger.error('[getUserKeyValues]', e);
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.INVALID_USER_KEY,
      }),
    );
  }
  return userValues;
};

/**
 * Retrieves the expiry information of a user's key identified by userId and name.
 * @async
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The unique identifier for the user.
 * @param {string} params.name - The name associated with the key.
 * @returns {Promise<{expiresAt: Date | null}>} The expiry date of the key or null if the key doesn't exist.
 * @description This function fetches a user's key from the database using their userId and name and
 *              returns its expiry date. If the key is not found, it returns null for the expiry date.
 */
const getUserKeyExpiry = async ({ userId, name }) => {
  const keyValue = await Key.findOne({ userId, name }).lean();
  if (!keyValue) {
    return { expiresAt: null };
  }
  return { expiresAt: keyValue.expiresAt || 'never' };
};

/**
 * Updates or inserts a new key for a given user identified by userId and name, with a specified value and expiry date.
 * @async
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The unique identifier for the user.
 * @param {string} params.name - The name associated with the key.
 * @param {string} params.value - The value to be encrypted and stored as the key's value.
 * @param {Date} params.expiresAt - The expiry date for the key [optional]
 * @returns {Promise<Object>} The updated or newly inserted key document.
 * @description This function either updates an existing user key or inserts a new one into the database,
 *              after encrypting the provided value. It sets the provided expiry date for the key (or unsets for no expiry).
 */
const updateUserKey = async ({ userId, name, value, expiresAt = null }) => {
  const encryptedValue = await encrypt(value);
  let updateObject = {
    userId,
    name,
    value: encryptedValue,
  };
  const updateQuery = { $set: updateObject };
  // add expiresAt to the update object if it's not null
  if (expiresAt) {
    updateObject.expiresAt = new Date(expiresAt);
  } else {
    // make sure to remove if already present
    updateQuery.$unset = { expiresAt };
  }
  return await Key.findOneAndUpdate({ userId, name }, updateQuery, {
    upsert: true,
    new: true,
  }).lean();
};

/**
 * Deletes a key or all keys for a given user identified by userId, optionally based on a specified name.
 * @async
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The unique identifier for the user.
 * @param {string} [params.name] - The name associated with the key to delete. If not provided and all is true, deletes all keys.
 * @param {boolean} [params.all=false] - Whether to delete all keys for the user.
 * @returns {Promise<Object>} The result of the deletion operation.
 * @description This function deletes a specific key or all keys for a user from the database.
 *              If a name is provided and all is false, it deletes only the key with that name.
 *              If all is true, it ignores the name and deletes all keys for the user.
 */
const deleteUserKey = async ({ userId, name, all = false }) => {
  if (all) {
    return await Key.deleteMany({ userId });
  }

  await Key.findOneAndDelete({ userId, name }).lean();
};

/**
 * Checks if a user key has expired based on the provided expiration date and endpoint.
 * If the key has expired, it throws an Error with details including the type of error, the expiration date, and the endpoint.
 *
 * @param {string} expiresAt - The expiration date of the user key in a format that can be parsed by the Date constructor.
 * @param {string} endpoint - The endpoint associated with the user key to be checked.
 * @throws {Error} Throws an error if the user key has expired. The error message is a stringified JSON object
 * containing the type of error (`ErrorTypes.EXPIRED_USER_KEY`), the expiration date in the local string format, and the endpoint.
 */
const checkUserKeyExpiry = (expiresAt, endpoint) => {
  const expiresAtDate = new Date(expiresAt);
  if (expiresAtDate < new Date()) {
    const errorMessage = JSON.stringify({
      type: ErrorTypes.EXPIRED_USER_KEY,
      expiredAt: expiresAtDate.toLocaleString(),
      endpoint,
    });
    throw new Error(errorMessage);
  }
};

/**
 * 根据 userId（_id）从缓存/数据库获取 key 路由信息
 * 包含 providerApiKey 和 groupType
 */
const getUserKeyRoutingWithCache = async (userId) => {
  const now = Date.now();

  if (!userId) return { providerApiKey: null, groupType: null };

  // 1. 先查缓存
  if (userKeyRoutingCache.has(userId.toString())) {
    const cached = userKeyRoutingCache.get(userId.toString());
    if (now < cached.expiry) {
      return cached.data;
    }
  }

  // 2. 查数据库
  try {
    const User = mongoose.model('User');
    const user = await User.findById(userId).select('groupType providerApiKey').lean();

    const groupType = user?.groupType ?? null;
    const providerApiKey =
      typeof user?.providerApiKey === 'string' && user.providerApiKey.trim().length > 0
        ? user.providerApiKey.trim()
        : null;

    const data = {
      providerApiKey,
      groupType,
    };

    // 3. 写入缓存
    userKeyRoutingCache.set(userId.toString(), {
      data,
      expiry: now + CACHE_TTL,
    });

    return data;
  } catch (err) {
    console.error('[GroupTypeCache] Error:', err);
    return { providerApiKey: null, groupType: null };
  }
};

/**
 * 根据 userId（_id）从缓存/数据库获取 groupType
 */
const getGroupTypeWithCache = async (userId) => {
  const data = await getUserKeyRoutingWithCache(userId);
  return data.groupType;
};

/**
 * 根据 userId（_id）从缓存/数据库获取 providerApiKey
 */
const getProviderApiKeyWithCache = async (userId) => {
  const data = await getUserKeyRoutingWithCache(userId);
  return data.providerApiKey;
};

/**
 * 通用函数：根据 Provider 前缀 + groupType，拼出对应的环境变量并返回 Key
 * e.g.
 *   providerEnvPrefix: 'OPENAI_API_KEY'
 *   groupType: 'VIP'
 *   => 读取 process.env.OPENAI_API_KEY_VIP
 */
const getKeyByGroupTypeAndPrefix = (groupType, providerEnvPrefix)  => {
  if (!groupType || !providerEnvPrefix) return null;

  const envKey = `${providerEnvPrefix}_${groupType}`;
  const apiKey = process.env[envKey];

  if (!apiKey) {
    // 这里按需决定要不要打日志
    console.warn(`[GroupTypeKey] No key found for env: ${envKey}`);
    return null;
  }

  return { apiKey, envKey };
};

/**
 * 高阶封装：给任意 Provider 使用
 * @param {Object} options
 * @param {Object} options.user - req.user 对象
 * @param {string} options.providerEnvPrefix - Provider 的环境变量前缀，如 'OPENAI_API_KEY'、'GOOGLE_KEY'
 * @returns {Promise<{ apiKey: string, groupType: string, envKey: string } | null>}
 */
const getProviderKeyForUserGroup = async ({ user, providerEnvPrefix }) => {
  if (!user) return null;

  // 如果你想支持“直接用 req.user.groupType，不再查库”，可以在这里做分支
  const userId = user._id || user.id;
  if (!userId) return null;

  const { groupType } = await getUserKeyRoutingWithCache(userId);
  if (!groupType) return null;

  const result = getKeyByGroupTypeAndPrefix(groupType, providerEnvPrefix);
  if (!result) return null;

  return {
    apiKey: result.apiKey,
    groupType,
    envKey: result.envKey,
  };
};

/**
 * 统一选择 provider key：用户 key > 分组 key > 默认 key
 * @param {Object} options
 * @param {Object} options.user - req.user
 * @param {string} options.providerEnvPrefix - 环境变量前缀，例如 OPENAI_API_KEY
 * @param {string | undefined | null} options.defaultApiKey - 默认环境变量 key
 * @param {boolean} [options.useUserProviderApiKey=true] - Whether to prioritize user-level providerApiKey.
 * @returns {Promise<{apiKey: string | undefined | null, source: 'user' | 'group' | 'default', groupType?: number | null, envKey?: string | null}>}
 */
const resolveProviderApiKeyForUser = async ({
  user,
  providerEnvPrefix,
  defaultApiKey,
  useUserProviderApiKey = true,
}) => {
  if (!user) {
    return {
      apiKey: defaultApiKey,
      source: 'default',
      groupType: null,
      envKey: null,
    };
  }

  const userId = user._id || user.id;
  if (!userId) {
    return {
      apiKey: defaultApiKey,
      source: 'default',
      groupType: null,
      envKey: null,
    };
  }

  const { providerApiKey, groupType } = await getUserKeyRoutingWithCache(userId);

  if (useUserProviderApiKey && providerApiKey) {
    return {
      apiKey: providerApiKey,
      source: 'user',
      groupType,
      envKey: null,
    };
  }

  const groupKey = getKeyByGroupTypeAndPrefix(groupType, providerEnvPrefix);
  if (groupKey?.apiKey) {
    return {
      apiKey: groupKey.apiKey,
      source: 'group',
      groupType,
      envKey: groupKey.envKey,
    };
  }

  return {
    apiKey: defaultApiKey,
    source: 'default',
    groupType,
    envKey: null,
  };
};

module.exports = {
  getUserKey,
  updateUserKey,
  deleteUserKey,
  getUserKeyValues,
  getUserKeyExpiry,
  checkUserKeyExpiry,
  updateUserPluginsService,
  getUserKeyRoutingWithCache,
  getGroupTypeWithCache,
  getProviderApiKeyWithCache,
  getKeyByGroupTypeAndPrefix,
  getProviderKeyForUserGroup,
  resolveProviderApiKeyForUser,
  invalidateUserKeyRoutingCache,
  clearUserKeyRoutingCache,
};
