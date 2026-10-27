# Node.js 模拟支付订单 API

使用 Node.js 内置 HTTP 服务实现订单创建、查询、模拟支付、取消订单、事件记录、对账汇总与 CSV 导出。无需第三方依赖。

**这是内存数据的本地示例，不提供真实收款、链上确认、交易撮合或资金托管。服务重启后数据清空，数据也不与根目录 Python 示例共享。**

## 运行

需要 Node.js 22 或更高版本。在本目录运行：

```bash
npm start
```

默认地址：`http://127.0.0.1:3000`。默认仅监听本机，没有商户鉴权，适合本地演示。

另开一个终端，在相同目录运行：

```bash
npm run example
```

示例客户端会创建订单、模拟支付并读取事件和汇总。运行测试：

```bash
npm test
```

端口可通过环境变量 `PORT` 修改，例如 PowerShell：

```powershell
$env:PORT = '3001'
npm start
```

客户端也读取 `PORT`。若在另一终端运行客户端，请在那个终端中设置相同端口。

## 模块

| 文件 | 功能 |
| --- | --- |
| `src/server.js` | 启动本机 HTTP 服务 |
| `src/app.js` | HTTP 路由与错误响应 |
| `src/orders.js` | 订单校验、幂等创建与状态流转 |
| `src/money.js` | BigInt 金额解析和格式化 |
| `src/store.js` | 内存订单、幂等键和事件存储 |
| `src/reports.js` | CSV 订单报表 |
| `src/http.js` | JSON 解析和请求体大小限制 |
| `src/errors.js` | 业务错误类型 |
| `examples/client.js` | 可运行的接口调用示例 |
| `test/payment.test.js` | HTTP 订单生命周期与错误场景测试 |

## 接口

详细请求与响应参见 [API.md](API.md)。创建订单示例：

```http
POST /api/orders
Content-Type: application/json
Idempotency-Key: demo-001

{"merchantOrderNo":"DEMO-001","amount":"10.500000"}
```

金额用字符串传递，最多六位小数。幂等键相同且参数相同的请求返回已有订单；参数不同返回 `409`。商户订单号要求唯一，订单和幂等记录均只保留到服务退出。

状态流转：`pending` → `simulated_paid` 或 `cancelled`。终态不允许互转，重复执行相同终态操作不会重复生成事件。

## 扩展方向

生产服务需要另外实现持久化存储、商户身份验证、真正的链上事件来源、通知签名与重试。本示例以清晰的订单接口和业务状态为起点，所有 `simulated_paid` 都仅表示本地操作结果。
