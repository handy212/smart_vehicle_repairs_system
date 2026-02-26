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

    work_orders: Array<any>;

    appointments: Array<any>;
  };
}

export interface DateRangeParams {
  start_date?: string;
  end_date?: string;
  period?: 'daily' | 'weekly' | 'monthly';
}

export const reportingApi = {
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
};
