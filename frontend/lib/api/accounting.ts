import apiClient from "./client";

// ============================================================================
// Types
// ============================================================================

export interface AccountBalance {
    code: string;
    name: string;
    balance: number; // Backend returns Decimal, frontend sees string or number? DRF DecimalField usually string? 
    // DRF default for DecimalField is typically string to preserve precision, 
    // but usually JSON parsers or client configs might convert. 
    // Let's assume string or number, but safely type as string for precision or number if converted.
    // Previous reports used number in types. I will use number for simplicity in UI, but keep in mind parsing.
}

export interface BalanceSheetReport {
    date: string;
    assets: AccountBalance[];
    liabilities: AccountBalance[];
    equity: AccountBalance[];
    totals: {
        assets: number;
        liabilities: number;
        equity: number;
        liabilities_plus_equity: number;
    };
    is_balanced: boolean;
}

export interface ProfitLossReport {
    period: {
        start: string;
        end: string;
    };
    income: AccountBalance[];
    expenses: AccountBalance[];
    totals: {
        income: number;
        expenses: number;
        net_income: number;
    };
}

type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface Account {
    id: number;
    code: string;
    name: string;
    account_type: string;
    balance_type?: string;
    account_subtype?: string;
    parent?: number | null;
    parent_code?: string | null;
    parent_name?: string | null;
    is_till_enabled?: boolean;
    children_count?: number;
    is_active?: boolean;
    balance?: number | string;
}

export interface JournalTransaction {
    id: number | string;
    account_id?: number;
    account?: Account;
    amount: number | string;
    transaction_type: "debit" | "credit";
    description?: string;
    date?: string;
    reference?: string;
}

export interface JournalEntry {
    id: number;
    date: string;
    description: string;
    reference?: string;
    posted: boolean;
    branch_id?: number | null;
    transactions: JournalTransaction[];
}

export interface JournalEntryCreatePayload {
    date: string;
    description: string;
    reference?: string;
    transactions: Array<{
        account_id: number;
        amount: number;
        transaction_type: "debit" | "credit";
        description?: string;
    }>;
}

export interface BankStatement {
    id: number | string;
    bank_account: number | string;
    bank_account_name?: string;
    statement_date: string;
    opening_balance: number | string;
    closing_balance: number | string;
    reconciled: boolean;
    lines?: BankStatementLine[];
}

export interface BankStatementLine {
    id: number | string;
    transaction_date: string;
    description: string;
    debit_amount: number | string;
    credit_amount: number | string;
    matched: boolean;
}

export interface BankStatementCreatePayload {
    bank_account: number | string;
    statement_date: string;
    opening_balance: number | string;
    closing_balance: number | string;
}

export interface Accrual {
    id: number;
    accrual_type: "expense" | "revenue";
    account: number;
    account_code?: string;
    account_name?: string;
    amount: number | string;
    accrual_date: string;
    reversal_date?: string | null;
    description: string;
    status: "active" | "reversed";
    source_model?: string;
    source_id?: number | null;
    source_reference?: string;
}

export interface AccrualCandidate {
    type: "expense" | "revenue";
    source_model: string;
    source_id: number;
    source_reference: string;
    amount: number | string;
    date: string;
    description: string;
}

export interface AccrualCreatePayload {
    accrual_type: "expense" | "revenue";
    account: string | number;
    amount: FormDataEntryValue | number | string | null;
    accrual_date: FormDataEntryValue | string | null;
    reversal_date?: FormDataEntryValue | string | null;
    description: FormDataEntryValue | string | null;
    source_model?: string;
    source_id?: number;
    source_reference?: string;
}

export interface Budget {
    id: number;
    name: string;
    fiscal_year: number;
    start_date: string;
    end_date: string;
    branch_name?: string | null;
    status: string;
}

export interface FundTransfer {
    id: number;
    transfer_number: string;
    from_account: number;
    to_account: number;
    from_account_name?: string;
    to_account_name?: string;
    amount: number | string;
    transfer_date: string;
    description: string;
    reference?: string;
    status: "draft" | "pending" | "approved" | "completed" | "cancelled";
}

export interface CashCount {
    id?: number;
    denomination: string;
    quantity: number;
    total?: string;
    count_type?: "opening" | "closing";
}

