const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');

function filterEmptyImageProviders(modelConfig, mode) {
  if (mode !== 'image' || !modelConfig || typeof modelConfig !== 'object') {
    return modelConfig;
  }

  return Object.fromEntries(
    Object.entries(modelConfig).filter(([, models]) => Array.isArray(models) && models.length > 0),
  );
}

/**
 * @param {ServerRequest} req
 * @returns {Promise<TModelsConfig>} The models config.
 */
const getModelsConfig = async (req) => {
  const mode = req.query?.mode === 'image' ? 'image' : 'chat';
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cacheKey = `${CacheKeys.MODELS_CONFIG}:${mode}`;
  let modelsConfig = await cache.get(cacheKey);
  if (!modelsConfig) {
    modelsConfig = await loadModels(req);
  }

  return modelsConfig;
};

/**
 * Loads the models from the config.
 * @param {ServerRequest} req - The Express request object.
 * @returns {Promise<TModelsConfig>} The models config.
 */
async function loadModels(req) {
  const mode = req.query?.mode === 'image' ? 'image' : 'chat';
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cacheKey = `${CacheKeys.MODELS_CONFIG}:${mode}`;
  const cachedModelsConfig = await cache.get(cacheKey);
  if (cachedModelsConfig) {
    return cachedModelsConfig;
  }
  const defaultModelsConfig = await loadDefaultModels(req);
  const customModelsConfig = await loadConfigModels(req);

  const modelConfig = filterEmptyImageProviders(
    { ...defaultModelsConfig, ...customModelsConfig },
    mode,
  );

  await cache.set(cacheKey, modelConfig);
  return modelConfig;
}

async function modelController(req, res) {
  try {
    const modelConfig = await loadModels(req);
    res.send(modelConfig);
  } catch (error) {
    logger.error('Error fetching models:', error);
    res.status(500).send({ error: error.message });
  }
}

module.exports = { modelController, loadModels, getModelsConfig, filterEmptyImageProviders };
