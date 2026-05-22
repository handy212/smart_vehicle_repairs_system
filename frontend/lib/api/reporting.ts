import apiClient from './client';

export interface DashboardOverview {
  today: {
    appointments: number;
    revenue: number;
    roadside_requests: number;
    roadside_completed: number;
    date: string;
  };
  week: {
    revenue: number;
    start_date: string;
  };
  month: {
    revenue: number;
    start_date: string;
  };
  alerts: {
    active_work_orders: number;
    active_roadside_requests: number;
    overdue_invoices: {
      count: number;
      total: number;
    };
    low_stock_items: number;
    pending_estimates: number;
  };
  subscriptions: {
    active_count: number;
    mrr: number;
    arr: number;
  };
  recent_activity: {
    work_orders: Array<{
      id: number;
      wo_number: string;
      customer: string;
      vehicle: string;
      status: string;
      created_at: string;
      diagnosis_notes?: string | null;
      gate_pass_status?: string | null;
    }>;
    appointments: Array<{
      id: number;
      customer: string;
      vehicle: string;
      appointment_date: string;
      status: string;
    }>;
  };
}

export interface DateRangeParams {
  start_date?: string;
  end_date?: string;
  period?: 'daily' | 'weekly' | 'monthly';
}

export interface ReportCatalogItem {
  key: string;
  name: string;
  category: string;
  endpoint: string;
  exports: string[];
  drill_down: boolean;
}

