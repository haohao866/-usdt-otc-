import sqlite3
import unittest

from payment_demo import create_order, list_orders, open_db, parse_amount, simulate_payment, summary


class PaymentDemoTests(unittest.TestCase):
    def setUp(self):
        self.db = open_db(":memory:")
        self.addCleanup(self.db.close)

    def test_decimal_amounts_are_exact(self):
        self.assertEqual(parse_amount("0.000001"), 1)
        self.assertEqual(parse_amount("12.345678"), 12345678)
        for value in ("0", "-1", "NaN", "Infinity", "0.0000001", "abc", "1000000001"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_amount(value)

    def test_order_lifecycle_and_reconciliation(self):
        first = create_order(self.db, "DEMO-001", "10.10")
        create_order(self.db, "DEMO-002", "0.20")
        self.assertEqual(list_orders(self.db)[0]["status"], "pending")
        simulate_payment(self.db, first)
        simulate_payment(self.db, first)
        totals = {row["status"]: row for row in summary(self.db)}
        self.assertEqual(totals["simulated_paid"]["amount"], "10.100000")
        self.assertEqual(totals["simulated_paid"]["count"], 1)
        self.assertEqual(totals["pending"]["amount"], "0.200000")

    def test_duplicate_and_missing_order(self):
        create_order(self.db, "DEMO-001", "1")
        with self.assertRaises(sqlite3.IntegrityError):
            create_order(self.db, "DEMO-001", "2")
        with self.assertRaises(ValueError):
            simulate_payment(self.db, "missing")


if __name__ == "__main__":
    unittest.main()
