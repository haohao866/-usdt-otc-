import { createServer } from 'node:http';
import { ApiError, invalid } from './errors.js';
import { readJson, sendJson } from './http.js';
import { OrderService } from './orders.js';
import { ordersCsv } from './reports.js';

function integerParam(params, name, fallback) {
  const value = params.get(name);
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) throw invalid(`${name} 必须为非负整数`);
  return Number(value);
}

export function createApp(service = new OrderService()) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (req.method === 'GET' && path === '/health') {
        return sendJson(res, 200, { status: 'ok', mode: 'simulation', storage: 'memory' });
      }
      if (req.method === 'POST' && path === '/api/orders') {
        const result = service.create(await readJson(req), req.headers['idempotency-key']);
        return sendJson(res, result.replayed ? 200 : 201, result);
      }
      if (req.method === 'GET' && path === '/api/orders') {
        return sendJson(res, 200, service.list({
          status: url.searchParams.get('status') ?? undefined,
          limit: integerParam(url.searchParams, 'limit', 20),
          offset: integerParam(url.searchParams, 'offset', 0),
        }));
      }
      if (req.method === 'GET' && path === '/api/summary') {
        return sendJson(res, 200, { items: service.summary() });
      }
      if (req.method === 'GET' && path === '/api/reports/orders.csv') {
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="simulation-orders.csv"',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        return res.end(ordersCsv(service.store));
      }
      const match = path.match(/^\/api\/orders\/([A-Za-z0-9-]+)(?:\/(simulate-pay|cancel|events))?$/);
      if (match) {
        const [, id, action] = match;
        if (req.method === 'GET' && !action) return sendJson(res, 200, service.get(id));
        if (req.method === 'GET' && action === 'events') {
          return sendJson(res, 200, { items: service.history(id) });
        }
        if (req.method === 'POST' && ['simulate-pay', 'cancel'].includes(action)) {
          req.resume();
          return sendJson(res, 200, service.transition(id, action === 'cancel' ? 'cancelled' : 'simulated_paid'));
        }
      }
      req.resume();
      throw new ApiError(404, 'NOT_FOUND', '接口不存在');
    } catch (error) {
      const known = error instanceof ApiError;
      sendJson(res, known ? error.status : 500, {
        error: { code: known ? error.code : 'INTERNAL_ERROR',
          message: known ? error.message : '服务内部错误' },
        mode: 'simulation',
      });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}