export interface SavedReport {
  id: number;
  name: string;
  report_type: string;
  description?: string;
  parameters: Record<string, unknown>;
  is_public: boolean;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ReportSchedule {
  id: number;
  name: string;
  report_type: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  email_recipients: string;
  is_active: boolean;
  next_run_date: string;
  last_run_date?: string | null;
  parameters: Record<string, unknown>;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ReportExportLog {
  id: number;
  report_type: string;
  report_name?: string;
  export_format: 'pdf' | 'csv' | 'xlsx' | 'json';
  status: 'started' | 'completed' | 'failed';
  parameters: Record<string, unknown>;
  file_name?: string;
  error_message?: string;
  created_by_name?: string;
  created_at: string;
}

type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export const reportingApi = {
  catalog: async (): Promise<{ reports: ReportCatalogItem[]; controls: Record<string, number | boolean> }> => {
    const response = await apiClient.get('/reporting/catalog/');
    return response.data;
  },

  dashboard: async (): Promise<DashboardOverview> => {
    const response = await apiClient.get('/reporting/dashboard-overview/');
    return response.data;
  },

  revenue: async (params: DateRangeParams) => {
    const response = await apiClient.get('/reporting/revenue-report/', { params });
    return response.data;
  },

  downloadRevenueSummary: async (params: DateRangeParams): Promise<Blob> => {
    const response = await apiClient.get('/billing/invoices/revenue_summary_pdf/', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  profitMargin: async (params: Omit<DateRangeParams, 'period'>) => {
    const response = await apiClient.get('/reporting/profit-margin-report/', { params });
    return response.data;
  },

  workOrderStatistics: async (params: Omit<DateRangeParams, 'period'>) => {
    const response = await apiClient.get('/reporting/work-order-statistics/', { params });
    return response.data;
  },

  technicianPerformance: async (params: Omit<DateRangeParams, 'period'>) => {
    const response = await apiClient.get('/reporting/technician-performance/', { params });
    return response.data;
  },

  appointmentStatistics: async (params: Omit<DateRangeParams, 'period'>) => {
    const response = await apiClient.get('/reporting/appointment-statistics/', { params });
    return response.data;
  },

  // Inventory Reports
  inventoryValuation: async () => {
    const response = await apiClient.get('/reporting/inventory-valuation/');
    return response.data;
  },

  lowStock: async () => {
    const response = await apiClient.get('/reporting/low-stock-report/');
    return response.data;
  },

  inventoryTurnover: async (params: Omit<DateRangeParams, 'period'>) => {
    const response = await apiClient.get('/reporting/inventory-turnover/', { params });
    return response.data;
  },

  // Customer Reports
  customerStatistics: async (params: Omit<DateRangeParams, 'period'>) => {
    const response = await apiClient.get('/reporting/customer-statistics/', { params });
    return response.data;
  },

  // Vehicle Reports
  vehicleStatistics: async () => {
    const response = await apiClient.get('/reporting/vehicle-statistics/');
    return response.data;
  },

  serviceDue: async () => {
    const response = await apiClient.get('/reporting/service-due-report/');
    return response.data;
  },

  subscriptionAnalytics: async (params: DateRangeParams) => {
    const response = await apiClient.get('/reporting/subscription-analytics/', { params });
    return response.data;
  },

  serviceBundlePopularity: async (params: Omit<DateRangeParams, 'period'>) => {
    const response = await apiClient.get('/reporting/service-bundle-popularity/', { params });
    return response.data;
  },

  savedReports: {
    list: async (params?: { report_type?: string; search?: string }): Promise<Paginated<SavedReport>> => {
      const response = await apiClient.get('/reporting/saved-reports/', { params });
      return response.data;
    },
    create: async (data: {
      name: string;
      report_type: string;
      description?: string;
      parameters: Record<string, unknown>;
      is_public?: boolean;
    }): Promise<SavedReport> => {
      const response = await apiClient.post('/reporting/saved-reports/', data);
      return response.data;
    },
    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/reporting/saved-reports/${id}/`);
    },
  },

  schedules: {
    list: async (params?: { report_type?: string; is_active?: boolean }): Promise<Paginated<ReportSchedule>> => {
      const response = await apiClient.get('/reporting/schedules/', { params });
      return response.data;
    },
    create: async (data: {
      name: string;
      report_type: string;
      frequency: ReportSchedule['frequency'];
      email_recipients: string;
      parameters: Record<string, unknown>;
      is_active?: boolean;
      next_run_date?: string;
    }): Promise<ReportSchedule> => {
      const response = await apiClient.post('/reporting/schedules/', data);
      return response.data;
    },
  },

  getRoadsideRevenue: async (params?: DateRangeParams) => {
    const response = await apiClient.get('/reporting/roadside-revenue/', { params });
    return response.data;
  },

  getExceptionLog: async () => {
    const response = await apiClient.get('/reporting/exception-log/');
    return response.data;
  },

  getSystemUsage: async (params?: DateRangeParams) => {
    const response = await apiClient.get('/reporting/system-usage/', { params });
    return response.data;
  },

  getApCycleTime: async (params?: DateRangeParams) => {
    const response = await apiClient.get('/reporting/ap-cycle-time/', { params });
    return response.data;
  },

  getCapacityPlanning: async (params?: DateRangeParams) => {
    const response = await apiClient.get('/reporting/capacity-planning/', { params });
    return response.data;
  },

  getTraceability: async (params: { work_order_id?: number; part_id?: number }) => {
    const response = await apiClient.get('/reporting/traceability/', { params });
    return response.data;
  },

  getCostControlReturnJobs: async (params?: DateRangeParams) => {
    const response = await apiClient.get('/reporting/cost-control-return-jobs/', { params });
    return response.data;
  },

  exportLogs: {
    list: async (params?: { report_type?: string; status?: string }): Promise<Paginated<ReportExportLog>> => {
      const response = await apiClient.get('/reporting/export-logs/', { params });
      return response.data;
    },
    create: async (data: {
      report_type: string;
      report_name?: string;
      export_format: ReportExportLog['export_format'];
      status: ReportExportLog['status'];
      parameters: Record<string, unknown>;
      file_name?: string;
      error_message?: string;
    }): Promise<ReportExportLog> => {
      const response = await apiClient.post('/reporting/export-logs/', data);
      return response.data;
    },
  },
};
