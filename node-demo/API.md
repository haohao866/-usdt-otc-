# 模拟订单 API 文档

基础地址：`http://127.0.0.1:3000`。JSON 响应均为模拟业务数据。

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| GET | `/health` | 服务状态和模拟模式 |
| POST | `/api/orders` | 创建订单 |
| GET | `/api/orders` | 分页查询订单 |
| GET | `/api/orders/:id` | 查询订单详情 |
| POST | `/api/orders/:id/simulate-pay` | 模拟支付成功 |
| POST | `/api/orders/:id/cancel` | 取消待支付订单 |
| GET | `/api/orders/:id/events` | 查询订单事件 |
| GET | `/api/summary` | 按状态汇总金额 |
| GET | `/api/reports/orders.csv` | 导出全部模拟订单 |

## 创建订单

请求头：`Content-Type: application/json`，可选 `Idempotency-Key`。

```json
{"merchantOrderNo":"DEMO-001","amount":"10.50"}
```

首次创建返回 `201`：

```json
{
  "order": {
    "id": "服务生成的UUID",
    "merchantOrderNo": "DEMO-001",
    "amount": "10.500000",
    "currency": "USDT",
    "status": "pending",
    "mode": "simulation",
    "createdAt": "服务生成的UTC时间",
    "updatedAt": "服务生成的UTC时间"
  },
  "replayed": false
}
```

相同幂等键和参数重试返回 `200`，`replayed` 为 `true`，返回该订单当前状态。相同幂等键但参数不同，或商户订单号重复且未命中幂等记录时返回 `409`。金额 `10.5` 与 `10.500000` 视为相同金额。

商户订单号为 1–64 个英文字母、数字、下划线或连字符。幂等键允许相同字符集合，长度 1–100。金额必须是正数字符串，最多六位小数，最大为 `1000000000`。

## 列表与汇总

`GET /api/orders?status=pending&limit=20&offset=0`

`status` 可选 `pending`、`simulated_paid`、`cancelled`。`limit` 范围为 1–100，`offset` 为非负整数；列表按创建插入顺序返回。

列表响应包含 `items`、`total`、`limit` 和 `offset`。汇总接口返回 `items`，每个状态都有 `count` 和六位小数格式的 `amount`，空状态返回零值。

## 状态操作与事件

模拟支付和取消接口无需请求体。只有 `pending` 订单可以进入终态。重复模拟支付或重复取消返回当前订单；已取消订单不能模拟支付，模拟已支付订单不能取消。

事件类型为 `order.created`、`order.simulated_paid`、`order.cancelled`，每项包括订单 ID、UTC 时间和 `simulation` 标记。

## 错误响应

```json
{
  "error": {"code":"ORDER_NOT_FOUND","message":"订单不存在"},
  "mode":"simulation"
}
```

| 状态码 | 含义 |
| --- | --- |
| 400 | 无效 JSON 或非对象请求体 |
| 404 | 订单或接口不存在 |
| 409 | 重复订单、幂等冲突或状态冲突 |
| 413 | JSON 请求体超过 16 KiB |
| 415 | 创建订单请求未使用 JSON 内容类型 |
| 422 | 金额、订单号、分页或状态参数不合法 |
| 500 | 未预期的服务错误 |

CSV 导出包含全部状态的模拟订单；可能作为表格公式开头的单元格会加单引号。CSV 不代表链上或真实支付对账结果。
