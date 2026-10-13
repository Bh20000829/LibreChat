const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

/** LangChain input_tokens includes cached tokens for all supported providers. */
const normalizeUsage = (metadata, responseMetadata = {}) => {
  const raw =
    responseMetadata.usage ??
    responseMetadata.usageMetadata ??
    responseMetadata.tokenUsage ??
    responseMetadata;
  const inputTokens = positive(
    metadata?.input_tokens ??
      raw?.prompt_tokens ??
      raw?.input_tokens ??
      raw?.inputTokens ??
      raw?.promptTokens ??
      raw?.promptTokenCount,
  );
  const outputTokens = positive(
    metadata?.output_tokens ??
      raw?.completion_tokens ??
      raw?.output_tokens ??
      raw?.outputTokens ??
      raw?.completionTokens ??
      (raw?.candidatesTokenCount ?? 0) + (raw?.thoughtsTokenCount ?? 0),
  );
  const details = metadata?.input_token_details ?? {};
  const rawDetails = raw?.prompt_tokens_details ?? raw?.input_tokens_details ?? {};
  const cacheRead = positive(
    details.cache_read ??
      rawDetails.cached_tokens ??
      raw?.cache_read_input_tokens ??
      raw?.cachedContentTokenCount ??
      raw?.prompt_cache_hit_tokens,
  );
  const cacheCreation = positive(details.cache_creation ?? raw?.cache_creation_input_tokens);
  const normalizedInputTokens =
    !metadata && (raw?.cache_read_input_tokens != null || raw?.cache_creation_input_tokens != null)
      ? inputTokens + cacheRead + cacheCreation
      : inputTokens;

  if (!metadata && !inputTokens && !outputTokens && !cacheRead && !cacheCreation) {
    return null;
  }

  return {
    ...metadata,
    input_tokens: normalizedInputTokens,
    output_tokens: outputTokens,
    input_token_details: {
      ...details,
      cache_read: cacheRead,
      cache_creation: cacheCreation,
    },
  };
};

const createUsageCollector = () => {
  const collected = [];
  const handleLLMEnd = (output) => {
    const generations = output?.generations;
    const message = generations?.[generations.length - 1]?.[0]?.message;
    const usage = normalizeUsage(message?.usage_metadata, message?.response_metadata);
    if (usage) {
      collected.push(usage);
    }
  };
  return { collected, handleLLMEnd };
};

module.exports = { normalizeUsage, createUsageCollector };
