"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reportingApi, type SavedReport } from "@/lib/api/reporting";
import { ReportsSubNav, REPORT_HUB_SECTIONS } from "./ReportsSubNav";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Download, Calendar, TrendingUp, DollarSign, Users, Car, Package, Wrench, AlertCircle, Filter } from "lucide-react";
import { useState, useMemo } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
import { useRouter } from "next/navigation";

import { useCurrency } from "@/lib/hooks/useCurrency";
import { RevenueForecastChart } from "@/components/reporting/RevenueForecastChart";
import { TechnicianProductivityHeatmap } from "@/components/reporting/TechnicianProductivityHeatmap";
import { InventoryTurnoverChart } from "@/components/reporting/InventoryTurnoverChart";
import { useTheme } from "@/lib/hooks/useTheme";
import { getApiErrorMessage } from "@/lib/api/errors";
import { downloadCsv } from "@/lib/utils/csvExport";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";
import { ChartAccessibleTable } from "@/components/reporting/ChartAccessibleTable";

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

const REPORT_TYPE_BY_TAB: Record<string, string> = {
  financial: "revenue",
  operational: "work_orders",
  inventory: "inventory",
  customers: "customers",
  vehicles: "vehicles",
  controls: "controls",
  subscriptions: "subscriptions",
};

const TAB_BY_REPORT_TYPE: Record<string, string> = {
  revenue: "financial",
  work_orders: "operational",
  inventory: "inventory",
  customers: "customers",
  vehicles: "vehicles",
  controls: "controls",
  subscriptions: "subscriptions",
};

const HUB_SECTION_ROUTES = Object.fromEntries(
  REPORT_HUB_SECTIONS.map((section) => [section.slug, section.href])
) as Record<string, string>;

