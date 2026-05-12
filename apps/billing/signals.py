"""
Billing does not attach GL signals here. Posting lives in apps.accounting.signals
(subscribed to Invoice, Payment, Bill, BillPayment, CreditNote, Refund, CashierTill, …).
"""
