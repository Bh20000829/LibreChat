/* Run from the repository root with: node api/scripts/inspect-model-usage.js */
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const timeoutMs = 45000;
const splitModels = (name) =>
  (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const allJobs = [
  ...splitModels('OPENAI_CHAT_MODELS').map((model) => ({ provider: 'openai', model })),
  ...splitModels('ANTHROPIC_CHAT_MODELS').map((model) => ({ provider: 'anthropic', model })),
  ...splitModels('GOOGLE_CHAT_MODELS').map((model) => ({ provider: 'google', model })),
  ...['deepseek-v3.2', 'deepseek-v4-pro'].map((model) => ({ provider: 'deepseek', model })),
];
const selectedProvider = process.argv[2];
const jobs = selectedProvider
  ? allJobs.filter(({ provider }) => provider === selectedProvider)
  : allJobs;

const normalized = (usage = {}) => ({
  input: usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount ?? null,
  output:
    usage.completion_tokens ??
    usage.output_tokens ??
    (usage.candidatesTokenCount != null
      ? usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0)
      : null),
  cacheRead:
    usage.prompt_tokens_details?.cached_tokens ??
    usage.input_tokens_details?.cached_tokens ??
    usage.cache_read_input_tokens ??
    usage.cachedContentTokenCount ??
    usage.prompt_cache_hit_tokens ??
    null,
  cacheWrite: usage.cache_creation_input_tokens ?? null,
  fields: Object.keys(usage).filter((key) => !key.includes('latency')),
});

async function inspect({ provider, model }) {
  let url;
  let headers;
  let body;
  if (provider === 'anthropic') {
    url = `${process.env.ANTHROPIC_REVERSE_PROXY.replace(/\/$/, '')}/v1/messages`;
    headers = {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
    body = { model, max_tokens: 32, messages: [{ role: 'user', content: 'Reply OK.' }] };
  } else if (provider === 'google') {
    url = `${process.env.GOOGLE_REVERSE_PROXY.replace(/\/$/, '')}/v1beta/models/${model}:generateContent`;
    headers = { 'x-goog-api-key': process.env.GOOGLE_KEY, 'content-type': 'application/json' };
    body = {
      contents: [{ role: 'user', parts: [{ text: 'Reply OK.' }] }],
      generationConfig: { maxOutputTokens: 32 },
    };
  } else {
    url = `${(provider === 'deepseek'
      ? 'https://api.openai-proxy.org/v1'
      : process.env.OPENAI_REVERSE_PROXY
    ).replace(/\/$/, '')}/chat/completions`;
    headers = {
      authorization: `Bearer ${provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY : process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    };
    body = {
      model,
      messages: [{ role: 'user', content: 'Reply OK.' }],
      max_completion_tokens: 32,
    };
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json();
    const usage = data.usage ?? data.usageMetadata;
    return {
      provider,
      model,
      status: response.status,
      usage: usage ? normalized(usage) : null,
      errorType: data.error?.type ?? data.error?.code ?? null,
    };
  } catch (error) {
    return { provider, model, status: null, usage: null, errorType: error.name };
  }
}

async function main() {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        process.stdout.write(`${JSON.stringify(await inspect(job))}\n`);
      }
    }),
  );
}

main().catch((error) => {
  process.stderr.write(`${error.name}\n`);
  process.exitCode = 1;
});