export function ReportsHubClient({ section }: { section: string }) {
  const router = useRouter();
  const { formatCurrency } = useCurrency();
  const formatCurrencyTooltip = (value: unknown) =>
    formatCurrency(typeof value === "number" || typeof value === "string" ? value : undefined);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const activeTab = section;
  const [showFilters, setShowFilters] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [savedReportName, setSavedReportName] = useState("");
  const [savedReportDescription, setSavedReportDescription] = useState("");
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleRecipients, setScheduleRecipients] = useState("");
  const [scheduleFrequency, setScheduleFrequency] = useState<"daily" | "weekly" | "monthly" | "quarterly">("weekly");

  const { theme: activeTheme } = useTheme();
  const isPerfex = activeTheme.startsWith("perfex");
  const pCard = isPerfex ? "border border-border bg-card rounded-md shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]" : "border-border";
  const pCardHeader = isPerfex ? "py-3 px-4 border-b border-border" : "pb-3 sm:pb-6";
  const pCardTitle = isPerfex ? "text-sm font-semibold text-foreground" : "text-base sm:text-lg";
  const pCardContent = isPerfex ? "p-4" : "";
  const pTH = isPerfex ? "bg-[#f1f5f9] text-xs font-semibold text-[#374151] px-4 py-2.5" : "text-xs sm:text-sm";
  const pTD = isPerfex ? "px-4 py-2.5 text-xs" : "text-xs sm:text-sm";
  const currentReportType = REPORT_TYPE_BY_TAB[activeTab] || activeTab;
  const currentReportParams = useMemo(() => ({
    start_date: startDate,
    end_date: endDate,
    period,
    tab: activeTab,
  }), [activeTab, endDate, period, startDate]);

  const { data: reportCatalog } = useQuery({
    queryKey: ["reporting", "catalog"],
    queryFn: () => reportingApi.catalog(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: savedReportsData } = useQuery({
    queryKey: ["reporting", "saved-reports"],
    queryFn: () => reportingApi.savedReports.list(),
    staleTime: 60 * 1000,
  });

  const { data: schedulesData } = useQuery({
    queryKey: ["reporting", "schedules"],
    queryFn: () => reportingApi.schedules.list(),
    staleTime: 60 * 1000,
  });

  const { data: exportLogsData } = useQuery({
    queryKey: ["reporting", "export-logs"],
    queryFn: () => reportingApi.exportLogs.list(),
    staleTime: 60 * 1000,
  });

  // Dashboard Overview
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const { data: subscriptionStats } = useQuery({
    queryKey: ["reporting", "subscriptions", startDate, endDate],
    queryFn: () => reportingApi.subscriptionAnalytics({ start_date: startDate, end_date: endDate }),
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === "subscriptions",
  });

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

  const saveReportMutation = useMutation({
    mutationFn: () => reportingApi.savedReports.create({
      name: savedReportName,
      report_type: currentReportType,
      description: savedReportDescription,
      parameters: currentReportParams,
      is_public: false,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reporting", "saved-reports"] });
      queryClient.invalidateQueries({ queryKey: ["reporting", "catalog"] });
      toast({ title: "Saved", description: "Report view saved successfully." });
      setSaveDialogOpen(false);
      setSavedReportName("");
      setSavedReportDescription("");
    },
    onError: (error) => {
      toast({ title: "Save Failed", description: getApiErrorMessage(error, "Could not save report view."), variant: "destructive" });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: () => reportingApi.schedules.create({
      name: scheduleName,
      report_type: currentReportType,
      frequency: scheduleFrequency,
      email_recipients: scheduleRecipients,
      parameters: currentReportParams,
      is_active: true,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reporting", "schedules"] });
      queryClient.invalidateQueries({ queryKey: ["reporting", "catalog"] });
      toast({ title: "Scheduled", description: "Report schedule created successfully." });
      setScheduleDialogOpen(false);
      setScheduleName("");
      setScheduleRecipients("");
      setScheduleFrequency("weekly");
    },
    onError: (error) => {
      toast({ title: "Schedule Failed", description: getApiErrorMessage(error, "Could not schedule report."), variant: "destructive" });
    },
  });

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

  const applySavedReportView = (report: SavedReport) => {
    const params = report.parameters || {};
    const tab =
      (typeof params.tab === "string" ? params.tab : null) ||
      TAB_BY_REPORT_TYPE[report.report_type] ||
      "financial";
    router.push(HUB_SECTION_ROUTES[tab] || "/reports/financial");
    if (typeof params.start_date === "string") setStartDate(params.start_date);
    if (typeof params.end_date === "string") setEndDate(params.end_date);
    if (
      params.period === "daily" ||
      params.period === "weekly" ||
      params.period === "monthly"
    ) {
      setPeriod(params.period);
    }
    toast({
      title: "View loaded",
      description: `Applied saved view "${report.name}".`,
    });
  };

  const handleExport = async () => {
    try {
      if (activeTab === "financial") {
        toast({
          title: "Generating Report",
          description: "Please wait while we generate the Revenue Summary...",
        });
        const blob = await reportingApi.downloadRevenueSummary({
          start_date: startDate,
          end_date: endDate,
          period: period
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Revenue_Summary_${startDate}_to_${endDate}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast({
          title: "Report Downloaded",
          description: "The Revenue Summary has been downloaded successfully.",
          variant: "success",
        });
        reportingApi.exportLogs.create({
          report_type: "revenue",
          report_name: "Revenue Summary",
          export_format: "pdf",
          status: "completed",
          parameters: currentReportParams,
          file_name: link.download,
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["reporting", "export-logs"] });
          queryClient.invalidateQueries({ queryKey: ["reporting", "catalog"] });
        });
      } else if (activeTab === "operational" && workOrderStats) {
        const stats = workOrderStats as { by_status?: Array<{ status: string; count: number }> };
        downloadCsv(
          `work_orders_${startDate}_${endDate}.csv`,
          ["Status", "Count"],
          (stats.by_status ?? []).map((r) => [r.status, r.count])
        );
        toast({ title: "CSV downloaded", variant: "success" });
      } else {
        toast({
          title: "Export not available",
          description: "Use the Financial tab for PDF revenue export or CSV on Financial/Operational tabs.",
        });
      }
    } catch (error) {
      console.error("Failed to download report:", error);
      reportingApi.exportLogs.create({
        report_type: currentReportType,
        report_name: `${activeTab} report`,
        export_format: "pdf",
        status: "failed",
        parameters: currentReportParams,
        error_message: getApiErrorMessage(error, "Export failed"),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["reporting", "export-logs"] });
      }).catch(() => undefined);
      toast({
        title: "Download Failed",
        description: getApiErrorMessage(error, "Failed to download the report. Please try again."),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* Header - Mobile optimized */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className={`${isPerfex ? "text-base font-semibold" : "text-2xl sm:text-3xl font-bold"} text-foreground`}>
            Reports & Analytics
          </h1>
          <div className="mt-2">
            <BranchReportChip />
          </div>
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
          <Button variant="outline" size="sm" className={isPerfex ? "h-8 text-xs" : ""} onClick={() => setSaveDialogOpen(true)}>
            Save View
          </Button>
          <Button variant="outline" size="sm" className={isPerfex ? "h-8 text-xs" : ""} onClick={() => setScheduleDialogOpen(true)}>
            Schedule
          </Button>
          <div
            className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 ${showFilters ? "flex" : "hidden sm:flex"
              }`}
          >
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`w-full sm:w-40 ${isPerfex ? "h-8 text-xs" : "h-10 text-sm"}`}
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`w-full sm:w-40 ${isPerfex ? "h-8 text-xs" : "h-10 text-sm"}`}
            />
            <Button variant="secondary" onClick={() => handleExport()} className={isPerfex ? "h-8 text-xs" : "h-10"}>
              <Download className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Date Range Filters - Mobile friendly */}
      {isPerfex ? (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted-foreground mr-1">Quick ranges:</span>
          {dateRangeOptions.map((option) => (
            <button
              key={option.label}
              onClick={() => handleQuickDateRange(option.days)}
              className="px-3 py-1.5 rounded text-[11px] font-medium border bg-card border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <Card className={pCard}>
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
      )}

      {/* Dashboard Overview - Mobile responsive */}
      {dashboardData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isPerfex ? (
            <>
              <div className="border border-border bg-card rounded-md shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]">
                <div className="p-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md flex items-center justify-center bg-success/10 text-success flex-shrink-0">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight truncate">{formatCurrency(dashboardData.today.revenue)}</p>
                    <p className="text-[11px] text-muted-foreground">Today&apos;s Revenue</p>
                  </div>
                </div>
              </div>
              <div className="border border-border bg-card rounded-md shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]">
                <div className="p-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md flex items-center justify-center bg-info/10 text-primary flex-shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight truncate">{formatCurrency(dashboardData.week.revenue)}</p>
                    <p className="text-[11px] text-muted-foreground">This Week</p>
                  </div>
                </div>
              </div>
              <div className="border border-border bg-card rounded-md shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]">
                <div className="p-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md flex items-center justify-center bg-warning/10 text-warning flex-shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight truncate">{formatCurrency(dashboardData.month.revenue)}</p>
                    <p className="text-[11px] text-muted-foreground">This Month</p>
                  </div>
                </div>
              </div>
              <div className="border border-border bg-card rounded-md shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]">
                <div className="p-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md flex items-center justify-center bg-destructive/10 text-destructive flex-shrink-0">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-destructive leading-tight">{dashboardData.alerts?.overdue_invoices?.count || 0}</p>
                    <p className="text-[11px] text-muted-foreground">Overdue Invoices</p>
                    <p className="text-[11px] text-muted-foreground">{formatCurrency(dashboardData.alerts?.overdue_invoices?.total || 0)}</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <Card className={pCard}>
                <CardContent className="pt-4 sm:pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                        Today&apos;s Revenue
                      </p>
                      <p className="text-xl sm:text-2xl font-bold text-foreground truncate">
                        {formatCurrency(dashboardData.today.revenue)}
                      </p>
                    </div>
                    <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-success flex-shrink-0 ml-2" />
                  </div>
                </CardContent>
              </Card>
              <Card className={pCard}>
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
              <Card className={pCard}>
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
              <Card className={pCard}>
                <CardContent className="pt-4 sm:pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                        Overdue Invoices
                      </p>
                      <p className="text-xl sm:text-2xl font-bold text-destructive dark:text-red-400">
                        {dashboardData.alerts?.overdue_invoices?.count || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency((dashboardData.alerts?.overdue_invoices?.total || 0))}
                      </p>
                    </div>
                    <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-destructive flex-shrink-0 ml-2" />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      <ReportsSubNav isPerfex={isPerfex} />

      <Tabs value={activeTab} className="space-y-4">

        {/* Financial Reports */}
        {(!isPerfex || activeTab === "financial") && (
        <TabsContent value="financial" className="space-y-4 sm:space-y-6">
          {revenueLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          )}
          {revenueData && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className={pCard}>
                  <CardHeader className={pCardHeader}>
                    <CardTitle className={isPerfex ? "text-xs font-medium text-muted-foreground" : "text-xs sm:text-sm font-medium text-muted-foreground"}>
                      Total Invoiced
                    </CardTitle>
                  </CardHeader>
                  <CardContent className={pCardContent}>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">
                      {formatCurrency(revenueData.summary.total_invoiced)}
                    </p>
                  </CardContent>
                </Card>
                <Card className={pCard}>
                  <CardHeader className={pCardHeader}>
                    <CardTitle className={isPerfex ? "text-xs font-medium text-muted-foreground" : "text-xs sm:text-sm font-medium text-muted-foreground"}>
                      Total Paid
                    </CardTitle>
                  </CardHeader>
                  <CardContent className={pCardContent}>
                    <p className="text-xl sm:text-2xl font-bold text-success">
                      {formatCurrency(revenueData.summary.total_paid)}
                    </p>
                  </CardContent>
                </Card>
                <Card className={pCard}>
                  <CardHeader className={pCardHeader}>
                    <CardTitle className={isPerfex ? "text-xs font-medium text-muted-foreground" : "text-xs sm:text-sm font-medium text-muted-foreground"}>
                      Outstanding
                    </CardTitle>
                  </CardHeader>
                  <CardContent className={pCardContent}>
                    <p className="text-xl sm:text-2xl font-bold text-destructive dark:text-red-400">
                      {formatCurrency(revenueData.summary.total_outstanding)}
                    </p>
                  </CardContent>
                </Card>
                <Card className={pCard}>
                  <CardHeader className={pCardHeader}>
                    <CardTitle className={isPerfex ? "text-xs font-medium text-muted-foreground" : "text-xs sm:text-sm font-medium text-muted-foreground"}>
                      Payment Rate
                    </CardTitle>
                  </CardHeader>
                  <CardContent className={pCardContent}>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">
                      {revenueData.summary.payment_rate.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              {(revenueData.summary.subscription_revenue !== undefined || revenueData.summary.service_revenue !== undefined) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className={pCard}>
                    <CardHeader className={pCardHeader}>
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                        Subscription Revenue
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl sm:text-2xl font-bold text-primary dark:text-indigo-400">
                        {formatCurrency((revenueData.summary.subscription_revenue || 0))}
                      </p>
                      {revenueData.summary.total_paid > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {((revenueData.summary.subscription_revenue || 0) / revenueData.summary.total_paid * 100).toFixed(1)}% of total
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card className={pCard}>
                    <CardHeader className={pCardHeader}>
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                        Service Revenue
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl sm:text-2xl font-bold text-primary">
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
                <Card className={pCard}>
                  <CardHeader className={pCardHeader}>
                    <div className="flex items-center justify-between">
                      <CardTitle className={pCardTitle}>Revenue Performance</CardTitle>
                      <Button
                        variant={showForecast ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowForecast(!showForecast)}
                        className="text-xs"
                      >
                        {showForecast ? "View Historical" : "Predict Revenue"}
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
                        <>
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
                              formatter={formatCurrencyTooltip}
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
                        <ChartAccessibleTable
                          title="Revenue trend"
                          columns={[
                            {
                              key: "period",
                              label: "Period",
                              format: (v) => format(new Date(String(v)), "MMM dd, yyyy"),
                            },
                            {
                              key: "revenue",
                              label: "Revenue",
                              format: (v) => formatCurrency(Number(v)),
                            },
                          ]}
                          data={revenueData.revenue_by_period as Record<string, unknown>[]}
                        />
                        </>
                      )
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                        No data available
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className={pCard}>
                  <CardHeader className={pCardHeader}>
                    <CardTitle className={pCardTitle}>Revenue by Payment Method</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-6">
                    {revenueData.revenue_by_payment_method.length > 0 ? (
                      <>
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
                          <Tooltip formatter={formatCurrencyTooltip} />
                        </PieChart>
                      </ResponsiveContainer>
                      <ChartAccessibleTable
                        title="Revenue by payment method"
                        columns={[
                          { key: "method", label: "Method" },
                          {
                            key: "total",
                            label: "Total",
                            format: (v) => formatCurrency(Number(v)),
                          },
                        ]}
                        data={revenueData.revenue_by_payment_method as Record<string, unknown>[]}
                      />
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                        No data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className={pCard}>
                <CardHeader className={pCardHeader}>
                  <CardTitle className={pCardTitle}>Revenue by Technician</CardTitle>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  {revenueData.revenue_by_technician.length > 0 ? (
                    <>
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
                        <Tooltip formatter={formatCurrencyTooltip} />
                        <Legend />
                        <Bar dataKey="revenue" fill="#10B981" name="Revenue" />
                      </BarChart>
                    </ResponsiveContainer>
                    <ChartAccessibleTable
                      title="Revenue by technician"
                      columns={[
                        { key: "technician", label: "Technician" },
                        {
                          key: "revenue",
                          label: "Revenue",
                          format: (v) => formatCurrency(Number(v)),
                        },
                      ]}
                      data={revenueData.revenue_by_technician as Record<string, unknown>[]}
                    />
                    </>
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
            <Card className={pCard}>
              <CardHeader className={pCardHeader}>
                <CardTitle className={pCardTitle}>Profit Margin Analysis</CardTitle>
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
                    <p className="text-xl sm:text-2xl font-bold text-destructive dark:text-red-400">
                      {formatCurrency(profitMarginData.costs.parts)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Profit Margin</p>
                    <p className="text-xl sm:text-2xl font-bold text-success">
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
                      <Tooltip formatter={formatCurrencyTooltip} />
                      <Bar dataKey="value" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                  <ChartAccessibleTable
                    title="Revenue breakdown"
                    columns={[
                      { key: "name", label: "Category" },
                      {
                        key: "value",
                        label: "Amount",
                        format: (v) => formatCurrency(Number(v)),
                      },
                    ]}
                    data={[
                      { name: "Labor", value: profitMarginData.revenue.labor },
                      { name: "Parts", value: profitMarginData.revenue.parts },
                    ]}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        )}

        {/* Operational Reports */}
        {(!isPerfex || activeTab === "operational") && (
        <TabsContent value="operational" className="space-y-4 sm:space-y-6">
          {workOrderStats && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <Card className={pCard}>
                <CardHeader className={pCardHeader}>
                  <CardTitle className={pCardTitle}>Work Orders by Status</CardTitle>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  {workOrderStats.by_status && workOrderStats.by_status.length > 0 ? (
                    <>
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
                    <ChartAccessibleTable
                      title="Work orders by status"
                      columns={[
                        { key: "status", label: "Status" },
                        { key: "count", label: "Count" },
                      ]}
                      data={workOrderStats.by_status as Record<string, unknown>[]}
                    />
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                      No data available
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className={pCard}>
                <CardHeader className={pCardHeader}>
                  <CardTitle className={pCardTitle}>Work Order Summary</CardTitle>
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
                    <p className="text-xl sm:text-2xl font-bold text-success">
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
                  {workOrderStats.summary?.period_invoiced_total != null && (
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Invoiced (period)
                      </p>
                      <p className="text-xl sm:text-2xl font-bold text-foreground">
                        {formatCurrency(workOrderStats.summary.period_invoiced_total)}
                      </p>
                    </div>
                  )}
                  {workOrderStats.summary?.period_payments_received != null && (
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Payments received (period)
                      </p>
                      <p className="text-xl sm:text-2xl font-bold text-success">
                        {formatCurrency(workOrderStats.summary.period_payments_received)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {technicianPerf && technicianPerf.technicians && (
            <Card className={pCard}>
              <CardHeader className={pCardHeader}>
                <CardTitle className={pCardTitle}>Technician Performance</CardTitle>
              </CardHeader>
              <CardContent className={isPerfex ? "p-0" : "p-0 sm:p-6"}>
                <div className="overflow-x-auto -mx-2 sm:mx-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={pTH}>Technician</TableHead>
                        <TableHead className={pTH}>Work Orders</TableHead>
                        <TableHead className={pTH}>Completed</TableHead>
                        <TableHead className={pTH}>Revenue</TableHead>
                        <TableHead className={pTH}>Avg Time (hrs)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>

                      {technicianPerf.technicians.map((tech: { technician: { id: number; name: string }; metrics: any }) => (
                        <TableRow key={tech.technician.id}>
                          <TableCell className={isPerfex ? "px-4 py-2.5 text-xs font-medium" : "font-medium text-xs sm:text-sm"}>
                            {tech.technician.name}
                          </TableCell>
                          <TableCell className={pTD}>
                            {tech.metrics.total_work_orders || 0}
                          </TableCell>
                          <TableCell className={pTD}>
                            {tech.metrics.completed || 0}
                          </TableCell>
                          <TableCell className={pTD}>
                            {formatCurrency(tech.metrics.revenue ?? 0)}
                          </TableCell>
                          <TableCell className={pTD}>
                            {tech.metrics.average_completion_hours?.toFixed(1) || "N/A"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-8 border-t border-border pt-8">
                  <div className="px-4 sm:px-0 mb-4">
                    <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Productivity Heatmap</h4>
                    <p className="text-xs text-muted-foreground">Cross-metric performance comparison normalized by peak performance.</p>
                  </div>
                  <TechnicianProductivityHeatmap data={technicianPerf.technicians} />
                </div>
              </CardContent>
            </Card>
          )}

          {appointmentStats && (
            <Card className={pCard}>
              <CardHeader className={pCardHeader}>
                <CardTitle className={pCardTitle}>Appointment Statistics</CardTitle>
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
                    <p className="text-xl sm:text-2xl font-bold text-destructive dark:text-red-400">
                      {appointmentStats.summary?.no_show_rate?.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Completed</p>
                    <p className="text-xl sm:text-2xl font-bold text-success">
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
                    <ChartAccessibleTable
                      title="Appointments by status"
                      columns={[
                        { key: "status", label: "Status" },
                        { key: "count", label: "Count" },
                      ]}
                      data={appointmentStats.by_status as Record<string, unknown>[]}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
        )}

        {/* Inventory Reports */}
        {(!isPerfex || activeTab === "inventory") && (
        <TabsContent value="inventory" className="space-y-4 sm:space-y-6">
          {turnoverData && (
            <Card className={pCard}>
              <CardHeader className={pCardHeader}>
                <CardTitle className={pCardTitle}>Inventory Turnover Rate</CardTitle>
                <p className="text-xs text-muted-foreground">How many times your inventory is sold and replaced over a 90-day period.</p>
              </CardHeader>
              <CardContent>
                <InventoryTurnoverChart data={turnoverData.all_parts || []} />
              </CardContent>
            </Card>
          )}

          {inventoryValuation && (
            <Card className={pCard}>
              <CardHeader className={pCardHeader}>
                <CardTitle className={pCardTitle}>Inventory Valuation</CardTitle>
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
                        <Tooltip formatter={formatCurrencyTooltip} />
                        <Legend />
                        <Bar dataKey="value" fill="#8B5CF6" name="Value" />
                      </BarChart>
                    </ResponsiveContainer>
                    <ChartAccessibleTable
                      title="Inventory valuation by category"
                      columns={[
                        { key: "category", label: "Category" },
                        {
                          key: "value",
                          label: "Value",
                          format: (v) => formatCurrency(Number(v)),
                        },
                      ]}
                      data={inventoryValuation.by_category as Record<string, unknown>[]}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {lowStockData && (
            <Card className={pCard}>
              <CardHeader className={pCardHeader}>
                <CardTitle className={pCardTitle}>Low Stock Items</CardTitle>
              </CardHeader>
              <CardContent className={isPerfex ? "p-0" : "p-0 sm:p-6"}>
                {lowStockData.items && lowStockData.items.length > 0 ? (
                  <div className="overflow-x-auto -mx-2 sm:mx-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className={pTH}>Part Name</TableHead>
                          <TableHead className={pTH}>Category</TableHead>
                          <TableHead className={pTH}>Current Stock</TableHead>
                          <TableHead className={pTH}>Reorder Point</TableHead>
                          <TableHead className={pTH}>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>

                        {lowStockData.items.map((item: any) => (
                          <TableRow key={item.part.id}>
                            <TableCell className={isPerfex ? "px-4 py-2.5 text-xs font-medium" : "font-medium text-xs sm:text-sm"}>
                              {item.part.name}
                            </TableCell>
                            <TableCell className={pTD}>
                              {item.part.category || "N/A"}
                            </TableCell>
                            <TableCell className={pTD}>{item.stock.current}</TableCell>
                            <TableCell className={pTD}>
                              {item.stock.reorder_point}
                            </TableCell>
                            <TableCell className={pTD}>
                              <span
                                className={
                                  item.is_critical
                                    ? "text-destructive dark:text-red-400 font-medium"
                                    : "text-primary font-medium"
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
        )}

        {/* Customer Reports */}
        {(!isPerfex || activeTab === "customers") && (
        <TabsContent value="customers" className="space-y-4 sm:space-y-6">
          {customerStats && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className={pCard}>
                  <CardHeader className={pCardHeader}>
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
                <Card className={pCard}>
                  <CardHeader className={pCardHeader}>
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                      New Customers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl sm:text-2xl font-bold text-success">
                      {customerStats.new_customers || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card className={pCard}>
                  <CardHeader className={pCardHeader}>
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
                <Card className={pCard}>
                  <CardHeader className={pCardHeader}>
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
                  <Card className={pCard}>
                    <CardHeader className={pCardHeader}>
                      <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                        With Subscriptions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl sm:text-2xl font-bold text-primary dark:text-indigo-400">
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
                <Card className={pCard}>
                  <CardHeader className={pCardHeader}>
                    <CardTitle className={pCardTitle}>Top Customers by Revenue</CardTitle>
                  </CardHeader>
                  <CardContent className={isPerfex ? "p-0" : "p-0 sm:p-6"}>
                    <div className="overflow-x-auto -mx-2 sm:mx-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className={pTH}>Customer</TableHead>
                            <TableHead className={pTH}>Revenue</TableHead>
                            <TableHead className={pTH}>Work Orders</TableHead>
                            <TableHead className={pTH}>Subscription</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>

                          {customerStats.top_customers.map((customer: any) => (
                            <TableRow key={customer.id}>
                              <TableCell className={isPerfex ? "px-4 py-2.5 text-xs font-medium" : "font-medium text-xs sm:text-sm"}>
                                {customer.name}
                              </TableCell>
                              <TableCell className={pTD}>
                                {formatCurrency(customer.revenue ?? 0)}
                              </TableCell>
                              <TableCell className={pTD}>
                                {customer.work_orders || 0}
                              </TableCell>
                              <TableCell className={pTD}>
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
        )}

        {/* Subscription Analytics */}
        {(!isPerfex || activeTab === "subscriptions") && (
        <TabsContent value="subscriptions" className="space-y-4 sm:space-y-6">
          {subscriptionStats && (() => {
            const s = (subscriptionStats as { summary?: { mrr?: number; arr?: number; new_subscriptions?: number; churned?: number } }).summary;
            return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className={pCard}>
                <CardHeader className={pCardHeader}><CardTitle className={pCardTitle}>MRR</CardTitle></CardHeader>
                <CardContent className={pCardContent}>
                  <p className="text-lg font-semibold">{formatCurrency(s?.mrr ?? 0)}</p>
                </CardContent>
              </Card>
              <Card className={pCard}>
                <CardHeader className={pCardHeader}><CardTitle className={pCardTitle}>ARR</CardTitle></CardHeader>
                <CardContent className={pCardContent}>
                  <p className="text-lg font-semibold">{formatCurrency(s?.arr ?? 0)}</p>
                </CardContent>
              </Card>
              <Card className={pCard}>
                <CardHeader className={pCardHeader}><CardTitle className={pCardTitle}>New (period)</CardTitle></CardHeader>
                <CardContent className={pCardContent}>
                  <p className="text-lg font-semibold">{s?.new_subscriptions ?? 0}</p>
                </CardContent>
              </Card>
              <Card className={pCard}>
                <CardHeader className={pCardHeader}><CardTitle className={pCardTitle}>Churned (period)</CardTitle></CardHeader>
                <CardContent className={pCardContent}>
                  <p className="text-lg font-semibold">{s?.churned ?? 0}</p>
                </CardContent>
              </Card>
            </div>
            );
          })()}
          {!subscriptionStats && activeTab === "subscriptions" && (
            <p className="text-sm text-muted-foreground">Loading subscription analytics…</p>
          )}
        </TabsContent>
        )}

        {/* Vehicle Reports */}
        {(!isPerfex || activeTab === "vehicles") && (
        <TabsContent value="vehicles" className="space-y-4 sm:space-y-6">
          {vehicleStats && (
            <Card className={pCard}>
              <CardHeader className={pCardHeader}>
                <CardTitle className={pCardTitle}>Vehicle Statistics</CardTitle>
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
                    <ChartAccessibleTable
                      title="Vehicles by make"
                      columns={[
                        { key: "make", label: "Make" },
                        { key: "count", label: "Count" },
                      ]}
                      data={vehicleStats.by_make as Record<string, unknown>[]}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {serviceDueData && (
            <Card className={pCard}>
              <CardHeader className={pCardHeader}>
                <CardTitle className={pCardTitle}>Service Due Report</CardTitle>
              </CardHeader>
              <CardContent className={isPerfex ? "p-0" : "p-0 sm:p-6"}>
                {serviceDueData.vehicles && serviceDueData.vehicles.length > 0 ? (
                  <div className="overflow-x-auto -mx-2 sm:mx-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className={pTH}>Vehicle</TableHead>
                          <TableHead className={pTH}>Last Service</TableHead>
                          <TableHead className={pTH}>Next Service Due</TableHead>
                          <TableHead className={pTH}>Mileage</TableHead>
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
                            <TableCell className={pTD}>
                              {vehicle.last_service_date
                                ? format(new Date(vehicle.last_service_date), "MMM dd, yyyy")
                                : "N/A"}
                            </TableCell>
                            <TableCell className={pTD}>
                              {vehicle.next_service_due
                                ? format(new Date(vehicle.next_service_due), "MMM dd, yyyy")
                                : "N/A"}
                            </TableCell>
                            <TableCell className={pTD}>
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
        )}

        {(!isPerfex || activeTab === "controls") && (
        <TabsContent value="controls" className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className={pCard}>
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Report Catalog</p>
                <p className="text-2xl font-bold mt-1">{reportCatalog?.reports?.length || 0}</p>
              </CardContent>
            </Card>
            <Card className={pCard}>
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Saved Views</p>
                <p className="text-2xl font-bold mt-1">{savedReportsData?.count || 0}</p>
              </CardContent>
            </Card>
            <Card className={pCard}>
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Schedules</p>
                <p className="text-2xl font-bold mt-1">{schedulesData?.count || 0}</p>
              </CardContent>
            </Card>
            <Card className={pCard}>
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Export Logs</p>
                <p className="text-2xl font-bold mt-1">{exportLogsData?.count || 0}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className={pCard}>
              <CardHeader className={pCardHeader}>
                <CardTitle className={pCardTitle}>Saved Report Views</CardTitle>
              </CardHeader>
              <CardContent className={isPerfex ? "p-0" : ""}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={pTH}>Name</TableHead>
                      <TableHead className={pTH}>Type</TableHead>
                      <TableHead className={pTH}>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(savedReportsData?.results || []).slice(0, 5).map((report) => (
                      <TableRow
                        key={report.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => applySavedReportView(report)}
                      >
                        <TableCell className={isPerfex ? "px-4 py-2.5 text-xs font-medium" : "text-sm font-medium"}>{report.name}</TableCell>
                        <TableCell className={pTD}>{report.report_type.replace(/_/g, " ")}</TableCell>
                        <TableCell className={pTD}>{format(new Date(report.updated_at), "MMM dd, yyyy")}</TableCell>
                      </TableRow>
                    ))}
                    {!savedReportsData?.results?.length && (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                          No saved report views yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className={pCard}>
              <CardHeader className={pCardHeader}>
                <CardTitle className={pCardTitle}>Scheduled Reports</CardTitle>
              </CardHeader>
              <CardContent className={isPerfex ? "p-0" : ""}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={pTH}>Name</TableHead>
                      <TableHead className={pTH}>Frequency</TableHead>
                      <TableHead className={pTH}>Next Run</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(schedulesData?.results || []).slice(0, 5).map((schedule) => (
                      <TableRow key={schedule.id}>
                        <TableCell className={isPerfex ? "px-4 py-2.5 text-xs font-medium" : "text-sm font-medium"}>{schedule.name}</TableCell>
                        <TableCell className={pTD}>{schedule.frequency}</TableCell>
                        <TableCell className={pTD}>{format(new Date(schedule.next_run_date), "MMM dd, yyyy")}</TableCell>
                      </TableRow>
                    ))}
                    {!schedulesData?.results?.length && (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                          No scheduled reports yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card className={pCard}>
            <CardHeader className={pCardHeader}>
              <CardTitle className={pCardTitle}>Discounts & Overrides Analysis</CardTitle>
            </CardHeader>
            <CardContent className={isPerfex ? "p-0" : "p-0 sm:p-6"}>
              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={pTH}>Invoice #</TableHead>
                      <TableHead className={pTH}>Date</TableHead>
                      <TableHead className={pTH}>Subtotal</TableHead>
                      <TableHead className={pTH}>Discount</TableHead>
                      <TableHead className={pTH}>Reason</TableHead>
                      <TableHead className={pTH}>Total</TableHead>
                      <TableHead className={pTH}>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discountedInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No invoices with discounts found recently.
                        </TableCell>
                      </TableRow>
                    ) : (
                      discountedInvoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className={isPerfex ? "font-mono px-4 py-2.5 text-xs" : "font-mono text-xs sm:text-sm"}>{inv.invoice_number}</TableCell>
                          <TableCell className={pTD}>{format(new Date(inv.invoice_date), "MMM dd, yyyy")}</TableCell>
                          <TableCell className={pTD}>{formatCurrency(parseFloat(inv.subtotal || "0"))}</TableCell>
                          <TableCell className={isPerfex ? "px-4 py-2.5 text-xs font-bold text-primary" : "text-xs sm:text-sm font-bold text-primary"}>
                            {inv.discount_percentage ? `${inv.discount_percentage}%` : `${formatCurrency(parseFloat(inv.discount_amount || "0"))}`}
                          </TableCell>
                          <TableCell className={isPerfex ? "px-4 py-2.5 text-xs italic" : "text-xs sm:text-sm italic"}>{inv.discount_reason || "-"}</TableCell>
                          <TableCell className={isPerfex ? "px-4 py-2.5 text-xs font-bold" : "text-xs sm:text-sm font-bold"}>{formatCurrency(parseFloat(inv.total))}</TableCell>
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

          <Card className={pCard}>
            <CardHeader className={pCardHeader}>
              <CardTitle className={pCardTitle}>Export Audit Trail</CardTitle>
            </CardHeader>
            <CardContent className={isPerfex ? "p-0" : ""}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={pTH}>Report</TableHead>
                    <TableHead className={pTH}>Format</TableHead>
                    <TableHead className={pTH}>Status</TableHead>
                    <TableHead className={pTH}>Exported</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(exportLogsData?.results || []).slice(0, 8).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className={isPerfex ? "px-4 py-2.5 text-xs font-medium" : "text-sm font-medium"}>{log.report_name || log.report_type}</TableCell>
                      <TableCell className={pTD}>{log.export_format.toUpperCase()}</TableCell>
                      <TableCell className={pTD}>{log.status}</TableCell>
                      <TableCell className={pTD}>{format(new Date(log.created_at), "MMM dd, yyyy h:mm a")}</TableCell>
                    </TableRow>
                  ))}
                  {!exportLogsData?.results?.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        No report exports recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        )}
      </Tabs>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Report View</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="saved-report-name">Name</Label>
              <Input
                id="saved-report-name"
                value={savedReportName}
                onChange={(event) => setSavedReportName(event.target.value)}
                placeholder="Monthly revenue review"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="saved-report-description">Description</Label>
              <Textarea
                id="saved-report-description"
                value={savedReportDescription}
                onChange={(event) => setSavedReportDescription(event.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveReportMutation.mutate()} disabled={!savedReportName.trim() || saveReportMutation.isPending}>
              {saveReportMutation.isPending ? "Saving..." : "Save View"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-name">Name</Label>
              <Input
                id="schedule-name"
                value={scheduleName}
                onChange={(event) => setScheduleName(event.target.value)}
                placeholder="Weekly operations pack"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-frequency">Frequency</Label>
              <select
                id="schedule-frequency"
                value={scheduleFrequency}
                onChange={(event) => setScheduleFrequency(event.target.value as typeof scheduleFrequency)}
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-recipients">Recipients</Label>
              <Textarea
                id="schedule-recipients"
                value={scheduleRecipients}
                onChange={(event) => setScheduleRecipients(event.target.value)}
                placeholder="manager@example.com, finance@example.com"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => scheduleMutation.mutate()} disabled={!scheduleName.trim() || !scheduleRecipients.trim() || scheduleMutation.isPending}>
              {scheduleMutation.isPending ? "Scheduling..." : "Create Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
