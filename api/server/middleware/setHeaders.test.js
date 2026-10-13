const { EventEmitter } = require('events');

jest.mock('@librechat/data-schemas', () => ({ logger: { warn: jest.fn() } }));
const { logger } = require('@librechat/data-schemas');
const setHeaders = require('./setHeaders');

describe('SSE keepalive', () => {
  let res;
  beforeEach(() => {
    jest.useFakeTimers();
    res = Object.assign(new EventEmitter(), {
      writeHead: jest.fn(),
      write: jest.fn(),
      flushHeaders: jest.fn(),
      setTimeout: jest.fn(),
      destroyed: false,
      writableEnded: false,
      writableFinished: false,
    });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens immediately and sends comment heartbeats during slow processing', () => {
    const next = jest.fn();
    setHeaders({ baseUrl: '/api/agents/chat', body: { model: 'gpt-5.5' } }, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.write).toHaveBeenCalledWith(': connected\n\n');
    jest.advanceTimersByTime(45000);
    expect(res.write.mock.calls.filter(([data]) => data === ': keepalive\n\n')).toHaveLength(3);
    expect(res.setTimeout).toHaveBeenCalledWith(0);
  });

  it('clears its timer on a normal finish without reporting a failure', () => {
    setHeaders({ body: {} }, res, jest.fn());
    res.writableFinished = true;
    res.writableEnded = true;
    res.emit('finish');
    res.emit('close');
    jest.advanceTimersByTime(30000);
    expect(res.write).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('reports premature disconnections without logging prompts or credentials', () => {
    setHeaders(
      { baseUrl: '/api/agents/chat', body: { model: 'gpt-5.5', text: 'PRIVATE', key: 'SECRET' } },
      res,
      jest.fn(),
    );
    jest.advanceTimersByTime(20000);
    res.destroyed = true;
    res.emit('close');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ elapsedMs: 20000, model: 'gpt-5.5' }),
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(/PRIVATE|SECRET/);
    expect(jest.getTimerCount()).toBe(0);
  });
});
