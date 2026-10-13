// Run with node in the built API container. Only synthetic data and a local model stub are used.
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
require('module-alias').addAlias('~', path.resolve(__dirname, '../..'));
const AgentClient = require('../controllers/agents/client');
const { Providers, GraphEvents, Run } = require('@librechat/agents');
const { HumanMessage } = require('@langchain/core/messages');
const { getDefaultHandlers } = require('../controllers/agents/callbacks');

const summaryText = 'Keep the user requirement: use PostgreSQL and preserve the original files.';
const requests = [];
const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  requests.push({ url: req.url, body });
  const send = (value) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(value));
  };
  const sse = (data) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.end(
      data
        .map(
          (part) => `${part.type ? `event: ${part.type}\n` : ''}data: ${JSON.stringify(part)}\n\n`,
        )
        .join(''),
    );
  };
  if (req.url.includes('generateContent') || req.url.includes('streamGenerateContent')) {
    const data = {
      candidates: [
        {
          content: { role: 'model', parts: [{ text: summaryText }] },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
        cachedContentTokenCount: 5,
      },
    };
    return req.url.includes('streamGenerateContent') ? sse([data]) : send(data);
  }
  if (req.url.includes('/messages')) {
    if (body.stream) {
      return sse([
        {
          type: 'message_start',
          message: {
            id: 'stub',
            type: 'message',
            role: 'assistant',
            content: [],
            model: body.model,
            usage: { input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 5 },
          },
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: summaryText } },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 5 },
        },
        { type: 'message_stop' },
      ]);
    }
    return send({
      id: 'stub',
      type: 'message',
      role: 'assistant',
      model: body.model,
      content: [{ type: 'text', text: summaryText }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 5 },
    });
  }
  if (body.stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.end(
      `data: ${JSON.stringify({
        id: 'stub',
        object: 'chat.completion.chunk',
        model: body.model,
        choices: [
          { index: 0, delta: { role: 'assistant', content: summaryText }, finish_reason: null },
        ],
      })}\n\ndata: ${JSON.stringify({
        id: 'stub',
        object: 'chat.completion.chunk',
        model: body.model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          prompt_tokens_details: { cached_tokens: 6 },
        },
      })}\n\ndata: [DONE]\n\n`,
    );
  } else {
    send({
      id: 'stub',
      object: 'chat.completion',
      model: body.model,
      choices: [
        { index: 0, message: { role: 'assistant', content: summaryText }, finish_reason: 'stop' },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        prompt_tokens_details: { cached_tokens: 6 },
      },
    });
  }
});

