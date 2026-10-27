// 先 npm start，再在另一个终端 npm run example。
const base = `http://127.0.0.1:${process.env.PORT ?? 3000}`;

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(5000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? `HTTP ${response.status}`);
  return result;
}

const merchantOrderNo = `DEMO-${crypto.randomUUID()}`;
const result = await request('/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': merchantOrderNo },
  body: JSON.stringify({ merchantOrderNo, amount: '10.500000' }),
});
console.log('创建订单：', result);
console.log('模拟支付：', await request(`/api/orders/${result.order.id}/simulate-pay`, { method: 'POST' }));
console.log('事件记录：', await request(`/api/orders/${result.order.id}/events`));
console.log('对账汇总：', await request('/api/summary'));