export interface Till {
    id: number;
    branch: number;
    branch_name: string;
    cashier: number;
    cashier_name: string;
    till_account: number;
    till_account_name?: string;
    till_account_code?: string;
    status: "open" | "closed";
    opened_at: string;
    closed_at?: string | null;
    opening_balance: string;
    closing_balance?: string | null;
    expected_balance?: string | null;
    variance?: string | null;
    variance_approval_status?: string;
    is_balanced?: boolean;
    duration?: string;
    cash_payments_total?: string;
    cash_refunds_total?: string;
    cash_bill_payments_total?: string;
    till_cash_movements_net?: string;
    current_expected_balance?: string;
    notes: string;
    cash_counts: CashCount[];
}

export interface TillCashMovement {
    id: number;
    till: number;
    movement_type: "pay_in" | "pay_out";
    amount: string;
    reason: string;
    recorded_by: number;
    recorded_by_name: string;
    created_at: string;
}

export interface TillReconciliationRow {
    id: number;
    branch_name: string;
    till_account_id?: number;
    till_account_code: string;
    till_account_name: string;
    status: string;
    opened_at: string;
    closed_at?: string | null;
    opened_by: string;
    closed_by?: string;
    opening_balance: string;
    cash_received: string;
    cash_paid_out: string;
    net_movements: string;
    expected_balance: string;
    actual_counted_balance: string;
    variance: string;
    shortage: string;
    excess: string;
    variance_reason: string;
    variance_approval_status: string;
}

export interface TillReconciliationReport {
    period: { start: string; end: string };
    results: TillReconciliationRow[];
    totals: Record<string, string>;
}

export interface ApiError {
    response?: {
        data?: {
            error?: string;
            detail?: string;
        };
    };
    message?: string;
}

export interface AccountingSettings {
    period_lock_date?: string | null;
    accounts_receivable_account?: number | null;
    accounts_payable_account?: number | null;
    customer_prepayment_account?: number | null;
    sales_revenue_account?: number | null;
    sales_discount_account?: number | null;
    sales_tax_payable_account?: number | null;
    shop_supplies_revenue_account?: number | null;
    environmental_fee_revenue_account?: number | null;
    input_tax_account?: number | null;
    default_expense_account?: number | null;
    purchase_returns_account?: number | null;
    inventory_asset_account?: number | null;
    cost_of_goods_sold_account?: number | null;
    cash_over_short_account?: number | null;
    till_counterparty_cash_account?: number | null;
    default_bank_account?: number | null;
    updated_at?: string;
    updated_by?: number | null;
}

export interface SubledgerSideReport {
    gl_balance: number;
    prepayment_gl_balance?: number;
    net_gl_balance?: number;
    operational_prepayments?: number;
    subledger_balance: number;
    unapplied_customer_credit_notes?: number;
    unapplied_vendor_credits?: number;
    subledger_net_of_credits: number;
    subledger_net_of_credits_and_prepayments?: number;
    difference: number;
    in_balance: boolean;
    open_invoice_count?: number;
    open_bill_count?: number;
    open_credit_note_count?: number;
    open_vendor_credit_count?: number;
    control_account_id?: number | null;
    control_account_code?: string | null;
}

export interface SubledgerReconciliationReport {
    as_of_date: string | null;
    branch_id: number | null;
    tolerance: number;
    accounts_receivable: SubledgerSideReport;
    accounts_payable: SubledgerSideReport;
    customer_prepayments?: {
        gl_balance: number;
        operational_balance: number;
        control_account_id?: number | null;
        control_account_code?: string | null;
        configured: boolean;
    };
    overall_in_balance: boolean;
}

export interface WireAccountingControlsResult {
    changed_fields: string[];
    skipped: string[];
    settings: AccountingSettings;
}

export interface AuditLog {
    id: number;
    timestamp: string;
    user_name?: string;
    action: string;
    resource_type: string;
    resource_id: string;
    details: string;
}

export interface AuditLogResponse {
    results?: AuditLog[];
}

export interface TaxReport {
    tax_collected: {
        vat: number | string;
        nhil: number | string;
        getfund: number | string;
        hrl: number | string;
        total: number | string;
    };
    tax_paid: {
        total: number | string;
    };
    invoice_count: number;
    bill_count: number;
    net_tax_liability: number;
}

