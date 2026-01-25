from decimal import Decimal
from apps.billing.tax_service import TaxService

# Check configuration
config = TaxService.get_config()
print(f"VAT Rate: {config.vat_rate}")
print(f"NHIL Rate: {config.nhil_rate}")
print(f"GETFund Rate: {config.getfund_rate}")
if hasattr(config, 'covid_rate'):
    print(f"COVID Rate: {config.covid_rate}")
else:
    print("COVID Rate: Removed (Correct)")

# Calculate breakdown for 1000 GHS
amount = Decimal('1000')
breakdown = TaxService.calculate_breakdown(amount)

print(f"\nBreakdown for {amount}:")
print(f"NHIL: {breakdown.nhil_amount}")
print(f"GETFund: {breakdown.getfund_amount}")
if hasattr(breakdown, 'hrl_amount'):
    print(f"COVID/HRL: {breakdown.hrl_amount}")
else:
    print("COVID/HRL: Removed (Correct)")
print(f"VAT: {breakdown.vat_amount}")
print(f"Total Tax: {breakdown.total_tax}")

# Assertions
expected_nhil = Decimal('25.00') # 2.5% of 1000
expected_getfund = Decimal('25.00') # 2.5% of 1000
expected_vat = Decimal('150.00') # 15% of 1000 (Decoupled, was 159.00 or similar before)
expected_total_tax = expected_nhil + expected_getfund + expected_vat # 200.00

assert breakdown.nhil_amount == expected_nhil, f"NHIL mismatch: {breakdown.nhil_amount} != {expected_nhil}"
assert breakdown.getfund_amount == expected_getfund, f"GETFund mismatch: {breakdown.getfund_amount} != {expected_getfund}"
assert breakdown.vat_amount == expected_vat, f"VAT mismatch: {breakdown.vat_amount} != {expected_vat}"
assert breakdown.total_tax == expected_total_tax, f"Total mismatch: {breakdown.total_tax} != {expected_total_tax}"
if hasattr(breakdown, 'hrl_amount'):
    assert breakdown.hrl_amount == Decimal('0'), f"HRL should be 0, got {breakdown.hrl_amount}"

print("\nVerification Passed!")
