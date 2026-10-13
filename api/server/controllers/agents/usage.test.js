const { normalizeUsage, createUsageCollector } = require('./usage');

describe('agent token usage normalization', () => {
  it('preserves cached tokens from OpenAI chat completions', () => {
    expect(
      normalizeUsage(undefined, {
        usage: {
          prompt_tokens: 177584,
          completion_tokens: 379,
          prompt_tokens_details: { cached_tokens: 174208 },
        },
      }),
    ).toMatchObject({
      input_tokens: 177584,
      output_tokens: 379,
      input_token_details: { cache_read: 174208 },
    });
  });

  it('preserves cached tokens from OpenAI responses', () => {
    expect(
      normalizeUsage(undefined, {
        usage: {
          input_tokens: 177584,
          output_tokens: 379,
          input_tokens_details: { cached_tokens: 174208 },
        },
      }),
    ).toMatchObject({
      input_tokens: 177584,
      input_token_details: { cache_read: 174208 },
    });
  });

  it('uses provider metadata while filling a missing cache detail', () => {
    expect(
      normalizeUsage(
        { input_tokens: 177584, output_tokens: 379 },
        { usage: { prompt_tokens_details: { cached_tokens: 174208 } } },
      ),
    ).toMatchObject({
      input_tokens: 177584,
      input_token_details: { cache_read: 174208 },
    });
  });

  it('includes native Anthropic cache tokens in total input', () => {
    expect(
      normalizeUsage(undefined, {
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_creation_input_tokens: 50,
          cache_read_input_tokens: 800,
        },
      }),
    ).toMatchObject({
      input_tokens: 950,
      input_token_details: { cache_creation: 50, cache_read: 800 },
    });
  });

  it('includes Gemini thinking tokens in output', () => {
    expect(
      normalizeUsage(undefined, {
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 5,
          thoughtsTokenCount: 40,
          cachedContentTokenCount: 80,
        },
      }),
    ).toMatchObject({
      input_tokens: 100,
      output_tokens: 45,
      input_token_details: { cache_read: 80 },
    });
  });

  it('keeps message cache details when LangChain response metadata only has totals', () => {
    const { collected, handleLLMEnd } = createUsageCollector();
    handleLLMEnd({
      generations: [
        [
          {
            message: {
              usage_metadata: {
                input_tokens: 1761,
                output_tokens: 4,
                input_token_details: { cache_read: 1664 },
              },
              response_metadata: {
                tokenUsage: { promptTokens: 1761, completionTokens: 4 },
              },
            },
          },
        ],
      ],
    });
    expect(collected[0]).toMatchObject({
      input_tokens: 1761,
      output_tokens: 4,
      input_token_details: { cache_read: 1664 },
    });
  });
});