export interface FinancialRatiosReport {
    as_of_date: string;
    period: { start: string; end: string };
    inputs: Record<string, number>;
    ratios: Record<string, number | null>;
}

export interface VatReturnReport {
    period: { start: string; end: string };
    worksheet: {
        output_vat: number | string;
        output_nhil: number | string;
        output_getfund: number | string;
        output_hrl: number | string;
        total_output_tax: number | string;
        input_vat: number | string;
        net_vat_payable: number | string;
    };
    supporting: { invoice_count: number; bill_count: number };
    status: string;
}

export interface TaxReconciliationReport {
    period: { start: string; end: string };
    gl: {
        output_tax_balance: number;
        input_tax_balance: number;
        net_position: number;
    };
    operational: {
        output_tax_total: number;
        input_tax_total: number;
        net_position: number;
    };
    variance: {
        output: number;
        input: number;
        net: number;
    };
    in_balance: boolean;
}

export interface WithholdingTaxReport {
    period: { start: string; end: string };
    configured: boolean;
    control_account?: { code: string; name: string } | null;
    lines: Array<{ code: string; name: string; balance: number }>;
    total_withheld: number;
    period_transactions?: Array<{
        payment_number: string;
        payment_date: string;
        vendor: string;
        bill_number: string;
        wht_rate: number;
        wht_amount: number;
        net_paid: number;
        gross_amount: number;
        certificate: string;
    }>;
    period_withheld_total?: number;
    note?: string | null;
}