async function main() {
  const chatUsage = [];
  const handlers = getDefaultHandlers({
    res: {},
    aggregateContent: () => {},
    toolEndCallback: () => {},
    collectedUsage: chatUsage,
  });
  await handlers[GraphEvents.CHAT_MODEL_END].handle(
    GraphEvents.CHAT_MODEL_END,
    {
      output: {
        usage_metadata: { input_tokens: 1761, output_tokens: 4 },
        response_metadata: {
          usage: { prompt_tokens_details: { cached_tokens: 1664 } },
        },
      },
    },
    { ls_model_name: 'gpt-5.4' },
    { getAgentContext: () => ({ provider: Providers.OPENAI, clientOptions: {} }) },
  );
  assert.equal(chatUsage[0].input_token_details.cache_read, 1664);
  console.log('PASS chat model callback keeps cached tokens');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const streamedUsage = [];
  const streamHandlers = getDefaultHandlers({
    res: {},
    aggregateContent: () => {},
    toolEndCallback: () => {},
    collectedUsage: streamedUsage,
  });
  const chatRun = await Run.create({
    runId: 'synthetic-chat-usage',
    graphConfig: {
      type: 'standard',
      llmConfig: {
        provider: Providers.OPENAI,
        model: 'gpt-4o',
        apiKey: 'stub',
        configuration: { baseURL: `${base}/v1` },
      },
      tools: [],
      instructions: 'Reply briefly.',
      signal: new AbortController().signal,
    },
    customHandlers: { [GraphEvents.CHAT_MODEL_END]: streamHandlers[GraphEvents.CHAT_MODEL_END] },
    returnContent: true,
  });
  await chatRun.processStream(
    { messages: [new HumanMessage('Reply OK.')] },
    { streamMode: 'values', version: 'v2' },
  );
  assert.equal(streamedUsage.at(-1)?.input_token_details?.cache_read, 6);
  console.log('PASS streamed agent chat preserves cached tokens');
  const client = new AgentClient({
    req: { user: { id: 'synthetic', personalization: { memories: false } }, body: {}, config: {} },
    agent: {
      id: 'synthetic-agent',
      provider: Providers.OPENAI,
      tools: [],
      model_parameters: {
        model: 'gpt-4o',
        apiKey: 'stub',
        configuration: { baseURL: `${base}/v1` },
      },
    },
    maxContextTokens: 18000,
    agentConfigs: new Map(),
  });
  client.responseMessageId = 'synthetic-response';
  client.conversationId = 'synthetic-conversation';
  client.abortController = new AbortController();
  const recordedUsage = [];
  client.recordCollectedUsage = async ({ collectedUsage }) => recordedUsage.push(collectedUsage);
  const providers = [
    [
      Providers.OPENAI,
      { model: 'gpt-4o', apiKey: 'stub', configuration: { baseURL: `${base}/v1` } },
    ],
    [
      Providers.OPENAI,
      { model: 'gpt-5.4', apiKey: 'stub', configuration: { baseURL: `${base}/v1` } },
    ],
    [Providers.GOOGLE, { model: 'gemini-2.5-flash', apiKey: 'stub', baseUrl: base }],
    [
      Providers.ANTHROPIC,
      {
        model: 'claude-sonnet-4-5',
        apiKey: 'stub',
        clientOptions: { baseURL: base },
        thinking: { type: 'enabled', budget_tokens: 10000 },
      },
    ],
  ];
  for (const [provider, parameters] of providers) {
    client.options.agent.provider = provider;
    client.options.agent.model_parameters = parameters;
    const result = await client.generateContextSummary({
      summary: '',
      transcript: 'User requested PostgreSQL.',
      instructions: 'Summarize facts only.',
      maxOutputTokens: 2048,
      signal: client.abortController.signal,
    });
    assert.equal(result, summaryText);
    assert.ok(recordedUsage.at(-1)?.[0]?.input_token_details?.cache_read > 0);
    assert.deepEqual(
      client.options.agent.model_parameters,
      parameters,
      'original model parameters must stay unchanged',
    );
    console.log(`PASS summary transport: ${parameters.model}`);
  }
  const checkpoints = new Map();
  const messages = Array.from({ length: 17 }, (_, i) => ({
    messageId: `m${i}`,
    parentMessageId: i ? `m${i - 1}` : null,
    text: `original ${i}`,
    tokenCount: 1000,
    sender: i % 2 ? 'Assistant' : 'User',
    isCreatedByUser: i % 2 === 0,
  }));
  let summaries = 0;
  client.generateContextSummary = async () => {
    summaries++;
    return summaryText;
  };
  client.updateMessageInDatabase = async ({ messageId, contextSummary }) =>
    checkpoints.set(messageId, contextSummary);
  const result = await client.buildMessages(
    messages,
    'm16',
    { instructions: 'System instructions' },
    {},
  );
  assert.ok(summaries > 0);
  assert.ok(result.prompt.length < messages.length);
  assert.equal(result.prompt.at(-1).content, 'original 16');
  assert.ok(client.options.agent.instructions.includes(summaryText));
  assert.equal(client.maxContextTokens, 18000);
  assert.ok(checkpoints.size > 0);
  for (const message of messages) message.contextSummary = checkpoints.get(message.messageId);
  const count = summaries;
  await client.buildMessages(messages, 'm16', { instructions: 'System instructions' }, {});
  assert.equal(summaries, count, 'checkpoint should be reused across requests');
  assert.ok(messages.every((m, i) => m.text === `original ${i}`));
  console.log(
    'PASS integrated pruning, persistence, original history preservation, and checkpoint reuse',
  );
  messages[0].text = 'edited earlier requirement';
  client.generateContextSummary = async () => {
    throw new Error('synthetic upstream failure');
  };
  const fallback = await client.buildMessages(
    messages,
    'm16',
    { instructions: 'System instructions' },
    {},
  );
  assert.equal(fallback.prompt.at(-1).content, 'original 16');
  assert.ok(!client.options.agent.instructions.includes(summaryText));
  console.log('PASS summary failure falls back to normal chat pruning');
  const gpt5 = requests.find((r) => r.body.model === 'gpt-5.4');
  assert.ok(gpt5.body.max_completion_tokens > 0);
  assert.equal(gpt5.body.max_tokens, undefined);
  assert.ok(requests.every((r) => !r.body.tools?.length));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => server.close(() => process.exit(process.exitCode ?? 0)));
