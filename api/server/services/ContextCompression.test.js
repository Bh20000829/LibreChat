const { compressContext, contentText } = require('./ContextCompression');

function history(length = 12) {
  return Array.from({ length }, (_, i) => ({
    messageId: `m${i}`,
    parentMessageId: i ? `m${i - 1}` : null,
    text: `message ${i}`,
    tokenCount: 10,
    isCreatedByUser: i % 2 === 0,
  }));
}
function params(messages = history()) {
  return {
    orderedMessages: messages,
    formattedMessages: messages.map((m) => ({
      role: m.isCreatedByUser ? 'user' : 'assistant',
      content: m.text,
    })),
    budget: 100,
    countTokens: (text) => Math.ceil(text.length / 4),
    summarize: jest.fn().mockResolvedValue('notes'),
    persist: jest.fn().mockResolvedValue(),
  };
}

describe('rolling context compression', () => {
  it('leaves short histories untouched without a model call', async () => {
    const p = params(history(4));
    const result = await compressContext(p);
    expect(result.orderedMessages).toEqual(p.orderedMessages);
    expect(p.summarize).not.toHaveBeenCalled();
  });

  it('saves a summary checkpoint while preserving originals and recent complete turns', async () => {
    const p = params();
    // A realistic summary request budget; threshold pressure comes from token counts.
    p.budget = 1000;
    p.orderedMessages.forEach((m) => {
      m.tokenCount = 100;
    });
    const original = JSON.stringify(p.orderedMessages);
    const result = await compressContext(p);
    expect(result.summary).toBe('notes');
    expect(result.orderedMessages.length).toBeGreaterThanOrEqual(4);
    expect(result.orderedMessages[0].isCreatedByUser).toBe(true);
    expect(result.orderedMessages.at(-1).messageId).toBe('m11');
    expect(p.persist).toHaveBeenCalledWith(
      'm7',
      expect.objectContaining({ version: 1, text: 'notes' }),
    );
    expect(JSON.stringify(p.orderedMessages)).toBe(original);
  });

  it('reuses a checkpoint after a new turn without repeating summary requests', async () => {
    const messages = history();
    messages.forEach((m) => {
      m.tokenCount = 100;
    });
    const p = { ...params(messages), budget: 1000 };
    await compressContext(p);
    const [id, checkpoint] = p.persist.mock.calls[0];
    messages.find((m) => m.messageId === id).contextSummary = checkpoint;
    const next = { ...params(messages), budget: 1000 };
    const result = await compressContext(next);
    expect(result.summary).toBe('notes');
    expect(result.orderedMessages[0].messageId).toBe('m8');
    expect(next.summarize).not.toHaveBeenCalled();
  });

  it('invalidates summaries when earlier history is edited', async () => {
    const messages = history();
    messages.forEach((m) => {
      m.tokenCount = 100;
    });
    const p = { ...params(messages), budget: 1000 };
    await compressContext(p);
    const [id, checkpoint] = p.persist.mock.calls[0];
    messages.find((m) => m.messageId === id).contextSummary = checkpoint;
    messages[0].text = 'corrected requirement';
    const next = { ...params(messages), budget: 1000 };
    await compressContext(next);
    expect(next.summarize).toHaveBeenCalled();
    expect(next.summarize.mock.calls[0][0].transcript).toContain('corrected requirement');
  });

  it('does not reuse a checkpoint from a different prefix/branch', async () => {
    const messages = history();
    messages.forEach((m) => {
      m.tokenCount = 100;
    });
    messages[7].contextSummary = {
      version: 1,
      text: 'other branch',
      prefixHash: 'not-this-branch',
    };
    const p = { ...params(messages), budget: 1000 };
    await compressContext(p);
    expect(p.summarize.mock.calls[0][0].summary).toBe('');
  });

  it('chunks oversized history and only persists after every chunk succeeds', async () => {
    const p = { ...params(), budget: 1000 };
    p.orderedMessages.forEach((m) => {
      m.tokenCount = 100;
    });
    p.formattedMessages[0].content = 'x'.repeat(7000);
    await compressContext(p);
    expect(p.summarize.mock.calls.length).toBeGreaterThan(1);
    expect(p.persist).toHaveBeenCalledTimes(1);
    for (const [call] of p.summarize.mock.calls) {
      expect(p.countTokens(call.transcript)).toBeLessThanOrEqual(600);
    }
  });

  it('never persists empty or failed summaries', async () => {
    const p = { ...params(), budget: 1000 };
    p.orderedMessages.forEach((m) => {
      m.tokenCount = 100;
    });
    p.summarize.mockResolvedValue('');
    await expect(compressContext(p)).rejects.toThrow('empty summary');
    expect(p.persist).not.toHaveBeenCalled();
    p.summarize.mockRejectedValue(new Error('upstream unavailable'));
    await expect(compressContext(p)).rejects.toThrow('upstream unavailable');
    expect(p.persist).not.toHaveBeenCalled();
  });

  it('respects cancellation and includes system tokens in trigger pressure', async () => {
    const p = { ...params(history(8)), budget: 1000, systemTokens: 300 };
    p.orderedMessages.forEach((m) => {
      m.tokenCount = 100;
    });
    const controller = new AbortController();
    controller.abort();
    await expect(compressContext({ ...p, signal: controller.signal })).rejects.toThrow();
    expect(p.summarize).not.toHaveBeenCalled();
  });

  it('extracts text and tool results without sending embedded image bytes', () => {
    expect(
      contentText([
        { type: 'text', text: 'fact' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,SECRET' } },
        { type: 'tool_call', tool_call: { name: 'search', output: 'result' } },
      ]),
    ).toContain('result');
    expect(contentText([{ type: 'image_url', image_url: { url: 'SECRET' } }])).not.toContain(
      'SECRET',
    );
  });
});
