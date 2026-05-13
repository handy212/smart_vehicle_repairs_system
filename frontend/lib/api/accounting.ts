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


    getAccounts: async (): Promise<Account[]> => {
        const response = await apiClient.get("/accounting/accounts/");
        return response.data.results || response.data;
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


    updateAccountingSettings: async (data: QueryParams): Promise<unknown> => {
        const response = await apiClient.patch("/accounting/control/settings/", data);
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


    getJournalEntries: async (): Promise<JournalEntry[]> => {
        const response = await apiClient.get("/accounting/journal-entries/");
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


    getManagementMetrics: async (startDate?: string, endDate?: string): Promise<unknown> => {

        const params: QueryParams = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        const response = await apiClient.get("/accounting/reports/management-dashboard/", { params });
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
    }
};