export interface VatReturnFiling {
    id: number;
    period_start: string;
    period_end: string;
    branch?: number | null;
    branch_name?: string | null;
    worksheet: VatReturnReport['worksheet'];
    status: 'draft' | 'reviewed' | 'filed' | 'paid';
    filing_reference?: string;
    filed_at?: string | null;
    paid_at?: string | null;
    payment_reference?: string;
    payment_journal_entry?: number | null;
    gra_acknowledgment?: string;
    gra_submitted_at?: string | null;
    gra_submission_mode?: 'manual' | 'api' | '';
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

export interface GeneralLedgerLine {
    id: number;
    journal_entry_id?: number;
    date: string;
    reference?: string;
    posted?: boolean;
    branch_id?: number | null;
    account_code?: string;
    account_name?: string;
    amount: number | string;
    transaction_type: "debit" | "credit";
    description?: string;
    debit?: number | string;
    credit?: number | string;
}

export interface TrialBalanceReport {
    accounts: Array<{
        code: string;
        name: string;
        type: string;
        debit: number | string;
        credit: number | string;
    }>;
    totals: {
        debits: number | string;
        credits: number | string;
    };
    is_balanced: boolean;
}

export interface AccountingCommandCenterSnapshot {
    period: { start: string; end: string };
    branch_id: number | null;
    role_view: string;
    financial_position: {
        total_assets: number;
        total_liabilities: number;
        equity: number;
        current_profit_loss: number;
        net_worth: number;
        is_balanced: boolean;
        inventory_gl_value?: number;
        inventory_operational_value?: number;
    };
    revenue_expenses: {
        revenue_today: number;
        revenue_this_month: number;
        revenue_this_year: number;
        expenses_this_period: number;
        gross_profit: number;
        net_profit: number;
    };
    cash_position: {
        cash_on_hand: number;
        bank_balance: number;
        till_balances: number;
        total_available_cash: number;
        runway_months: number;
        negative_cash_accounts: Array<{ name: string; balance: number }>;
    };
    working_capital: {
        accounts_receivable: number;
        accounts_payable: number;
        outstanding_customer_balances: number;
        outstanding_supplier_balances: number;
        net_working_capital: number;
    };
    revenue_analytics: {
        trend: Array<{ period: string; revenue: number }>;
        by_branch: Array<{ branch_id: number; branch_name: string; invoiced: number; collected: number; share_percent: number }>;
        by_service_type: Array<{ product?: string; label: string; invoiced: number; collected: number }>;
        top_customers: Array<{ customer: string; revenue: number; invoice_count: number; last_invoice_date?: string | null }>;
    };
    expense_analytics: {
        trend: Array<{ date: string; expense: number }>;
        categories: Array<{ name: string; value: number; percent: number }>;
        top_categories: Array<{ name: string; amount: number }>;
    };
    receivables: {
        total_outstanding: number;
        aging_buckets: Record<string, number | string>;
        top_debtors: Array<{ id: number; number: string; entity: string; amount: number; due_date?: string | null }>;
        overdue_invoices: Array<{ id: number; number: string; customer: string; amount_due: number; due_date?: string | null }>;
    };
    payables: {
        total_outstanding: number;
        summary: {
            total_outstanding: number;
            due_this_week: number;
            due_this_week_count: number;
            due_this_month: number;
            due_this_month_count: number;
            overdue_bills: number;
            overdue_bills_count: number;
        };
        aging_buckets: Record<string, number | string>;
        top_creditors: Array<{ supplier_id: number; supplier_name: string; amount_due: number; expected_payment_date?: string | null }>;
        upcoming_payments: Array<{ days: number; label: string; amount: number; count: number }>;
        pending_approvals: number;
    };
    cash_bank: {
        till_accounts: Array<{
            id: number;
            code?: string;
            name: string;
            balance: number;
            open_till_status: string;
            last_till_closure?: string | null;
            last_reconciliation?: string | null;
            variance_status?: string;
            href?: string;
        }>;
        bank_accounts: Array<{
            id: number;
            bank_name?: string;
            name: string;
            account_name?: string;
            balance: number;
            ledger_balance?: number;
            reconciled_balance: number;
            difference?: number;
            last_reconciliation_date?: string | null;
            unreconciled_transactions: number;
            href?: string;
        }>;
    };
    till_management: {
        open_tills: Array<{
            id: number;
            user: string;
            branch: string;
            till_account?: string;
            opening_balance: number;
            current_balance: number;
            open_duration?: string;
            href?: string;
        }>;
        totals: {
            open_tills?: number;
            closed_tills_today?: number;
            pending_closures?: number;
            shortages: number;
            excesses: number;
            pay_ins: number;
            pay_outs: number;
            cash_receipts: number;
            cash_refunds: number;
            net_movement: number;
            pending_variance_approvals: number;
        };
        pending_supervisor_actions: Array<{
            id: number;
            user: string;
            branch: string;
            till_account?: string;
            variance: number;
            closed_at?: string | null;
            reason?: string;
            href?: string;
            approve_href?: string;
        }>;
    };
    tax: {
        vat_collected: number;
        vat_payable: number;
        input_vat: number;
        output_vat: number;
        tax_due: number;
        tax_credit?: number;
        net_tax_position?: number;
        deadlines: Array<{
            label: string;
            tax_type?: string;
            due_date: string;
            filing_date?: string;
            days_remaining?: number;
            severity?: "critical" | "warning" | "info";
        }>;
    };
    statements: {
        profit_loss: {
            revenue: number;
            cost_of_sales: number;
            gross_profit: number;
            expenses: number;
            net_profit: number;
            trend?: Record<string, "up" | "down" | "stable">;
        };
        balance_sheet: {
            assets: number;
            liabilities: number;
            equity: number;
            trend?: Record<string, "up" | "down" | "stable">;
        };
        cash_flow: {
            operating_cash_flow: number;
            investing_cash_flow: number;
            financing_cash_flow: number;
            closing_balance: number;
            trend?: Record<string, "up" | "down" | "stable">;
        };
    };
    financial_health?: Record<string, { status: "healthy" | "warning" | "critical"; label: string; message: string }>;
    alerts: Array<{ severity: "critical" | "warning" | "info"; title: string; message: string; href?: string }>;
    monitoring?: Array<{
        id: string;
        title: string;
        severity: "critical" | "warning" | "info";
        items: Array<{
            id: string;
            label: string;
            count: number;
            amount?: number;
            href?: string;
        }>;
    }>;
    recent_activity: {
        journal_entries: Array<{ id: number; reference?: string; description?: string; date?: string | null; posted: boolean }>;
    };
}

// ============================================================================
// API Client
// ============================================================================

export const accountingApi = {
    // Financial Reports
    getBalanceSheet: async (date?: string): Promise<BalanceSheetReport> => {
        const params = date ? { date } : {};
        const response = await apiClient.get("/accounting/reports/balance-sheet/", { params });
        return response.data;
    },

    getProfitLoss: async (startDate?: string, endDate?: string, branchId?: number): Promise<ProfitLossReport> => {

        const params: QueryParams = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        if (branchId) params.branch_id = branchId;

        const response = await apiClient.get("/accounting/reports/profit-loss/", { params });
        return response.data;
    },


    getRecentTransactions: async (): Promise<JournalEntry[]> => {
        const response = await apiClient.get("/accounting/journal-entries/");
        return response.data.results || response.data;
    },


    getAccounts: async (params?: QueryParams): Promise<Account[]> => {
        const response = await apiClient.get("/accounting/accounts/", { params });
        return response.data.results || response.data;
    },

    getTillEnabledAccounts: async (): Promise<Account[]> => {
        const response = await apiClient.get("/accounting/accounts/", {
            params: { is_till_enabled: true, is_active: true },
        });
        return response.data.results || response.data;
    },

    getBankAccounts: async (): Promise<Account[]> => {
        const response = await apiClient.get("/accounting/accounts/", {
            params: { account_type: "asset", account_subtype: "bank", is_active: true },
        });
        const bankAccounts = response.data.results || response.data;
        const cashEquivalentsResponse = await apiClient.get("/accounting/accounts/", {
            params: { account_type: "asset", account_subtype: "cash_equivalent", is_active: true },
        });
        const cashEquivalents = cashEquivalentsResponse.data.results || cashEquivalentsResponse.data;
        return [...bankAccounts, ...cashEquivalents].filter((account: Account) => (account.children_count || 0) === 0);
    },


    createJournalEntry: async (data: JournalEntryCreatePayload): Promise<JournalEntry> => {
        const response = await apiClient.post("/accounting/journal-entries/create/", data);
        return response.data;
    },


    getTrialBalance: async (date?: string): Promise<TrialBalanceReport> => {
        const response = await apiClient.get("/accounting/reports/trial-balance/", {
            params: { date },
        });
        return response.data;
    },


    getAgingReport: async (type: 'ar' | 'ap', date?: string): Promise<unknown> => {
        const response = await apiClient.get("/accounting/reports/aging/", {
            params: { type, date },
        });
        return response.data;
    },


    getCashFlowStatement: async (startDate?: string, endDate?: string): Promise<unknown> => {
        const response = await apiClient.get("/accounting/reports/cash-flow/", {
            params: { start_date: startDate, end_date: endDate },
        });
        return response.data;
    },


    getAccountingSettings: async (): Promise<AccountingSettings> => {
        const response = await apiClient.get("/accounting/control/settings/");
        return response.data;
    },


    updateAccountingSettings: async (data: QueryParams): Promise<AccountingSettings> => {
        const response = await apiClient.patch("/accounting/control/settings/", data);
        return response.data;
    },

    wireAccountingControls: async (force = true): Promise<WireAccountingControlsResult> => {
        const response = await apiClient.post("/accounting/control/wire/", { force });
        return response.data;
    },

    getSubledgerReconciliation: async (params?: QueryParams): Promise<SubledgerReconciliationReport> => {
        const response = await apiClient.get("/accounting/reports/subledger-reconciliation/", { params });
        return response.data;
    },


    getAuditLogs: async (filters?: QueryParams): Promise<AuditLogResponse | AuditLog[]> => {
        const response = await apiClient.get("/accounting/control/audit-log/", { params: filters });
        return response.data;
    },


    getTaxReport: async (startDate?: string, endDate?: string): Promise<TaxReport> => {
        const response = await apiClient.get("/accounting/reports/tax/", {
            params: { start_date: startDate, end_date: endDate },
        });
        return response.data;
    },


    getJournalEntries: async (params?: QueryParams): Promise<JournalEntry[]> => {
        const response = await apiClient.get("/accounting/journal-entries/", { params });
        return response.data.results || response.data;
    },

    getBudgets: async (params?: QueryParams): Promise<Budget[]> => {
        const response = await apiClient.get("/accounting/budgets/", { params });
        return response.data.results || response.data;
    },

    getFundTransfers: async (params?: QueryParams): Promise<FundTransfer[]> => {
        const response = await apiClient.get("/accounting/fund-transfers/", { params });
        return response.data.results || response.data;
    },


    getJournalEntry: async (id: string | number): Promise<JournalEntry> => {
        const response = await apiClient.get(`/accounting/journal-entries/${id}/`);
        return response.data;
    },


    reverseJournalEntry: async (id: string | number, data?: { date?: string; reason?: string }): Promise<JournalEntry> => {
        const response = await apiClient.post(`/accounting/journal-entries/${id}/reverse/`, data || {});
        return response.data;
    },


    closePeriod: async (data: { start_date: string; end_date: string; branch?: number | null }): Promise<JournalEntry> => {
        const response = await apiClient.post("/accounting/period-close/", data);
        return response.data;
    },

    // Bank Reconciliation

    getBankStatements: async (accountId?: string): Promise<BankStatement[]> => {
        const params = accountId ? { bank_account: accountId } : {};
        const response = await apiClient.get("/accounting/bank-statements/", { params });
        // Handle pagination
        if (response.data.results) {
            return response.data.results;
        }
        return response.data;
    },


    getBankStatement: async (id: string): Promise<BankStatement> => {
        const response = await apiClient.get(`/accounting/bank-statements/${id}/`);
        return response.data;
    },


    createBankStatement: async (data: BankStatementCreatePayload): Promise<BankStatement> => {
        const response = await apiClient.post("/accounting/bank-statements/", data);
        return response.data;
    },


    uploadBankStatement: async (id: string, file: File): Promise<unknown> => {
        const formData = new FormData();
        formData.append("statement_file", file);
        const response = await apiClient.post(`/accounting/bank-statements/${id}/upload/`, formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });
        return response.data;
    },


