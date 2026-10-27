// 仅保存本进程中的模拟数据；Node.js 服务重启后清空。
export class MemoryStore {
  orders = new Map();
  merchantOrders = new Map();
  idempotency = new Map();
  events = new Map();

  addEvent(orderId, type, at) {
    const list = this.events.get(orderId) ?? [];
    list.push({ orderId, type, at, mode: 'simulation' });
    this.events.set(orderId, list);
  }
}
