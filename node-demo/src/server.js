import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT 必须为 1–65535 的整数');
}
const server = createApp();
server.on('error', error => {
  console.error(`启动失败：${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`USDT 模拟订单 API：http://127.0.0.1:${port}`);
  console.log('仅供本机演示；内存数据重启后清空，不接收真实资金。');
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close());
}
