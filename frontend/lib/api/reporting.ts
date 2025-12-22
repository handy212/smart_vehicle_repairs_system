import apiClient from "./client";

// ============================================================================
// Types
// ============================================================================

export interface DashboardOverview {
  today: {
    appointments: number;
    revenue: number;
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
  alerts?: {
    active_work_orders?: number;
    overdue_invoices?: {
      count: number;
      total: number;
    };
    low_stock_items?: number;
    pending_estimates?: number;
  };
  subscriptions?: {
    active_count: number;
    mrr: number;
    arr: number;
  };
  recent_activity?: {
    work_orders?: any[];
    appointments?: any[];
  };
}

export interface RevenueReport {
  period: {
    start_date: string;
    end_date: string;
    grouping: string;
  };
  summary: {
    total_invoiced: number;
    total_paid: number;
    total_outstanding: number;
    payment_rate: number;
    subscription_revenue?: number;
    service_revenue?: number;
  };
  revenue_by_period: Array<{
    period: string;
    revenue: number;
    invoice_count: number;
  }>;
  revenue_by_payment_method: Array<{
    method: string;
    total: number;
    count: number;
  }>;
  revenue_by_technician: Array<{
    technician: string;
    revenue: number;
    work_orders: number;
  }>;
}

export interface ProfitMarginReport {
  period: {
    start_date: string;
    end_date: string;
  };
  revenue: {
    labor: number;
    parts: number;
    total: number;
  };
  costs: {
    parts: number;
  };
  profit: {
    gross_profit: number;
    profit_margin: number;
  };
}

export interface WorkOrderStatistics {
  period?: {
    start_date: string;
    end_date: string;
  };
  summary?: {
    total_work_orders: number;
    completed: number;
    average_completion_hours?: number;
  };
  by_status: Array<{
    status: string;
    count: number;
  }>;
  by_priority?: Array<{
    priority: string;
    count: number;
  }>;
  top_services?: Array<{
    description: string;
    count: number;
  }>;
}

export interface TechnicianPerformance {
  period?: {
    start_date: string;
    end_date: string;
  };
  technicians: Array<{
    technician: {
      id: number;
      name: string;
      email: string;
    };
    metrics: {
      total_work_orders: number;
      completed: number;
      in_progress: number;
      revenue: number;
      average_completion_hours?: number;
    };
  }>;
}

export interface AppointmentStatistics {
  period?: {
    start_date: string;
    end_date: string;
  };
  summary?: {
    total_appointments: number;
    completed: number;
    no_show: number;
    cancelled: number;
    no_show_rate: number;
    completion_rate: number;
  };
  by_status: Array<{
    status: string;
    count: number;
  }>;
  by_service_bay?: Array<{
    service_bay__name: string;
    count: number;
  }>;
}

export interface InventoryValuation {
  summary?: {
    total_value: number;
    total_items: number;
    total_quantity: number;
  };
  total_value?: number;
  by_category: Array<{
    category: string;
    value: number;
    items: number;
    quantity: number;
  }>;
  low_stock_items?: number;
}

export interface InventoryTurnover {
  turnover_rate: number;
  by_category: Array<{
    category: string;
    turnover_rate: number;
  }>;
}

export interface LowStockReport {
  summary?: {
    total_low_stock: number;
    critical_stock: number;
  };
  items: Array<{
    part: {
      id: number;
      part_number: string;
      name: string;
      category?: string;
    };
    stock: {
      current: number;
      reorder_point: number;
      reorder_quantity: number;
    };
    supplier?: {
      id: number;
      name: string;
    };
    is_critical: boolean;
  }>;
}

export interface CustomerStatistics {
  total_customers: number;
  new_customers: number;
  active_customers: number;
  customers_with_subscriptions?: number;
  subscription_adoption_rate?: number;
  by_type: Array<{
    type: string;
    count: number;
  }>;
  top_customers: Array<{
    id: number;
    name: string;
    revenue: number;
    work_orders: number;
    has_subscription?: boolean;
  }>;
}

export interface VehicleStatistics {
  total_vehicles: number;
  average_age?: number | null;
  by_make: Array<{
    make: string;
    count: number;
  }>;
  by_year?: Array<{
    year: number;
    count: number;
  }>;
  most_serviced?: Array<{
    vehicle: {
      id: number;
      year: number;
      make: string;
      model: string;
      vin?: string;
      license_plate?: string;
    };
    customer: string;
    service_count: number;
  }>;
}

export interface ServiceDueReport {
  vehicles: Array<{
    id: number;
    vehicle_info?: string;
    year?: number;
    make?: string;
    model?: string;
    license_plate?: string;
    last_service_date?: string;
    next_service_due?: string;
    mileage?: number;
    odometer_reading?: number;
  }>;
}

export interface SubscriptionAnalytics {
  period: {
    start_date: string;
    end_date: string;
  };
  summary: {
    active_subscriptions: number;
    total_subscriptions: number;
    mrr: number;
    arr: number;
    average_subscription_value: number;
    new_subscriptions: number;
    renewals: number;
    churned: number;
    renewal_rate: number;
  };
  by_status: Array<{
    status: string;
    count: number;
  }>;
  revenue_by_package: Array<{
    package_id: number;
    package_name: string;
    active_subscriptions: number;
    mrr: number;
    arr: number;
  }>;
  trends: Array<{
    period: string | null;
    count: number;
  }>;
}

// ============================================================================
// API Client
// ============================================================================

export const reportingApi = {
  // Dashboard
  dashboard: async (): Promise<DashboardOverview> => {
    const response = await apiClient.get("/reporting/dashboard/");
    return response.data;
  },

  // Financial Reports
  revenue: async (params?: {
    start_date?: string;
    end_date?: string;
    period?: "daily" | "weekly" | "monthly";
  }): Promise<RevenueReport> => {
    const response = await apiClient.get("/reporting/reports/revenue/", { params });
    return response.data;
  },

  profitMargin: async (params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<ProfitMarginReport> => {
    const response = await apiClient.get("/reporting/reports/profit-margin/", { params });
    return response.data;
  },

  // Operational Reports
  workOrderStatistics: async (params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<WorkOrderStatistics> => {
    const response = await apiClient.get("/reporting/reports/work-orders/", { params });
    return response.data;
  },

  technicianPerformance: async (params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<TechnicianPerformance> => {
    const response = await apiClient.get("/reporting/reports/technicians/", { params });
    return response.data;
  },

  appointmentStatistics: async (params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<AppointmentStatistics> => {
    const response = await apiClient.get("/reporting/reports/appointments/", { params });
    return response.data;
  },

  // Inventory Reports
  inventoryValuation: async (): Promise<InventoryValuation> => {
    const response = await apiClient.get("/reporting/reports/inventory/valuation/");
    return response.data;
  },

  inventoryTurnover: async (params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<InventoryTurnover> => {
    const response = await apiClient.get("/reporting/reports/inventory/turnover/", { params });
    return response.data;
  },

  lowStock: async (): Promise<LowStockReport> => {
    const response = await apiClient.get("/reporting/reports/inventory/low-stock/");
    return response.data;
  },

  // Customer Reports
  customerStatistics: async (params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<CustomerStatistics> => {
    const response = await apiClient.get("/reporting/reports/customers/", { params });
    return response.data;
  },

  // Vehicle Reports
  vehicleStatistics: async (): Promise<VehicleStatistics> => {
    const response = await apiClient.get("/reporting/reports/vehicles/");
    return response.data;
  },

  serviceDue: async (): Promise<ServiceDueReport> => {
    const response = await apiClient.get("/reporting/reports/vehicles/service-due/");
    return response.data;
  },

  // Subscription Reports
  subscriptionAnalytics: async (params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<SubscriptionAnalytics> => {
    const response = await apiClient.get("/reporting/reports/subscriptions/", { params });
    return response.data;
  },
};