    getUnreconciledTransactions: async (accountId: string, startDate?: string, endDate?: string): Promise<JournalTransaction[]> => {

        const params: QueryParams = { account_id: accountId };
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;

        const response = await apiClient.get("/accounting/transactions/unreconciled/", { params });
        // Handle pagination
        if (response.data.results) {
            return response.data.results;
        }
        return response.data;
    },


    matchBankLine: async (lineId: string, transactionId: string): Promise<unknown> => {
        const response = await apiClient.post(`/accounting/bank-statement-lines/${lineId}/match/`, { transaction_id: transactionId });
        return response.data;
    },


    unmatchBankLine: async (lineId: string): Promise<unknown> => {
        const response = await apiClient.post(`/accounting/bank-statement-lines/${lineId}/unmatch/`);
        return response.data;
    },


    reconcileStatement: async (id: string): Promise<unknown> => {
        const response = await apiClient.post(`/accounting/bank-statements/${id}/reconcile/`);
        return response.data;
    },

    getTills: async (params?: QueryParams): Promise<Till[]> => {
        const response = await apiClient.get("/accounting/tills/", { params });
        return response.data.results || response.data;
    },

    getTill: async (id: number): Promise<Till> => {
        const response = await apiClient.get(`/accounting/tills/${id}/`);
        return response.data;
    },

