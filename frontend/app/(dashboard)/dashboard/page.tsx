"use client";

import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { appointmentsApi } from "@/lib/api/appointments";
import { workordersApi } from "@/lib/api/workorders";
import { reportingApi } from "@/lib/api/reporting";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Car, Calendar, Wrench, DollarSign, Package, TrendingUp, AlertTriangle, FileText, Clock, CheckCircle } from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  // Fetch dashboard overview from reporting API
  const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError } = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => reportingApi.dashboard(),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Fetch revenue data for charts
  const { data: revenueData, error: revenueError } = useQuery({
    queryKey: ["dashboard", "revenue"],
    queryFn: () => {
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      return reportingApi.revenue({
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(today, "yyyy-MM-dd"),
        period: "daily",
      });
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Fetch work order statistics
  const { data: workOrderStats, error: workOrderStatsError } = useQuery({
    queryKey: ["dashboard", "workorder-stats"],
    queryFn: () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      return reportingApi.workOrderStatistics({
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(today, "yyyy-MM-dd"),
      });
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Fetch low stock items
  const { data: lowStockData, error: lowStockError } = useQuery({
    queryKey: ["dashboard", "low-stock"],
    queryFn: () => reportingApi.lowStock(),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Fetch basic counts
  const { data: customersData } = useQuery({
    queryKey: ["customers", "dashboard"],
    queryFn: () => customersApi.list({ page: 1 }),
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ["vehicles", "dashboard"],
    queryFn: () => vehiclesApi.list({ page: 1 }),
  });

  const { data: todayAppointments } = useQuery({
    queryKey: ["appointments", "today"],
    queryFn: () => appointmentsApi.today(),
  });

  const { data: activeWorkOrders, error: activeWorkOrdersError } = useQuery({
    queryKey: ["workorders", "active"],
    queryFn: () => workordersApi.active(),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const isLoading = dashboardLoading || !customersData || !vehiclesData;

  // Show error banner if critical APIs are failing
  const hasApiErrors = dashboardError || revenueError || activeWorkOrdersError;

  // Calculate stats from dashboard data
  const stats = {
    total_customers: customersData?.count || 0,
    total_vehicles: vehiclesData?.count || 0,
    today_appointments: dashboardData?.today?.appointments || todayAppointments?.length || 0,
    today_revenue: dashboardData?.today?.revenue || 0,
    week_revenue: dashboardData?.week?.revenue || 0,
    month_revenue: dashboardData?.month?.revenue || 0,
    active_work_orders: dashboardData?.alerts?.active_work_orders || activeWorkOrders?.length || 0,
    overdue_invoices: dashboardData?.alerts?.overdue_invoices?.count || 0,
    overdue_amount: dashboardData?.alerts?.overdue_invoices?.total || 0,
    low_stock_items: dashboardData?.alerts?.low_stock_items || lowStockData?.summary?.total_low_stock || 0,
    pending_estimates: dashboardData?.alerts?.pending_estimates || 0,
  };

  // Prepare chart data
  const workOrderStatusData = workOrderStats?.by_status?.map((item) => ({
    status: item.status.replace(/_/g, " "),
    count: item.count,
  })) || [];

  // Revenue chart data (last 7 days)
  const revenueChartData = revenueData?.revenue_by_period?.slice(-7).map((item) => ({
    date: format(new Date(item.period), "MMM d"),
    revenue: item.revenue,
  })) || [];

  // Revenue by payment method
  const paymentMethodData = revenueData?.revenue_by_payment_method || [];

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Customers",
      value: stats?.total_customers || 0,
      icon: Users,
      color: "bg-blue-500",
      link: "/customers",
    },
    {
      title: "Total Vehicles",
      value: stats?.total_vehicles || 0,
      icon: Car,
      color: "bg-green-500",
      link: "/vehicles",
    },
    {
      title: "Today's Appointments",
      value: stats?.today_appointments || 0,
      icon: Calendar,
      color: "bg-yellow-500",
      link: "/appointments",
    },
    {
      title: "Active Work Orders",
      value: stats?.active_work_orders || 0,
      icon: Wrench,
      color: "bg-purple-500",
      link: "/workorders",
    },
    {
      title: "Monthly Revenue",
      value: `$${parseFloat(String(stats?.month_revenue || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: "bg-emerald-500",
      link: "/billing",
    },
    {
      title: "Low Stock Items",
      value: stats?.low_stock_items || 0,
      icon: Package,
      color: "bg-red-500",
      link: "/inventory",
      alert: stats?.low_stock_items > 0,
    },
  ];

  const alertCards = [
    ...(stats?.overdue_invoices > 0
      ? [
          {
            title: "Overdue Invoices",
            value: stats.overdue_invoices,
            amount: `$${parseFloat(String(stats.overdue_amount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            icon: AlertTriangle,
            color: "bg-red-500",
            link: "/billing",
          },
        ]
      : []),
    ...(stats?.pending_estimates > 0
      ? [
          {
            title: "Pending Estimates",
            value: stats.pending_estimates,
            icon: FileText,
            color: "bg-orange-500",
            link: "/billing/estimates",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Welcome back! Here's what's happening today.
        </p>
      </div>

      {/* Error Banner */}
      {hasApiErrors && (
        <Card className="border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-yellow-800 dark:text-yellow-400">
              <AlertTriangle className="w-5 h-5" />
              <p className="text-sm font-medium">
                Some dashboard data is temporarily unavailable. The page will continue to load with available data.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          const CardWrapper = stat.link ? Link : "div";
          return (
            <CardWrapper key={stat.title} href={stat.link} className={stat.link ? "block" : ""}>
              <Card className={`transition-all hover:shadow-lg ${stat.link ? "cursor-pointer" : ""} ${stat.alert ? "border-red-300 dark:border-red-700 border-2" : ""}`}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {stat.title}
                  </CardTitle>
                  <div className={`${stat.color} p-2 rounded-lg`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</div>
                  {stat.alert && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">Action required</p>
                  )}
                </CardContent>
              </Card>
            </CardWrapper>
          );
        })}
      </div>

      {/* Alert Cards */}
      {alertCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {alertCards.map((alert) => {
            const Icon = alert.icon;
            const CardWrapper = alert.link ? Link : "div";
            return (
              <CardWrapper key={alert.title} href={alert.link} className={alert.link ? "block" : ""}>
                <Card className={`transition-all hover:shadow-lg border-2 border-orange-300 dark:border-orange-700 ${alert.link ? "cursor-pointer" : ""}`}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-400">
                      {alert.title}
                    </CardTitle>
                    <div className={`${alert.color} p-2 rounded-lg`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{alert.value}</div>
                    {alert.amount && (
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{alert.amount}</div>
                    )}
                  </CardContent>
                </Card>
              </CardWrapper>
            );
          })}
        </div>
      )}

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Revenue Trend (Last 7 Days)</CardTitle>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-gray-600 dark:text-gray-400">Daily Revenue</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {revenueChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={revenueChartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip
                  formatter={(value: any) => `$${parseFloat(String(value)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3B82F6"
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">
              No revenue data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Work Orders by Status */}
        <Card>
          <CardHeader>
            <CardTitle>Work Orders by Status (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {workOrderStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={workOrderStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${percent ? (percent * 100).toFixed(0) : 0}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {workOrderStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">
                No work order data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue by Payment Method */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            {paymentMethodData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={paymentMethodData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="method" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: any) => `$${parseFloat(String(value)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  />
                  <Legend />
                  <Bar dataKey="total" fill="#10B981" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">
                No payment data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Today's Appointments</CardTitle>
            <Link href="/appointments" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
              View All
            </Link>
          </CardHeader>
          <CardContent>
            {todayAppointments && todayAppointments.length > 0 ? (
              <div className="space-y-3">
                {todayAppointments.slice(0, 5).map((apt: any) => (
                  <Link
                    key={apt.id}
                    href={`/appointments/${apt.id}`}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{apt.customer_name || "N/A"}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {apt.vehicle_info || "N/A"} • {apt.appointment_time}
                      </p>
                    </div>
                    <Badge
                      variant={
                        apt.status === "confirmed"
                          ? "success"
                          : apt.status === "pending"
                          ? "warning"
                          : "secondary"
                      }
                      className="ml-2"
                    >
                      {apt.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No appointments scheduled for today</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Active Work Orders</CardTitle>
            <Link href="/workorders" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
              View All
            </Link>
          </CardHeader>
          <CardContent>
            {activeWorkOrders && activeWorkOrders.length > 0 ? (
              <div className="space-y-3">
                {activeWorkOrders.slice(0, 5).map((wo: any) => (
                  <Link
                    key={wo.id}
                    href={`/workorders/${wo.id}`}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{wo.work_order_number}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {wo.customer_name || "N/A"} • {wo.vehicle_info || "N/A"}
                      </p>
                    </div>
                    <Badge
                      variant={
                        wo.status === "in_progress"
                          ? "default"
                          : wo.status === "pending"
                          ? "warning"
                          : "secondary"
                      }
                      className="ml-2"
                    >
                      {wo.status.replace(/_/g, " ")}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No active work orders</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Today's Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                ${parseFloat(String(stats.today_revenue || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Revenue for today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Week Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                ${parseFloat(String(stats.week_revenue || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <DollarSign className="h-8 w-8 text-blue-500" />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">This week's total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Month Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                ${parseFloat(String(stats.month_revenue || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <TrendingUp className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">This month's total</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

