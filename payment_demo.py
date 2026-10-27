"""USDT 支付订单模拟器：仅使用本地数据库，不连接链上、不接收资金。"""

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from uuid import uuid4

SCALE = 1_000_000
MAX_UNITS = 1_000_000_000_000_000


def parse_amount(value):
    """以整数保存六位小数金额，避免浮点误差。"""
    try:
        amount = Decimal(value)
        if not amount.is_finite() or amount <= 0 or amount > MAX_UNITS // SCALE:
            raise ValueError("金额必须大于零且不超过 1000000000")
        units = amount * SCALE
        if units != units.to_integral_value():
            raise ValueError("金额最多支持六位小数")
        return int(units)
    except InvalidOperation as exc:
        raise ValueError("请输入有效金额") from exc


def open_db(path):
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("""CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        merchant_order_no TEXT NOT NULL UNIQUE,
        amount_units INTEGER NOT NULL CHECK (amount_units > 0),
        status TEXT NOT NULL CHECK (status IN ('pending', 'simulated_paid')),
        created_at TEXT NOT NULL
    )""")
    db.commit()
    return db


def create_order(db, merchant_order_no, amount):
    if not merchant_order_no.strip() or len(merchant_order_no) > 100:
        raise ValueError("商户订单号不能为空且最多 100 个字符")
    order_id = uuid4().hex
    with db:
        db.execute("INSERT INTO orders VALUES (?, ?, ?, 'pending', ?)", (
            order_id, merchant_order_no.strip(), parse_amount(amount),
            datetime.now(timezone.utc).isoformat(),
        ))
    return order_id


def simulate_payment(db, order_id):
    """幂等的本地状态变更，不执行转账或真实支付确认。"""
    with db:
        found = db.execute("SELECT id FROM orders WHERE id = ?", (order_id,)).fetchone()
        if found is None:
            raise ValueError("订单不存在")
        db.execute("UPDATE orders SET status = 'simulated_paid' WHERE id = ?", (order_id,))


def list_orders(db):
    rows = db.execute("SELECT * FROM orders ORDER BY created_at, id").fetchall()
    return [dict(row, amount=f"{Decimal(row['amount_units']) / SCALE:.6f}",
                 currency="USDT", mode="simulation") for row in rows]


def summary(db):
    rows = db.execute("""SELECT status, COUNT(*) AS count, SUM(amount_units) AS units
                         FROM orders GROUP BY status ORDER BY status""").fetchall()
    return [dict(status=row["status"], count=row["count"],
                 amount=f"{Decimal(row['units']) / SCALE:.6f}",
                 currency="USDT", mode="simulation") for row in rows]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=str(Path(__file__).with_name("demo.sqlite3")))
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create", help="创建模拟订单")
    create.add_argument("merchant_order_no")
    create.add_argument("amount")
    pay = sub.add_parser("simulate-pay", help="将本地订单标记为模拟已支付")
    pay.add_argument("order_id")
    sub.add_parser("list", help="查看订单")
    sub.add_parser("summary", help="按状态汇总模拟金额")
    args = parser.parse_args()
    db = open_db(args.db)
    try:
        if args.command == "create":
            result = {"order_id": create_order(db, args.merchant_order_no, args.amount),
                      "mode": "simulation"}
        elif args.command == "simulate-pay":
            simulate_payment(db, args.order_id)
            result = {"order_id": args.order_id, "status": "simulated_paid",
                      "mode": "simulation"}
        elif args.command == "list":
            result = list_orders(db)
        else:
            result = summary(db)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, sqlite3.IntegrityError) as exc:
        parser.exit(2, f"错误：{exc}\n")
    finally:
        db.close()


if __name__ == "__main__":
    main()