    openTill: async (data: { till_account: number | string; opening_balance: string; cash_counts?: CashCount[] }): Promise<Till> => {
        const response = await apiClient.post("/accounting/tills/open/", data);
        return response.data;
    },

    closeTill: async (
        id: number,
        data: { cash_counts?: CashCount[]; counted_amount?: string; notes?: string }
    ): Promise<{ closing_balance: string; expected_balance: string; variance: string; variance_approval_status: string; is_balanced: boolean }> => {
        const response = await apiClient.post(`/accounting/tills/${id}/close/`, data);
        return response.data;
    },

    getCurrentTill: async (params?: QueryParams): Promise<Till | { id: null; message: string }> => {
        const response = await apiClient.get("/accounting/tills/current/", { params });
        return response.data;
    },

    getTillMovements: async (id: number): Promise<TillCashMovement[]> => {
        const response = await apiClient.get(`/accounting/tills/${id}/movements/`);
        return response.data;
    },

    recordTillMovement: async (
        id: number,
        data: { movement_type: "pay_in" | "pay_out"; amount: string; reason?: string }
    ): Promise<TillCashMovement> => {
        const response = await apiClient.post(`/accounting/tills/${id}/record_movement/`, data);
        return response.data;
    },

    approveTillVariance: async (id: number): Promise<Till> => {
        const response = await apiClient.post(`/accounting/tills/${id}/approve-variance/`);
        return response.data;
    },

