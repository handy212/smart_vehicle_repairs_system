/** Control account field metadata for the settings UI (mirrors backend CONTROL_ACCOUNT_SPECS). */

export type ControlAccountField =
  | "accounts_receivable_account"
  | "accounts_payable_account"
  | "customer_prepayment_account"
  | "sales_revenue_account"
  | "sales_discount_account"
  | "sales_tax_payable_account"
  | "shop_supplies_revenue_account"
  | "environmental_fee_revenue_account"
  | "input_tax_account"
  | "withholding_tax_payable_account"
  | "default_expense_account"
  | "purchase_returns_account"
  | "inventory_asset_account"
  | "cost_of_goods_sold_account"
  | "cash_over_short_account"
  | "till_counterparty_cash_account"
  | "default_bank_account"
  | "salary_expense_account"
  | "overtime_expense_account"
  | "allowances_expense_account"
  | "employer_statutory_expense_account"
  | "paye_tax_payable_account"
  | "payroll_deductions_payable_account"
  | "employer_statutory_payable_account";

export type ControlAccountSpec = {
  field: ControlAccountField;
  label: string;
  defaultCode: string;
  group: "Receivables & Payables" | "Revenue & Tax" | "Purchasing & Inventory" | "Cash & Banking" | "Payroll";
  description: string;
};

export const CONTROL_ACCOUNT_SPECS: ControlAccountSpec[] = [
  {
    field: "accounts_receivable_account",
    label: "Accounts Receivable",
    defaultCode: "1200",
    group: "Receivables & Payables",
    description: "Customer invoices, payments, and credit notes.",
  },
  {
    field: "accounts_payable_account",
    label: "Accounts Payable",
    defaultCode: "2000",
    group: "Receivables & Payables",
    description: "Vendor bills and bill payments.",
  },
  {
    field: "customer_prepayment_account",
    label: "Customer Prepayments",
    defaultCode: "2150",
    group: "Receivables & Payables",
    description: "Customer overpayments held for future invoices.",
  },
  {
    field: "sales_revenue_account",
    label: "Sales Revenue",
    defaultCode: "4000",
    group: "Revenue & Tax",
    description: "Invoice labor and service revenue.",
  },
  {
    field: "sales_discount_account",
    label: "Sales Returns & Allowances",
    defaultCode: "4100",
    group: "Revenue & Tax",
    description: "Invoice discounts and credit note returns.",
  },
  {
    field: "sales_tax_payable_account",
    label: "Sales Tax Payable",
    defaultCode: "2100",
    group: "Revenue & Tax",
    description: "Output VAT, NHIL, and GETFund.",
  },
  {
    field: "shop_supplies_revenue_account",
    label: "Shop Supplies Revenue",
    defaultCode: "4050",
    group: "Revenue & Tax",
    description: "Shop supplies fee on invoices.",
  },
  {
    field: "environmental_fee_revenue_account",
    label: "Environmental Fee Revenue",
    defaultCode: "4060",
    group: "Revenue & Tax",
    description: "Environmental fee on invoices.",
  },
  {
    field: "input_tax_account",
    label: "Input Sales Tax",
    defaultCode: "2200",
    group: "Revenue & Tax",
    description: "Recoverable input VAT on vendor bills.",
  },
  {
    field: "withholding_tax_payable_account",
    label: "Withholding Tax Payable",
    defaultCode: "2250",
    group: "Revenue & Tax",
    description: "Withholding tax withheld on vendor payments.",
  },
  {
    field: "default_expense_account",
    label: "Purchases / Operating Expense",
    defaultCode: "5000",
    group: "Purchasing & Inventory",
    description: "Non-inventory vendor bill lines.",
  },
  {
    field: "purchase_returns_account",
    label: "Purchase Returns",
    defaultCode: "5050",
    group: "Purchasing & Inventory",
    description: "Vendor credit returns (non-inventory).",
  },
  {
    field: "inventory_asset_account",
    label: "Inventory Asset",
    defaultCode: "1500",
    group: "Purchasing & Inventory",
    description: "Parts inventory on hand.",
  },
  {
    field: "cost_of_goods_sold_account",
    label: "Cost of Goods Sold",
    defaultCode: "5100",
    group: "Purchasing & Inventory",
    description: "Parts cost when invoiced to customers.",
  },
  {
    field: "cash_over_short_account",
    label: "Cash Over/Short",
    defaultCode: "5950",
    group: "Cash & Banking",
    description: "Till count variances.",
  },
  {
    field: "till_counterparty_cash_account",
    label: "Cash in Safe",
    defaultCode: "1010",
    group: "Cash & Banking",
    description: "Till pay-in and pay-out counterparty.",
  },
  {
    field: "default_bank_account",
    label: "Operating Bank Account",
    defaultCode: "1100",
    group: "Cash & Banking",
    description: "Default non-cash settlement account.",
  },
  {
    field: "salary_expense_account",
    label: "Salary Expense",
    defaultCode: "6000",
    group: "Payroll",
    description: "Basic salaries when payroll is marked paid.",
  },
  {
    field: "overtime_expense_account",
    label: "Overtime Expense",
    defaultCode: "6010",
    group: "Payroll",
    description: "Overtime pay on payroll.",
  },
  {
    field: "allowances_expense_account",
    label: "Allowances Expense",
    defaultCode: "6020",
    group: "Payroll",
    description: "Housing, transport, and other allowances.",
  },
  {
    field: "employer_statutory_expense_account",
    label: "Employer Statutory Expense",
    defaultCode: "6030",
    group: "Payroll",
    description: "Employer SSNIT and tier contributions.",
  },
  {
    field: "paye_tax_payable_account",
    label: "PAYE Tax Payable",
    defaultCode: "2300",
    group: "Payroll",
    description: "Income tax withheld from employees.",
  },
  {
    field: "payroll_deductions_payable_account",
    label: "Payroll Deductions Payable",
    defaultCode: "2310",
    group: "Payroll",
    description: "Employee SSNIT, pension, and other deductions.",
  },
  {
    field: "employer_statutory_payable_account",
    label: "Employer Statutory Payable",
    defaultCode: "2315",
    group: "Payroll",
    description: "Employer statutory contributions owed.",
  },
];

export const CONTROL_ACCOUNT_GROUPS = [
  "Receivables & Payables",
  "Revenue & Tax",
  "Purchasing & Inventory",
  "Cash & Banking",
  "Payroll",
] as const;

type AccountingSettingsLike = Partial<Record<ControlAccountField, number | null | undefined>>;

/** Map account IDs to the control roles they serve (for COA badges). */
export function buildControlAccountRoleMap(
  settings: AccountingSettingsLike | undefined
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (!settings) {
    return map;
  }
  for (const spec of CONTROL_ACCOUNT_SPECS) {
    const accountId = settings[spec.field];
    if (accountId) {
      const roles = map.get(accountId) ?? [];
      roles.push(spec.label);
      map.set(accountId, roles);
    }
  }
  return map;
}
