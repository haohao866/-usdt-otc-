// CSV 各字段加引号；订单号已在创建时限制为字母、数字、下划线和连字符。
function csvCell(value) {
  const text = String(value);
  const safe = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function ordersCsv(store) {
  const columns = ['id', 'merchantOrderNo', 'amount', 'currency', 'status', 'mode', 'createdAt'];
  const rows = [columns, ...[...store.orders.values()].map(order => columns.map(key => order[key]))];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