    getTillReconciliationReport: async (params?: QueryParams): Promise<TillReconciliationReport> => {
        const response = await apiClient.get("/accounting/reports/till-reconciliation/", { params });
        return response.data;
    },


    getManagementMetrics: async (startDate?: string, endDate?: string): Promise<unknown> => {

        const params: QueryParams = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        const response = await apiClient.get("/accounting/reports/management-dashboard/", { params });
        return response.data;
    },

    getGeneralLedger: async (params?: {
        start_date?: string;
        end_date?: string;
        account_id?: number;
        page?: number;
    }) => {
        const response = await apiClient.get("/accounting/reports/general-ledger/", { params });
        return response.data;
    },

    exportBoardPack: async (startDate: string, endDate: string): Promise<Blob> => {
        const response = await apiClient.post("/accounting/reports/management-dashboard/", {
            action: 'export_pdf',
            start_date: startDate,
            end_date: endDate
        }, {
            responseType: 'blob'
        });
        return response.data;
    },

    // Accruals

    getAccruals: async (filters?: QueryParams): Promise<Accrual[]> => {
        const response = await apiClient.get("/accounting/accruals/", { params: filters });
        if (response.data.results) return response.data.results;
        return response.data;
    },


    getAccrualCandidates: async (cutoffDate?: string): Promise<AccrualCandidate[]> => {
        const params = cutoffDate ? { cutoff_date: cutoffDate } : {};
        const response = await apiClient.get("/accounting/accruals/candidates/", { params });
        return response.data;
    },


    createAccrual: async (data: AccrualCreatePayload): Promise<Accrual> => {
        const response = await apiClient.post("/accounting/accruals/", data);
        return response.data;
    },


    reverseAccrual: async (id: number): Promise<Accrual> => {
        const response = await apiClient.post(`/accounting/accruals/${id}/reverse/`);
        return response.data;
    },


    getAnalyticsSnapshot: async (params?: Record<string, string>): Promise<unknown> => {
        const queryParams = new URLSearchParams(params).toString();
        const response = await apiClient.get(`/accounting/analytics/dashboard/?${queryParams}`);
        return response.data;
    },

    getCommandCenterSnapshot: async (params?: Record<string, string>): Promise<AccountingCommandCenterSnapshot> => {
        const response = await apiClient.get("/accounting/dashboard/command-center/", { params });
        return response.data;
    },

    getProfitLossComparative: async (
        startDate: string,
        endDate: string,
        comparison: 'mom' | 'yoy' = 'mom',
        branchId?: number
    ): Promise<unknown> => {
        const params: QueryParams = { start_date: startDate, end_date: endDate, comparison };
        if (branchId) params.branch_id = branchId;
        const response = await apiClient.get("/accounting/reports/profit-loss-comparative/", { params });
        return response.data;
    },

    getConsolidatedProfitLoss: async (startDate: string, endDate: string): Promise<unknown> => {
        const response = await apiClient.get("/accounting/reports/consolidated-profit-loss/", {
            params: { start_date: startDate, end_date: endDate },
        });
        return response.data;
    },

    getBranchPLScorecard: async (startDate: string, endDate: string): Promise<unknown> => {
        const response = await apiClient.get("/accounting/reports/branch-pl-scorecard/", {
            params: { start_date: startDate, end_date: endDate },
        });
        return response.data;
    },

    getSupplierAPAging: async (date?: string, branchId?: number): Promise<unknown> => {
        const params: QueryParams = {};
        if (date) params.date = date;
        if (branchId) params.branch_id = branchId;
        const response = await apiClient.get("/accounting/reports/supplier-ap-aging/", { params });
        return response.data;
    },

    getCashCollectionReport: async (
        startDate: string,
        endDate: string,
        branchId?: number
    ): Promise<unknown> => {
        const params: QueryParams = { start_date: startDate, end_date: endDate };
        if (branchId) params.branch_id = branchId;
        const response = await apiClient.get("/accounting/reports/cash-collection/", { params });
        return response.data;
    },

