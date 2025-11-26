import apiClient from "./client";

export interface PortalStats {
  total_vehicles: number;
  upcoming_appointments_count: number;
  pending_invoices_count: number;
  pending_estimates_count: number;
  total_spent: number;
}

export interface PortalDashboard {
  stats: PortalStats;
  recent_appointments: any[];
  recent_invoices: any[];
  vehicles: any[];
}

export const portalApi = {
  dashboard: async (): Promise<PortalDashboard> => {
    // Get current user's customer profile
    const userResponse = await apiClient.get("/auth/users/me/");
    const user = userResponse.data;
    
    // Get customer ID from user - check both possible field names
    const customerId = (user as any).customer_profile?.id || (user as any).customer?.id;
    if (!customerId) {
      throw new Error("Customer profile not found");
    }
    
    // Fetch all data in parallel
    const [vehiclesRes, appointmentsRes, invoicesRes, estimatesRes, paymentsRes] = await Promise.all([
      apiClient.get("/vehicles/vehicles/", { params: { owner: customerId, page_size: 4 } }),
      apiClient.get("/appointments/appointments/", { params: { customer: customerId, ordering: "-appointment_date", page_size: 3 } }),
      apiClient.get("/billing/invoices/", { params: { customer: customerId, ordering: "-invoice_date", page_size: 3 } }),
      apiClient.get("/billing/estimates/", { params: { customer: customerId, status: "sent", page_size: 10 } }),
      apiClient.get("/billing/payments/", { params: { invoice__customer: customerId, status: "completed" } }),
    ]);
    
    const vehicles = vehiclesRes.data.results || vehiclesRes.data || [];
    const appointments = appointmentsRes.data.results || appointmentsRes.data || [];
    const invoices = invoicesRes.data.results || invoicesRes.data || [];
    const estimates = estimatesRes.data.results || estimatesRes.data || [];
    const payments = paymentsRes.data.results || paymentsRes.data || [];
    
    // Calculate stats
    const today = new Date().toISOString().split('T')[0];
    const upcomingAppointments = appointments.filter((apt: any) => 
      apt.appointment_date >= today && ['pending', 'confirmed'].includes(apt.status)
    );
    
    const pendingInvoices = invoices.filter((inv: any) => 
      ['pending', 'sent'].includes(inv.status)
    );
    
    const totalSpent = payments.reduce((sum: number, payment: any) => sum + parseFloat(payment.amount || 0), 0);
    
    return {
      stats: {
        total_vehicles: vehiclesRes.data.count || vehicles.length,
        upcoming_appointments_count: upcomingAppointments.length,
        pending_invoices_count: pendingInvoices.length,
        pending_estimates_count: estimates.length,
        total_spent: totalSpent,
      },
      recent_appointments: appointments.slice(0, 3),
      recent_invoices: invoices.slice(0, 3),
      vehicles: vehicles.slice(0, 4),
    };
  },
};

