const { randomUUID } = require('crypto');
const { logger } = require('@librechat/data-schemas');

function setHeaders(req, res, next) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
    'X-Request-Id': requestId,
  });
  // Send bytes immediately, then keep the stream alive while attachments, summaries,
  // or model reasoning produce no visible tokens. SSE comments do not create messages.
  res.flushHeaders?.();
  res.write(': connected\n\n');
  res.setTimeout?.(0);
  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) {
      res.write(': keepalive\n\n');
    }
  }, 15000);
  heartbeat.unref?.();
  const cleanup = () => clearInterval(heartbeat);
  res.once('finish', cleanup);
  res.once('close', () => {
    cleanup();
    if (!res.writableFinished) {
      logger.warn('[SSE] Connection closed before completion', {
        requestId,
        elapsedMs: Date.now() - startedAt,
        endpoint: req.baseUrl,
        model: typeof req.body?.model === 'string' ? req.body.model.slice(0, 100) : undefined,
      });
    }
  });
  next();
}

module.exports = setHeaders;
