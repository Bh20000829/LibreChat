const ModelPricing = require('~/models/ModelPricing');
const { getMultiplier, getCacheMultiplier } = require('./tx');

const TOKENS_PER_MILLION = 1000000;

const getUsdToCnyRate = () => {
  const parsed = Number(process.env.USD_TO_CNY_RATE);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
};

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value) =>
  Math.round((safeNumber(value) + Number.EPSILON) * 100000000) / 100000000;

const getEffectivePricing = async ({ model, endpoint, valueKey, endpointTokenConfig }) => {
  const modelName = typeof model === 'string' ? model.trim() : '';

  if (modelName) {
    const custom = await ModelPricing.findOne({ modelName })
      .select('inputPrice cachePrice outputPrice multiplier')
      .lean();

    if (custom) {
      return {
        inputPriceUsdPer1M: safeNumber(custom.inputPrice),
        cachePriceUsdPer1M: safeNumber(custom.cachePrice),
        outputPriceUsdPer1M: safeNumber(custom.outputPrice),
        multiplier: Math.max(safeNumber(custom.multiplier), 0),
      };
    }
  }

  const promptRate = safeNumber(
    getMultiplier({ valueKey, tokenType: 'prompt', model, endpoint, endpointTokenConfig }),
  );
  const cacheWriteRate = safeNumber(
    getCacheMultiplier({ valueKey, cacheType: 'write', model, endpoint, endpointTokenConfig }) ??
      promptRate,
  );
  const cacheReadRate = safeNumber(
    getCacheMultiplier({ valueKey, cacheType: 'read', model, endpoint, endpointTokenConfig }) ??
      promptRate,
  );
  const fallbackCacheRate =
    cacheWriteRate > 0 && cacheReadRate > 0
      ? (cacheWriteRate + cacheReadRate) / 2
      : cacheWriteRate || cacheReadRate || promptRate;

  return {
    inputPriceUsdPer1M: promptRate,
    cachePriceUsdPer1M: fallbackCacheRate,
    outputPriceUsdPer1M: safeNumber(
      getMultiplier({ valueKey, tokenType: 'completion', model, endpoint, endpointTokenConfig }),
    ),
    multiplier: 1,
  };
};

const calculateUsageCostCny = async ({
  inputTokens = 0,
  outputTokens = 0,
  cacheTokens = 0,
  cacheWriteTokens = 0,
  cacheReadTokens = 0,
  model,
  endpoint,
  valueKey,
  endpointTokenConfig,
}) => {
  const { inputPriceUsdPer1M, cachePriceUsdPer1M, outputPriceUsdPer1M, multiplier } =
    await getEffectivePricing({
      model,
      endpoint,
      valueKey,
      endpointTokenConfig,
    });

  const input = Math.max(0, Math.floor(safeNumber(inputTokens)));
  const output = Math.max(0, Math.floor(safeNumber(outputTokens)));
  const cache =
    Math.max(0, Math.floor(safeNumber(cacheTokens))) +
    Math.max(0, Math.floor(safeNumber(cacheWriteTokens))) +
    Math.max(0, Math.floor(safeNumber(cacheReadTokens)));
  const usdToCnyRate = getUsdToCnyRate();

  const usageUsd =
    ((input * inputPriceUsdPer1M + cache * cachePriceUsdPer1M + output * outputPriceUsdPer1M) /
      TOKENS_PER_MILLION) *
    multiplier;

  return roundMoney(usageUsd * usdToCnyRate);
};

const estimateRequestCostCny = async ({
  tokenType = 'prompt',
  amount = 0,
  model,
  endpoint,
  valueKey,
  endpointTokenConfig,
}) => {
  const inputTokens = tokenType === 'completion' ? 0 : Math.max(0, Math.floor(safeNumber(amount)));
  const outputTokens = tokenType === 'completion' ? Math.max(0, Math.floor(safeNumber(amount))) : 0;

  return calculateUsageCostCny({
    inputTokens,
    outputTokens,
    model,
    endpoint,
    valueKey,
    endpointTokenConfig,
  });
};

module.exports = {
  getUsdToCnyRate,
  calculateUsageCostCny,
  estimateRequestCostCny,
};