    getRevenueMix: async (startDate: string, endDate: string, branchId?: number): Promise<unknown> => {
        const params: QueryParams = { start_date: startDate, end_date: endDate };
        if (branchId) params.branch_id = branchId;
        const response = await apiClient.get("/accounting/reports/revenue-mix/", { params });
        return response.data;
    },

    getExpenseBreakdown: async (startDate: string, endDate: string, branchId?: number): Promise<unknown> => {
        const params: QueryParams = { start_date: startDate, end_date: endDate };
        if (branchId) params.branch_id = branchId;
        const response = await apiClient.get("/accounting/reports/expense-breakdown/", { params });
        return response.data;
    },

    getCostControlReport: async (
        startDate: string,
        endDate: string,
        branchId?: number
    ): Promise<unknown> => {
        const params: QueryParams = { start_date: startDate, end_date: endDate };
        if (branchId) params.branch_id = branchId;
        const response = await apiClient.get("/accounting/reports/cost-control/", { params });
        return response.data;
    },

    getOpexVariance: async (
        budgetId: number,
        startDate?: string,
        endDate?: string
    ): Promise<unknown> => {
        const params: QueryParams = { budget_id: budgetId };
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        const response = await apiClient.get("/accounting/reports/opex-variance/", { params });
        return response.data;
    },

    getFinancialRatios: async (params?: {
        as_of_date?: string;
        start_date?: string;
        end_date?: string;
        branch_id?: number;
    }): Promise<FinancialRatiosReport> => {
        const response = await apiClient.get("/accounting/reports/financial-ratios/", { params });
        return response.data;
    },

    getVatReturn: async (startDate?: string, endDate?: string, branchId?: number): Promise<VatReturnReport> => {
        const params: QueryParams = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        if (branchId) params.branch_id = branchId;
        const response = await apiClient.get("/accounting/reports/vat-return/", { params });
        return response.data;
    },

    getTaxReconciliation: async (
        startDate?: string,
        endDate?: string,
        branchId?: number
    ): Promise<TaxReconciliationReport> => {
        const params: QueryParams = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        if (branchId) params.branch_id = branchId;
        const response = await apiClient.get("/accounting/reports/tax-reconciliation/", { params });
        return response.data;
    },

    getWithholdingTaxReport: async (
        startDate?: string,
        endDate?: string,
        branchId?: number
    ): Promise<WithholdingTaxReport> => {
        const params: QueryParams = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        if (branchId) params.branch_id = branchId;
        const response = await apiClient.get("/accounting/reports/withholding-tax/", { params });
        return response.data;
    },

    vatReturns: {
        list: async (): Promise<VatReturnFiling[]> => {
            const response = await apiClient.get("/accounting/vat-returns/");
            return response.data.results || response.data;
        },
        create: async (data: { period_start: string; period_end: string; branch?: number; notes?: string }) => {
            const response = await apiClient.post("/accounting/vat-returns/", data);
            return response.data as VatReturnFiling;
        },
        review: async (id: number) => {
            const response = await apiClient.post(`/accounting/vat-returns/${id}/review/`);
            return response.data as VatReturnFiling;
        },
        file: async (id: number, filingReference?: string) => {
            const response = await apiClient.post(`/accounting/vat-returns/${id}/file/`, {
                filing_reference: filingReference,
            });
            return response.data as VatReturnFiling;
        },
        recordPayment: async (id: number, paymentReference?: string) => {
            const response = await apiClient.post(`/accounting/vat-returns/${id}/record_payment/`, {
                payment_reference: paymentReference,
            });
            return response.data as VatReturnFiling;
        },
        exportGraCsv: async (id: number) => {
            const response = await apiClient.get(`/accounting/vat-returns/${id}/export_gra_csv/`, {
                responseType: 'blob',
            });
            return response.data as Blob;
        },
        exportGraXml: async (id: number) => {
            const response = await apiClient.get(`/accounting/vat-returns/${id}/export_gra_xml/`, {
                responseType: 'blob',
            });
            return response.data as Blob;
        },
        submitToGra: async (id: number, graAcknowledgment?: string) => {
            const response = await apiClient.post(`/accounting/vat-returns/${id}/submit_to_gra/`, {
                gra_acknowledgment: graAcknowledgment,
            });
            return response.data as VatReturnFiling;
        },
    },
};
