"use client";

import { useQuery } from "@tanstack/react-query";
import { reportingApi } from "@/lib/api/reporting";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Calendar, TrendingUp, DollarSign, Users, Car, Package, Wrench, AlertCircle, Filter } from "lucide-react";
import { useState, useMemo } from "react";
import { format, subDays, startOfMonth } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import Link from "next/link";

import { useCurrency } from "@/lib/hooks/useCurrency";
import { RevenueForecastChart } from "@/components/reporting/RevenueForecastChart";
import { TechnicianProductivityHeatmap } from "@/components/reporting/TechnicianProductivityHeatmap";
import { InventoryTurnoverChart } from "@/components/reporting/InventoryTurnoverChart";

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

export default function ReportsPage() {
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [activeTab, setActiveTab] = useState("financial");
  const [showFilters, setShowFilters] = useState(false);
  const [showForecast, setShowForecast] = useState(false);

  // Dashboard Overview
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ["reporting", "dashboard"],
    queryFn: () => reportingApi.dashboard(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Financial Reports
  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ["reporting", "revenue", startDate, endDate, period],
    queryFn: () => reportingApi.revenue({ start_date: startDate, end_date: endDate, period }),
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === "financial",
  });

  const { data: profitMarginData } = useQuery({
    queryKey: ["reporting", "profit-margin", startDate, endDate],
    queryFn: () => reportingApi.profitMargin({ start_date: startDate, end_date: endDate }),
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === "financial",
  });

  // Operational Reports
  const { data: workOrderStats } = useQuery({
    queryKey: ["reporting", "work-orders", startDate, endDate],
    queryFn: () => reportingApi.workOrderStatistics({ start_date: startDate, end_date: endDate }),
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === "operational",
  });

  const { data: technicianPerf } = useQuery({
    queryKey: ["reporting", "technicians", startDate, endDate],
    queryFn: () => reportingApi.technicianPerformance({ start_date: startDate, end_date: endDate }),
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === "operational",
  });

  const { data: appointmentStats } = useQuery({
    queryKey: ["reporting", "appointments", startDate, endDate],
    queryFn: () => reportingApi.appointmentStatistics({ start_date: startDate, end_date: endDate }),
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === "operational",
  });

  // Inventory Reports
  const { data: inventoryValuation } = useQuery({
    queryKey: ["reporting", "inventory", "valuation"],
    queryFn: () => reportingApi.inventoryValuation(),
    staleTime: 10 * 60 * 1000,
    enabled: activeTab === "inventory",
  });

  const { data: lowStockData } = useQuery({
    queryKey: ["reporting", "inventory", "low-stock"],
    queryFn: () => reportingApi.lowStock(),
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === "inventory",
  });

  const { data: turnoverData, isLoading: turnoverLoading } = useQuery({
    queryKey: ["reporting", "inventory", "turnover", startDate, endDate],
    queryFn: () => reportingApi.inventoryTurnover({ start_date: startDate, end_date: endDate }),
    staleTime: 10 * 60 * 1000,
    enabled: activeTab === "inventory",
  });

  // Customer Reports
  const { data: customerStats } = useQuery({
    queryKey: ["reporting", "customers", startDate, endDate],
    queryFn: () => reportingApi.customerStatistics({ start_date: startDate, end_date: endDate }),
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === "customers",
  });

  // Vehicle Reports
  const { data: vehicleStats } = useQuery({
    queryKey: ["reporting", "vehicles"],
    queryFn: () => reportingApi.vehicleStatistics(),
    staleTime: 10 * 60 * 1000,
    enabled: activeTab === "vehicles",
  });

  const { data: serviceDueData } = useQuery({
    queryKey: ["reporting", "vehicles", "service-due"],
    queryFn: () => reportingApi.serviceDue(),
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === "vehicles",
  });

  // Controls/Audit Reports
  const { data: recentInvoices } = useQuery({
    queryKey: ["invoices", "recent", "controls"],
    queryFn: () => billingApi.invoices.list({ page: 1 }),
    enabled: activeTab === "controls",
  });

  const discountedInvoices = useMemo(() => {
    return recentInvoices?.results?.filter(inv =>
      (parseFloat(inv.discount_amount || "0") > 0) ||
      (parseFloat(inv.discount_percentage || "0") > 0)
    ) || [];
  }, [recentInvoices]);

  // Memoized date range calculations
  const dateRangeOptions = useMemo(
    () => [
      { label: "Last 7 days", days: 7 },
      { label: "Last 30 days", days: 30 },
      { label: "Last 90 days", days: 90 },
      { label: "This month", days: new Date().getDate() },
      { label: "Last month", days: 60 },
    ],
    []
  );

  const handleQuickDateRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(format(start, "yyyy-MM-dd"));
    setEndDate(format(end, "yyyy-MM-dd"));
    setShowFilters(false);
  };

  const handleExport = () => {
    toast({
      title: "Export Started",
      description: "Preparing report for download...",
    });
    // TODO: Implement actual export functionality
  };

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* Header - Mobile optimized */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Reports & Analytics
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Comprehensive business intelligence and reporting
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowFilters(!showFilters)}
            className="sm:hidden"
            size="sm"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
          <div
            className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 ${showFilters ? "flex" : "hidden sm:flex"
              }`}
          >
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full sm:w-40 h-10 text-sm"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full sm:w-40 h-10 text-sm"
            />
            <Button variant="secondary" onClick={handleExport} className="h-10">
              <Download className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Date Range Filters - Mobile friendly */}
      <Card className="border-border">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs sm:text-sm text-muted-foreground self-center mr-2">
              Quick ranges:
            </span>
            {dateRangeOptions.map((option) => (
              <Button
                key={option.label}
                variant="secondary"
                size="sm"
                onClick={() => handleQuickDateRange(option.days)}
                className="text-xs h-8"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dashboard Overview - Mobile responsive */}
      {dashboardData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border">
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    Today's Revenue
                  </p>
                  <p className="text-xl sm:text-2xl font-bold text-foreground truncate">
                    {formatCurrency(dashboardData.today.revenue)}
                  </p>
                </div>
                <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-green-500 flex-shrink-0 ml-2" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    This Week
                  </p>
                  <p className="text-xl sm:text-2xl font-bold text-foreground truncate">
                    {formatCurrency(dashboardData.week.revenue)}
                  </p>
                </div>
                <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-primary flex-shrink-0 ml-2" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    This Month
                  </p>
                  <p className="text-xl sm:text-2xl font-bold text-foreground truncate">
                    {formatCurrency(dashboardData.month.revenue)}
                  </p>
                </div>
                <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-purple-500 flex-shrink-0 ml-2" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    Overdue Invoices
                  </p>
                  <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">
                    {dashboardData.alerts?.overdue_invoices?.count || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency((dashboardData.alerts?.overdue_invoices?.total || 0))}
                  </p>
                </div>
                <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-red-500 flex-shrink-0 ml-2" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 h-auto flex-wrap">
          <TabsTrigger value="financial" className="text-xs sm:text-sm">
            Financial
          </TabsTrigger>
          <TabsTrigger value="operational" className="text-xs sm:text-sm">
            Operational
          </TabsTrigger>
          <TabsTrigger value="inventory" className="text-xs sm:text-sm">
            Inventory
          </TabsTrigger>
          <TabsTrigger value="customers" className="text-xs sm:text-sm">
            Customers
          </TabsTrigger>
          <TabsTrigger value="vehicles" className="text-xs sm:text-sm">
            Vehicles
          </TabsTrigger>
          <TabsTrigger value="controls" className="text-xs sm:text-sm">
            Controls
          </TabsTrigger>
        </TabsList>

        {/* Financial Reports */}
        <TabsContent value="financial" className="space-y-4 sm:space-y-6">
          {revenueLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          )}
          {revenueData && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-border">
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                      Total Invoiced
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">
                      {formatCurrency(revenueData.summary.total_invoiced)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                      Total Paid
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(revenueData.summary.total_paid)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                      Outstanding
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(revenueData.summary.total_outstanding)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                      Payment Rate
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">
                      {revenueData.summary.payment_rate.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Subscription vs Service Revenue Breakdown */}
              {(revenueData.summary.subscription_revenue !== undefined || revenueData.summary.service_revenue !== undefined) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="border-border">
                    <CardHeader className="pb-2 sm:pb-3">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                        Subscription Revenue
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                        {formatCurrency((revenueData.summary.subscription_revenue || 0))}
                      </p>
                      {revenueData.summary.total_paid > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {((revenueData.summary.subscription_revenue || 0) / revenueData.summary.total_paid * 100).toFixed(1)}% of total
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="border-border">
                    <CardHeader className="pb-2 sm:pb-3">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                        Service Revenue
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl sm:text-2xl font-bold text-primary dark:text-primary">
                        {formatCurrency((revenueData.summary.service_revenue || 0))}
                      </p>
                      {revenueData.summary.total_paid > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {((revenueData.summary.service_revenue || 0) / revenueData.summary.total_paid * 100).toFixed(1)}% of total
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <Card className="border-border">
                  <CardHeader className="pb-3 sm:pb-6">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base sm:text-lg">Revenue Analysis</CardTitle>
                      <Button
                        variant={showForecast ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowForecast(!showForecast)}
                        className="text-xs"
                      >
                        {showForecast ? "Vew Historical" : "Predict Revenue"}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2 sm:mt-3">
                      <Button
                        size="sm"
                        variant={period === "daily" ? "default" : "outline"}
                        onClick={() => setPeriod("daily")}
                        className="text-xs h-8"
                      >
                        Daily
                      </Button>
                      <Button
                        size="sm"
                        variant={period === "weekly" ? "default" : "outline"}
                        onClick={() => setPeriod("weekly")}
                        className="text-xs h-8"
                      >
                        Weekly
                      </Button>
                      <Button
                        size="sm"
                        variant={period === "monthly" ? "default" : "outline"}
                        onClick={() => setPeriod("monthly")}
                        className="text-xs h-8"
                      >
                        Monthly
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-6">
                    {revenueData.revenue_by_period.length > 0 ? (
                      showForecast ? (
                        <RevenueForecastChart data={revenueData.revenue_by_period} />
                      ) : (
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={revenueData.revenue_by_period}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="period"
                              tickFormatter={(value) => format(new Date(value), "MMM dd")}
                              style={{ fontSize: "12px" }}
                            />
                            <YAxis style={{ fontSize: "12px" }} />
                            <Tooltip
                              formatter={(value: number) => `${formatCurrency(value)}`}
                              labelFormatter={(value) => format(new Date(value), "MMM dd, yyyy")}
                            />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="revenue"
                              stroke="#3B82F6"
                              name="Revenue"
                              strokeWidth={2}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      )
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                        No data available
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardHeader className="pb-3 sm:pb-6">
                    <CardTitle className="text-base sm:text-lg">Revenue by Payment Method</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-6">
                    {revenueData.revenue_by_payment_method.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={revenueData.revenue_by_payment_method}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ method, percent }) =>
                              `${method}: ${percent ? (percent * 100).toFixed(0) : 0}%`
                            }
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="total"
                          >
                            {revenueData.revenue_by_payment_method.map((entry: { method: string; total: number }, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => `${formatCurrency(value)}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                        No data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border">
                <CardHeader className="pb-3 sm:pb-6">
                  <CardTitle className="text-base sm:text-lg">Revenue by Technician</CardTitle>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  {revenueData.revenue_by_technician.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={revenueData.revenue_by_technician}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="technician"
                          angle={-45}
                          textAnchor="end"
                          height={80}
                          style={{ fontSize: "12px" }}
                        />
                        <YAxis style={{ fontSize: "12px" }} />
                        <Tooltip formatter={(value: number) => `${formatCurrency(value)}`} />
                        <Legend />
                        <Bar dataKey="revenue" fill="#10B981" name="Revenue" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                      No data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {profitMarginData && (
            <Card className="border-border">
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="text-base sm:text-lg">Profit Margin Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Total Revenue</p>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">
                      {formatCurrency(profitMarginData.revenue.total)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Total Costs</p>
                    <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(profitMarginData.costs.parts)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Profit Margin</p>
                    <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
                      {profitMarginData.profit.profit_margin.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="px-2 sm:px-0">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={[
                        { name: "Labor", value: profitMarginData.revenue.labor },
                        { name: "Parts", value: profitMarginData.revenue.parts },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" style={{ fontSize: "12px" }} />
                      <YAxis style={{ fontSize: "12px" }} />
                      <Tooltip formatter={(value: number) => `${formatCurrency(value)}`} />
                      <Bar dataKey="value" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Operational Reports */}
        <TabsContent value="operational" className="space-y-4 sm:space-y-6">
          {workOrderStats && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <Card className="border-border">
                <CardHeader className="pb-3 sm:pb-6">
                  <CardTitle className="text-base sm:text-lg">Work Orders by Status</CardTitle>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  {workOrderStats.by_status && workOrderStats.by_status.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={workOrderStats.by_status}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry: any) => {
                            const percent = entry.percent || 0;
                            return `${entry.status}: ${(percent * 100).toFixed(0)}%`;
                          }}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="count"
                        >
                          {workOrderStats.by_status.map((entry: { status: string; count: number }, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                      No data available
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader className="pb-3 sm:pb-6">
                  <CardTitle className="text-base sm:text-lg">Work Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Total Work Orders
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">
                      {workOrderStats.summary?.total_work_orders || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Completed</p>
                    <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
                      {workOrderStats.summary?.completed || 0}
                    </p>
                  </div>
                  {workOrderStats.summary?.average_completion_hours && (
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Avg Completion Time
                      </p>
                      <p className="text-xl sm:text-2xl font-bold text-foreground">
                        {workOrderStats.summary.average_completion_hours.toFixed(1)} hours
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {technicianPerf && technicianPerf.technicians && (
            <Card className="border-border">
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="text-base sm:text-lg">Technician Performance</CardTitle>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                <div className="overflow-x-auto -mx-2 sm:mx-0">
                  <Table>
                    {/* ... existing table ... */}
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs sm:text-sm">Technician</TableHead>
                        <TableHead className="text-xs sm:text-sm">Work Orders</TableHead>
                        <TableHead className="text-xs sm:text-sm">Completed</TableHead>
                        <TableHead className="text-xs sm:text-sm">Revenue</TableHead>
                        <TableHead className="text-xs sm:text-sm">Avg Time (hrs)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {technicianPerf.technicians.map((tech: { technician: { id: number; name: string }; metrics: any }) => (
                        <TableRow key={tech.technician.id}>
                          <TableCell className="font-medium text-xs sm:text-sm">
                            {tech.technician.name}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">
                            {tech.metrics.total_work_orders || 0}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">
                            {tech.metrics.completed || 0}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">
                            ${tech.metrics.revenue?.toFixed(2) || "0.00"}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">
                            {tech.metrics.average_completion_hours?.toFixed(1) || "N/A"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-8 border-t dark:border-gray-800 pt-8">
                  <div className="px-4 sm:px-0 mb-4">
                    <h4 className="text-sm font-bold uppercase tracking-widest text-gray-400">Productivity Heatmap</h4>
                    <p className="text-xs text-gray-500">Cross-metric performance comparison normalized by peak performance.</p>
                  </div>
                  <TechnicianProductivityHeatmap data={technicianPerf.technicians} />
                </div>
              </CardContent>
            </Card>
          )}

          {appointmentStats && (
            <Card className="border-border">
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="text-base sm:text-lg">Appointment Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Total Appointments
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">
                      {appointmentStats.summary?.total_appointments || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">No-Show Rate</p>
                    <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">
                      {appointmentStats.summary?.no_show_rate?.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Completed</p>
                    <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
                      {appointmentStats.summary?.completed || 0}
                    </p>
                  </div>
                </div>
                {appointmentStats.by_status && appointmentStats.by_status.length > 0 && (
                  <div className="px-2 sm:px-0">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={appointmentStats.by_status}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="status" style={{ fontSize: "12px" }} />
                        <YAxis style={{ fontSize: "12px" }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="count" fill="#3B82F6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Inventory Reports */}
        <TabsContent value="inventory" className="space-y-4 sm:space-y-6">
          {turnoverData && (
            <Card className="border-border">
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="text-base sm:text-lg">Inventory Turnover Rate</CardTitle>
                <p className="text-xs text-gray-500">How many times your inventory is sold and replaced over a 90-day period.</p>
              </CardHeader>
              <CardContent>
                <InventoryTurnoverChart data={turnoverData.all_parts || []} />
              </CardContent>
            </Card>
          )}

          {inventoryValuation && (
            <Card className="border-border">
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="text-base sm:text-lg">Inventory Valuation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 sm:mb-6">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Total Inventory Value
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">
                    $
                    {(inventoryValuation.summary?.total_value ||
                      inventoryValuation.total_value ||
                      0).toFixed(2)}
                  </p>
                </div>
                {inventoryValuation.by_category && inventoryValuation.by_category.length > 0 && (
                  <div className="px-2 sm:px-0">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={inventoryValuation.by_category}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="category" style={{ fontSize: "12px" }} />
                        <YAxis style={{ fontSize: "12px" }} />
                        <Tooltip formatter={(value: number) => `${formatCurrency(value)}`} />
                        <Legend />
                        <Bar dataKey="value" fill="#8B5CF6" name="Value" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {lowStockData && (
            <Card className="border-border">
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="text-base sm:text-lg">Low Stock Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                {lowStockData.items && lowStockData.items.length > 0 ? (
                  <div className="overflow-x-auto -mx-2 sm:mx-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs sm:text-sm">Part Name</TableHead>
                          <TableHead className="text-xs sm:text-sm">Category</TableHead>
                          <TableHead className="text-xs sm:text-sm">Current Stock</TableHead>
                          <TableHead className="text-xs sm:text-sm">Reorder Point</TableHead>
                          <TableHead className="text-xs sm:text-sm">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lowStockData.items.map((item: any) => (
                          <TableRow key={item.part.id}>
                            <TableCell className="font-medium text-xs sm:text-sm">
                              {item.part.name}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              {item.part.category || "N/A"}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm">{item.stock.current}</TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              {item.stock.reorder_point}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              <span
                                className={
                                  item.is_critical
                                    ? "text-red-600 dark:text-red-400 font-medium"
                                    : "text-orange-600 dark:text-orange-400 font-medium"
                                }
                              >
                                {item.is_critical ? "Critical" : "Low Stock"}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-center py-8 text-xs sm:text-sm text-muted-foreground">
                    No low stock items
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Customer Reports */}
        <TabsContent value="customers" className="space-y-4 sm:space-y-6">
          {customerStats && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-border">
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                      Total Customers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">
                      {customerStats.total_customers || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                      New Customers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
                      {customerStats.new_customers || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                      Active Customers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">
                      {customerStats.active_customers || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                      Top Customers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">
                      {customerStats.top_customers?.length || 0}
                    </p>
                  </CardContent>
                </Card>
                {customerStats.customers_with_subscriptions !== undefined && (
                  <Card className="border-border">
                    <CardHeader className="pb-2 sm:pb-3">
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                        With Subscriptions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                        {customerStats.customers_with_subscriptions || 0}
                      </p>
                      {customerStats.subscription_adoption_rate !== undefined && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {customerStats.subscription_adoption_rate.toFixed(1)}% adoption rate
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              {customerStats.top_customers && customerStats.top_customers.length > 0 && (
                <Card className="border-border">
                  <CardHeader className="pb-3 sm:pb-6">
                    <CardTitle className="text-base sm:text-lg">Top Customers by Revenue</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 sm:p-6">
                    <div className="overflow-x-auto -mx-2 sm:mx-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs sm:text-sm">Customer</TableHead>
                            <TableHead className="text-xs sm:text-sm">Revenue</TableHead>
                            <TableHead className="text-xs sm:text-sm">Work Orders</TableHead>
                            <TableHead className="text-xs sm:text-sm">Subscription</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customerStats.top_customers.map((customer: any) => (
                            <TableRow key={customer.id}>
                              <TableCell className="font-medium text-xs sm:text-sm">
                                {customer.name}
                              </TableCell>
                              <TableCell className="text-xs sm:text-sm">
                                ${customer.revenue?.toFixed(2) || "0.00"}
                              </TableCell>
                              <TableCell className="text-xs sm:text-sm">
                                {customer.work_orders || 0}
                              </TableCell>
                              <TableCell className="text-xs sm:text-sm">
                                {customer.has_subscription ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                                    Active
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Vehicle Reports */}
        <TabsContent value="vehicles" className="space-y-4 sm:space-y-6">
          {vehicleStats && (
            <Card className="border-border">
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="text-base sm:text-lg">Vehicle Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Total Vehicles</p>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">
                      {vehicleStats.total_vehicles || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Average Age</p>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">
                      {vehicleStats.average_age
                        ? `${vehicleStats.average_age.toFixed(1)} years`
                        : "N/A"}
                    </p>
                  </div>
                </div>
                {vehicleStats.by_make && vehicleStats.by_make.length > 0 && (
                  <div className="px-2 sm:px-0">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={vehicleStats.by_make}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="make" angle={-45} textAnchor="end" height={80} style={{ fontSize: "12px" }} />
                        <YAxis style={{ fontSize: "12px" }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="count" fill="#06B6D4" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {serviceDueData && (
            <Card className="border-border">
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="text-base sm:text-lg">Service Due Report</CardTitle>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                {serviceDueData.vehicles && serviceDueData.vehicles.length > 0 ? (
                  <div className="overflow-x-auto -mx-2 sm:mx-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs sm:text-sm">Vehicle</TableHead>
                          <TableHead className="text-xs sm:text-sm">Last Service</TableHead>
                          <TableHead className="text-xs sm:text-sm">Next Service Due</TableHead>
                          <TableHead className="text-xs sm:text-sm">Mileage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {serviceDueData.vehicles.map((vehicle: any) => (
                          <TableRow key={vehicle.id}>
                            <TableCell className="font-medium text-xs sm:text-sm min-w-[150px]">
                              {vehicle.vehicle_info ||
                                `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""} ${vehicle.license_plate || ""}`.trim() ||
                                `Vehicle #${vehicle.id}`}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              {vehicle.last_service_date
                                ? format(new Date(vehicle.last_service_date), "MMM dd, yyyy")
                                : "N/A"}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              {vehicle.next_service_due
                                ? format(new Date(vehicle.next_service_due), "MMM dd, yyyy")
                                : "N/A"}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              {(vehicle.mileage || vehicle.odometer_reading)?.toLocaleString() || "N/A"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-center py-8 text-xs sm:text-sm text-muted-foreground">
                    No vehicles due for service
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="controls" className="space-y-4 sm:space-y-6">
          <Card className="border-border">
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="text-base sm:text-lg">Discounts & Overrides Analysis</CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs sm:text-sm">Invoice #</TableHead>
                      <TableHead className="text-xs sm:text-sm">Date</TableHead>
                      <TableHead className="text-xs sm:text-sm">Subtotal</TableHead>
                      <TableHead className="text-xs sm:text-sm">Discount</TableHead>
                      <TableHead className="text-xs sm:text-sm">Reason</TableHead>
                      <TableHead className="text-xs sm:text-sm">Total</TableHead>
                      <TableHead className="text-xs sm:text-sm">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discountedInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-400">
                          No invoices with discounts found recently.
                        </TableCell>
                      </TableRow>
                    ) : (
                      discountedInvoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-xs sm:text-sm">{inv.invoice_number}</TableCell>
                          <TableCell className="text-xs sm:text-sm">{format(new Date(inv.invoice_date), "MMM dd, yyyy")}</TableCell>
                          <TableCell className="text-xs sm:text-sm">{formatCurrency(parseFloat(inv.subtotal || "0"))}</TableCell>
                          <TableCell className="text-xs sm:text-sm font-bold text-orange-600">
                            {inv.discount_percentage ? `${inv.discount_percentage}%` : `${formatCurrency(parseFloat(inv.discount_amount || "0"))}`}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm italic">{inv.discount_reason || "-"}</TableCell>
                          <TableCell className="text-xs sm:text-sm font-bold">{formatCurrency(parseFloat(inv.total))}</TableCell>
                          <TableCell>
                            <Link href={`/billing/invoices/${inv.id}`} target="_blank">
                              <Button variant="ghost" size="sm">View</Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
