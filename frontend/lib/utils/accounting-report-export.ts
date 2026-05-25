import type { AccountBalance } from "@/lib/api/accounting";
import type { TableExportPayload } from "@/lib/utils/report-export";

type ProfitLossLine = { code: string; name: string; balance: number | string };
type ProfitLossReport = { income?: ProfitLossLine[]; expenses?: ProfitLossLine[] };

type TrialBalanceAccount = {
  code: string;
  name: string;
  type: string;
  debit: number | string;
  credit: number | string;
};

type TrialBalanceReport = {
  accounts: TrialBalanceAccount[];
  totals: { debits: number | string; credits: number | string };
};

type CashFlowActivities = { inflows: number; outflows: number; net: number };
type CashFlowReport = {
  opening_balance: number;
  operating_activities: CashFlowActivities;
  investing_activities: CashFlowActivities;
  financing_activities: CashFlowActivities;
  net_increase_decrease: number;
  closing_balance: number;
};

type BalanceSheetReport = {
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  totals: {
    assets: number;
    liabilities: number;
    equity: number;
    liabilities_plus_equity: number;
  };
};

type AgingDetail = {
  number: string;
  entity: string;
  date: string;
  due_date?: string | null;
  bucket: string;
  amount: number;
};

type AgingReport = {
  summary: Record<string, number> & { current: number; total: number };
  details: AgingDetail[];
};

function sectionRows(
  section: string,
  accounts: AccountBalance[],
  totalLabel: string,
  total: number
): (string | number)[][] {
  const rows: (string | number)[][] = [[section, "", ""]];
  accounts.forEach((acc) => rows.push([acc.code, acc.name, acc.balance]));
  rows.push(["", totalLabel, total]);
  rows.push(["", "", ""]);
  return rows;
}

export function buildBalanceSheetExportPayload(
  report: BalanceSheetReport,
  asOfDate: string
): TableExportPayload {
  const rows: (string | number)[][] = [
    ...sectionRows("ASSETS", report.assets, "Total Assets", report.totals.assets),
    ...sectionRows("LIABILITIES", report.liabilities, "Total Liabilities", report.totals.liabilities),
    ...sectionRows("EQUITY", report.equity, "Total Equity", report.totals.equity),
    ["", "Total Liabilities + Equity", report.totals.liabilities_plus_equity],
  ];

  return {
    filename: `balance-sheet_${asOfDate}`,
    reportTitle: "Balance Sheet",
    dateInfo: `As of: ${asOfDate}`,
    headers: ["Account Code", "Account Name", "Amount"],
    rows,
    currencyColumnIndexes: [2],
  };
}

export function buildProfitLossExportPayload(
  report: ProfitLossReport,
  startDate: string,
  endDate: string,
  totals: { totalIncome: number; totalExpenses: number; netIncome: number }
): TableExportPayload {
  const rows: (string | number)[][] = [
    ["INCOME", "", ""],
    ...(report.income?.map((item) => [item.code, item.name, Number(item.balance || 0)]) ?? []),
    ["", "Total Income", totals.totalIncome],
    ["", "", ""],
    ["EXPENSES", "", ""],
    ...(report.expenses?.map((item) => [item.code, item.name, Number(item.balance || 0)]) ?? []),
    ["", "Total Expenses", totals.totalExpenses],
    ["", "", ""],
    ["", "NET INCOME", totals.netIncome],
  ];

  return {
    filename: `profit-loss_${startDate}_${endDate}`,
    reportTitle: "Profit & Loss Statement",
    dateInfo: `Period: ${startDate} to ${endDate}`,
    headers: ["Account Code", "Account Name", "Amount"],
    rows,
    currencyColumnIndexes: [2],
  };
}

export function buildTrialBalanceExportPayload(
  report: TrialBalanceReport,
  asOfDate: string
): TableExportPayload {
  const rows: (string | number)[][] = [
    ...(report.accounts.map((account) => [
      account.code,
      account.name,
      account.type,
      Number(account.debit) > 0 ? account.debit : 0,
      Number(account.credit) > 0 ? account.credit : 0,
    ]) ?? []),
    ["", "", "Totals", report.totals.debits, report.totals.credits],
  ];

  return {
    filename: `trial-balance_${asOfDate}`,
    reportTitle: "Trial Balance",
    dateInfo: `As of: ${asOfDate}`,
    headers: ["Code", "Account Name", "Type", "Debit", "Credit"],
    rows,
    currencyColumnIndexes: [3, 4],
  };
}

export function buildCashFlowExportPayload(
  report: CashFlowReport,
  startDate: string,
  endDate: string
): TableExportPayload {
  const rows: (string | number)[][] = [
    ["Opening Balance", report.opening_balance],
    ["", ""],
    ["OPERATING ACTIVITIES", ""],
    ["Cash Inflows", report.operating_activities.inflows],
    ["Cash Outflows", report.operating_activities.outflows],
    ["Net Cash from Operating", report.operating_activities.net],
    ["", ""],
    ["INVESTING ACTIVITIES", ""],
    ["Cash Inflows", report.investing_activities.inflows],
    ["Cash Outflows", report.investing_activities.outflows],
    ["Net Cash from Investing", report.investing_activities.net],
    ["", ""],
    ["FINANCING ACTIVITIES", ""],
    ["Cash Inflows", report.financing_activities.inflows],
    ["Cash Outflows", report.financing_activities.outflows],
    ["Net Cash from Financing", report.financing_activities.net],
    ["", ""],
    ["Net Increase/Decrease in Cash", report.net_increase_decrease],
    ["Closing Balance", report.closing_balance],
  ];

  return {
    filename: `cash-flow_${startDate}_${endDate}`,
    reportTitle: "Statement of Cash Flows",
    dateInfo: `Period: ${startDate} to ${endDate}`,
    headers: ["Item", "Amount"],
    rows,
    currencyColumnIndexes: [1],
  };
}

export function buildAgingExportPayload(
  report: AgingReport,
  activeTab: string,
  asOfDate: string
): TableExportPayload {
  const rows: (string | number)[][] = [
    ["Summary", ""],
    ["Current", report.summary.current],
    ["1-30 Days", report.summary["1-30"] ?? 0],
    ["31-60 Days", report.summary["31-60"] ?? 0],
    ["61-90 Days", report.summary["61-90"] ?? 0],
    ["90+ Days", report.summary["90+"] ?? 0],
    ["Total", report.summary.total],
    ["", ""],
    ["Details", "", "", "", "", ""],
    ...report.details.map((item) => [
      item.number,
      item.entity,
      item.date,
      item.due_date || "N/A",
      item.bucket,
      item.amount,
    ]),
  ];

  return {
    filename: `aging-${activeTab}_${asOfDate}`,
    reportTitle: `${activeTab.toUpperCase()} Aging Report`,
    dateInfo: `As of: ${asOfDate}`,
    headers: ["Number", "Entity", "Date", "Due Date", "Bucket", "Amount"],
    rows,
    currencyColumnIndexes: [1, 5],
  };
}
