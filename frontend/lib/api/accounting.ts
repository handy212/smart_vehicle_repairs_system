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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const params: any = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        if (branchId) params.branch_id = branchId;

        const response = await apiClient.get("/accounting/reports/profit-loss/", { params });
        return response.data;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getRecentTransactions: async (): Promise<any[]> => {
    const response = await apiClient.get("/accounting/journal-entries/");
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getAccounts: async (): Promise<any[]> => {
    const response = await apiClient.get("/accounting/accounts/");
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
createJournalEntry: async (data: any): Promise<any> => {
    const response = await apiClient.post("/accounting/journal-entries/create/", data);
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getTrialBalance: async (date?: string): Promise<any> => {
    const response = await apiClient.get("/accounting/reports/trial-balance/", {
        params: { date },
    });
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getAgingReport: async (type: 'ar' | 'ap', date?: string): Promise<any> => {
    const response = await apiClient.get("/accounting/reports/aging/", {
        params: { type, date },
    });
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getCashFlowStatement: async (startDate?: string, endDate?: string): Promise<any> => {
    const response = await apiClient.get("/accounting/reports/cash-flow/", {
        params: { start_date: startDate, end_date: endDate },
    });
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getAccountingSettings: async (): Promise<any> => {
    const response = await apiClient.get("/accounting/control/settings/");
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
updateAccountingSettings: async (data: any): Promise<any> => {
    const response = await apiClient.patch("/accounting/control/settings/", data);
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getAuditLogs: async (filters?: any): Promise<any> => {
    const response = await apiClient.get("/accounting/control/audit-log/", { params: filters });
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getTaxReport: async (startDate?: string, endDate?: string): Promise<any> => {
    const response = await apiClient.get("/accounting/reports/tax/", {
        params: { start_date: startDate, end_date: endDate },
    });
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getJournalEntries: async (): Promise<any> => {
    const response = await apiClient.get("/accounting/journal-entries/");
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getJournalEntry: async (id: string | number): Promise<any> => {
    const response = await apiClient.get(`/accounting/journal-entries/${id}/`);
    return response.data;
},

    // Bank Reconciliation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getBankStatements: async (accountId?: string): Promise<any[]> => {
    const params = accountId ? { bank_account: accountId } : {};
    const response = await apiClient.get("/accounting/bank-statements/", { params });
    // Handle pagination
    if (response.data.results) {
        return response.data.results;
    }
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getBankStatement: async (id: string): Promise<any> => {
    const response = await apiClient.get(`/accounting/bank-statements/${id}/`);
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
createBankStatement: async (data: any): Promise<any> => {
    const response = await apiClient.post("/accounting/bank-statements/", data);
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
uploadBankStatement: async (id: string, file: File): Promise<any> => {
    const formData = new FormData();
    formData.append("statement_file", file);
    const response = await apiClient.post(`/accounting/bank-statements/${id}/upload/`, formData, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
    });
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getUnreconciledTransactions: async (accountId: string, startDate?: string, endDate?: string): Promise<any[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = { account_id: accountId };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;

    const response = await apiClient.get("/accounting/transactions/unreconciled/", { params });
    // Handle pagination
    if (response.data.results) {
        return response.data.results;
    }
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
matchBankLine: async (lineId: string, transactionId: string): Promise<any> => {
    const response = await apiClient.post(`/accounting/bank-statement-lines/${lineId}/match/`, { transaction_id: transactionId });
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
unmatchBankLine: async (lineId: string): Promise<any> => {
    const response = await apiClient.post(`/accounting/bank-statement-lines/${lineId}/unmatch/`);
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
reconcileStatement: async (id: string): Promise<any> => {
    const response = await apiClient.post(`/accounting/bank-statements/${id}/reconcile/`);
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getManagementMetrics: async (startDate?: string, endDate?: string): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {};
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
getAccruals: async (filters?: any): Promise<any[]> => {
    const response = await apiClient.get("/accounting/accruals/", { params: filters });
    if (response.data.results) return response.data.results;
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getAccrualCandidates: async (cutoffDate?: string): Promise<any[]> => {
    const params = cutoffDate ? { cutoff_date: cutoffDate } : {};
    const response = await apiClient.get("/accounting/accruals/candidates/", { params });
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
createAccrual: async (data: any): Promise<any> => {
    const response = await apiClient.post("/accounting/accruals/", data);
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
reverseAccrual: async (id: number): Promise<any> => {
    const response = await apiClient.post(`/accounting/accruals/${id}/reverse/`);
    return response.data;
},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
getAnalyticsSnapshot: async (params?: any): Promise<any> => {
    const queryParams = new URLSearchParams(params).toString();
    const response = await apiClient.get(`/accounting/analytics/dashboard/?${queryParams}`);
    return response.data;
}
};
