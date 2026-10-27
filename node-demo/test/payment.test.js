import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { parseAmount, formatAmount } from '../src/money.js';

test('金额使用整数计算，并拒绝无效精度和数值', () => {
  assert.equal(parseAmount('0.000001'), 1n);
  assert.equal(formatAmount(parseAmount('12.345678')), '12.345678');
  assert.equal(formatAmount(parseAmount('0.10') + parseAmount('0.20')), '0.300000');
  for (const amount of ['0', '-1', '1.0000001', 'NaN', '1e2', '1000000001', 1.5]) {
    assert.throws(() => parseAmount(amount));
  }
});

async function start(t) {
  const server = createApp();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (path, options = {}) => {
    const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await response.text(), headers: response.headers };
  };
}

const postOrder = (merchantOrderNo, amount, key) => ({
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
  body: JSON.stringify({ merchantOrderNo, amount }),
});

test('HTTP订单全流程：幂等、支付状态、事件和对账一致', async t => {
  const call = await start(t);
  assert.equal(JSON.parse((await call('/health')).body).mode, 'simulation');
  const created = await call('/api/orders', postOrder('A-001', '10.10', 'key-001'));
  assert.equal(created.status, 201);
  const order = JSON.parse(created.body).order;
  const replay = await call('/api/orders', postOrder('A-001', '10.100000', 'key-001'));
  assert.equal(replay.status, 200);
  assert.equal(JSON.parse(replay.body).order.id, order.id);
  assert.equal((await call('/api/orders', postOrder('A-001', '2', 'key-001'))).status, 409);
  assert.equal((await call('/api/orders', postOrder('A-001', '2'))).status, 409);
  await call('/api/orders', postOrder('A-002', '0.20'));
  const path = `/api/orders/${order.id}`;
  assert.equal((await call(`${path}/simulate-pay`, { method: 'POST' })).status, 200);
  assert.equal((await call(`${path}/simulate-pay`, { method: 'POST' })).status, 200);
  assert.equal((await call(`${path}/cancel`, { method: 'POST' })).status, 409);
  const history = JSON.parse((await call(`${path}/events`)).body).items;
  assert.deepEqual(history.map(row => row.type), ['order.created', 'order.simulated_paid']);
  assert.equal(JSON.parse((await call(path)).body).status, 'simulated_paid');
  const summary = JSON.parse((await call('/api/summary')).body).items;
  assert.equal(summary.find(row => row.status === 'simulated_paid').amount, '10.100000');
  assert.equal(summary.find(row => row.status === 'pending').amount, '0.200000');
  const list = JSON.parse((await call('/api/orders?status=simulated_paid&limit=1')).body);
  assert.equal(list.total, 1);
  const report = await call('/api/reports/orders.csv');
  assert.match(report.headers.get('content-type'), /text\/csv/);
  assert.match(report.body, /A-001/);
  assert.match(report.body, /simulation/);
});

test('取消订单可重试，结束后禁止模拟支付', async t => {
  const call = await start(t);
  const order = JSON.parse((await call('/api/orders', postOrder('B-001', '1'))).body).order;
  const path = `/api/orders/${order.id}`;
  assert.equal((await call(`${path}/cancel`, { method: 'POST' })).status, 200);
  assert.equal((await call(`${path}/cancel`, { method: 'POST' })).status, 200);
  assert.equal((await call(`${path}/simulate-pay`, { method: 'POST' })).status, 409);
  const summary = JSON.parse((await call('/api/summary')).body).items;
  assert.equal(summary.find(row => row.status === 'cancelled').count, 1);
});

test('HTTP输入错误返回明确状态码，不泄露内部异常', async t => {
  const call = await start(t);
  assert.equal((await call('/api/orders/missing')).status, 404);
  assert.equal((await call('/api/orders?limit=0')).status, 422);
  assert.equal((await call('/api/orders?offset=1.5')).status, 422);
  assert.equal((await call('/api/orders?status=paid')).status, 422);
  assert.equal((await call('/api/orders', postOrder('bad order', '1'))).status, 422);
  assert.equal((await call('/api/orders', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await call('/api/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  })).status, 400);
  const oversized = await call('/api/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extra: 'x'.repeat(17000) }),
  });
  assert.equal(oversized.status, 413);
  assert.doesNotMatch(oversized.body, /stack|src\//);
});
