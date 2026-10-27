import { invalid } from './errors.js';

const SCALE = 1_000_000n;
const MAX_AMOUNT = 1_000_000_000n * SCALE;

// 接口要求字符串金额；不使用浮点数参与金额计算。
export function parseAmount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,9})(\.\d{1,6})?$/.test(value)) {
    throw invalid('amount 必须是正数字符串，最多六位小数');
  }
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
  if (units <= 0n || units > MAX_AMOUNT) {
    throw invalid('amount 必须大于零且不超过 1000000000');
  }
  return units;
}

export function formatAmount(units) {
  return `${units / SCALE}.${String(units % SCALE).padStart(6, '0')}`;
}
