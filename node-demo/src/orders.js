import { randomUUID } from 'node:crypto';
import { ApiError, invalid } from './errors.js';
import { formatAmount, parseAmount } from './money.js';
import { MemoryStore } from './store.js';

export const STATUSES = ['pending', 'simulated_paid', 'cancelled'];

export class OrderService {
  constructor(store = new MemoryStore()) {
    this.store = store;
  }

  create(input, idempotencyKey) {
    const { merchantOrderNo, amount } = input;
    if (typeof merchantOrderNo !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(merchantOrderNo)) {
      throw invalid('merchantOrderNo 只能包含英文字母、数字、下划线和连字符，长度 1–64');
    }
    if (idempotencyKey !== undefined &&
        !/^[A-Za-z0-9_-]{1,100}$/.test(idempotencyKey)) {
      throw invalid('Idempotency-Key 格式错误，长度应为 1–100');
    }
    const normalizedAmount = formatAmount(parseAmount(amount));
    const fingerprint = JSON.stringify([merchantOrderNo, normalizedAmount]);
    const previous = idempotencyKey && this.store.idempotency.get(idempotencyKey);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', '相同幂等键不能用于不同订单参数');
      }
      return { order: this.get(previous.orderId), replayed: true };
    }
    if (this.store.merchantOrders.has(merchantOrderNo)) {
      throw new ApiError(409, 'DUPLICATE_ORDER', '商户订单号已存在');
    }
    const at = new Date().toISOString();
    const order = {
      id: randomUUID(), merchantOrderNo, amount: normalizedAmount,
      currency: 'USDT', status: 'pending', mode: 'simulation',
      createdAt: at, updatedAt: at,
    };
    this.store.orders.set(order.id, order);
    this.store.merchantOrders.set(merchantOrderNo, order.id);
    if (idempotencyKey) {
      this.store.idempotency.set(idempotencyKey, { orderId: order.id, fingerprint });
    }
    this.store.addEvent(order.id, 'order.created', at);
    return { order: structuredClone(order), replayed: false };
  }

  get(id) {
    const order = this.store.orders.get(id);
    if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在');
    return structuredClone(order);
  }

  list({ status, offset = 0, limit = 20 } = {}) {
    if (status !== undefined && !STATUSES.includes(status)) throw invalid('status 无效');
    if (!Number.isSafeInteger(offset) || offset < 0 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw invalid('offset 必须为非负整数，limit 必须为 1–100 的整数');
    }
    const items = [...this.store.orders.values()].filter(order => !status || order.status === status);
    return { items: structuredClone(items.slice(offset, offset + limit)), total: items.length, offset, limit };
  }

  transition(id, target) {
    if (!['simulated_paid', 'cancelled'].includes(target)) throw invalid('目标状态无效');
    const order = this.get(id);
    if (order.status === target) return order;
    if (order.status !== 'pending') {
      throw new ApiError(409, 'STATE_CONFLICT', '已结束的订单不能变更为其他状态');
    }
    order.status = target;
    order.updatedAt = new Date().toISOString();
    this.store.orders.set(id, order);
    this.store.addEvent(id, `order.${target}`, order.updatedAt);
    return structuredClone(order);
  }

  history(id) {
    this.get(id);
    return structuredClone(this.store.events.get(id));
  }

  summary() {
    return STATUSES.map(status => {
      const items = [...this.store.orders.values()].filter(order => order.status === status);
      const units = items.reduce((sum, order) => sum + parseAmount(order.amount), 0n);
      return { status, count: items.length, amount: formatAmount(units), currency: 'USDT', mode: 'simulation' };
    });
  }
}
