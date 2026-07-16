"use client";

import { useState, useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Diagnosis, diagnosisApi } from "@/lib/api/diagnosis";
import { WorkOrder, workordersApi } from "@/lib/api/workorders";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Stethoscope,
  Search,
  User,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Clock,
  MoreVertical,
  Eye,
  FileText,
  DollarSign,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  MonitorCheck,
  Timer,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortOrderingParam, toggleSortConfig } from "@/lib/utils/table-sort";

import { useCurrency } from "@/lib/hooks/useCurrency";

type VehicleInfoObject = {
  make?: string;
  model?: string;
  year?: number | string;
  license_plate?: string;
};

const getWorkOrder = (diagnosis: Diagnosis, fallbackWorkOrder?: WorkOrder | null): WorkOrder | null =>
  typeof diagnosis.work_order === "object" ? diagnosis.work_order : fallbackWorkOrder || null;

const getVehicleDisplay = (diagnosis: Diagnosis, fallbackWorkOrder?: WorkOrder | null) => {
  const workOrder = getWorkOrder(diagnosis, fallbackWorkOrder);
  const vehicleInfo = diagnosis.vehicle_info;

  if (typeof vehicleInfo === "string") {
    return { primary: vehicleInfo, secondary: "" };
  }

  if (vehicleInfo) {
    const primary = [vehicleInfo.make, vehicleInfo.model].filter(Boolean).join(" ");
    const secondary = [vehicleInfo.year, vehicleInfo.license_plate].filter(Boolean).join(" • ");

    return {
      primary: primary || workOrder?.vehicle_display || workOrder?.vehicle_info || "Unknown Vehicle",
      secondary,
    };
  }

  if (workOrder?.vehicle_display || workOrder?.vehicle_info) {
    return {
      primary: workOrder.vehicle_display || workOrder.vehicle_info || "Unknown Vehicle",
      secondary: "",
    };
  }

  if (workOrder && typeof workOrder.vehicle === "object") {
    const vehicle = workOrder.vehicle as VehicleInfoObject;
    const primary = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");

    return {
      primary: primary || "Unknown Vehicle",
      secondary: vehicle.license_plate || "",
    };
  }

  return { primary: "Unknown Vehicle", secondary: "" };
};

const getComplaint = (diagnosis: Diagnosis, fallbackWorkOrder?: WorkOrder | null) => {
  const workOrder = getWorkOrder(diagnosis, fallbackWorkOrder);
  return diagnosis.customer_complaint || workOrder?.customer_concerns || "-";
};

export default function DiagnosisListPage() {
  const { formatCurrency } = useCurrency();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ field: "started_at", direction: "desc" });

  const handleSort = (field: string) => {
    setSortConfig((current) => toggleSortConfig(current, field));
  };

  const { data, isLoading } = useQuery({
    queryKey: ["diagnoses", { search: searchQuery, status: statusFilter, sortConfig }],
    queryFn: () =>
      diagnosisApi.list({
        search: searchQuery || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        ordering: sortOrderingParam(sortConfig) || "-started_at",
      }),
  });

  const diagnoses = useMemo(() => data?.results || [], [data?.results]);
  const workOrderIds = useMemo(
    () => Array.from(new Set(
      diagnoses
        .map((diagnosis) => typeof diagnosis.work_order === "number" ? diagnosis.work_order : diagnosis.work_order?.id)
        .filter((id): id is number => Boolean(id))
    )),
    [diagnoses]
  );
  const workOrderQueries = useQueries({
    queries: workOrderIds.map((id) => ({
      queryKey: ["workorder", id],
      queryFn: () => workordersApi.get(id),
      enabled: !!id,
    })),
  });
  const workOrdersById = useMemo(() => {
    const entries = workOrderQueries
      .map((query) => query.data)
      .filter((workOrder): workOrder is WorkOrder => Boolean(workOrder))
      .map((workOrder) => [workOrder.id, workOrder] as const);

    return new Map(entries);
  }, [workOrderQueries]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = diagnoses.length;
    const inProgress = diagnoses.filter((d) => d.status === "in_progress").length;
    const completed = diagnoses.filter((d) => d.status === "completed").length;
    const totalFee = diagnoses.reduce((sum, d) => sum + Number(d.diagnostic_fee || 0), 0);

    return { total, inProgress, completed, totalFee };
  }, [diagnoses]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard" className="hover:text-primary transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Diagnosis</span>
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Diagnosis Overview
          </h1>
        </div>
        {/* Actions could go here if needed, e.g. "Export" */}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-none shadow-sm bg-muted/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Reports
            </span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-foreground">
                {stats.total}
              </span>
              <FileText className="w-5 h-5 text-muted-foreground mb-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-muted/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              In Progress
            </span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-primary">
                {stats.inProgress}
              </span>
              <Timer className="w-5 h-5 text-warning mb-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-muted/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Completed
            </span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-success">
                {stats.completed}
              </span>
              <CheckCircle2 className="w-5 h-5 text-success mb-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-muted/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Fees
            </span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-primary dark:text-info">
                {formatCurrency(stats.totalFee)}
              </span>
              <DollarSign className="w-5 h-5 text-info mb-0.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card className="border-none shadow-sm bg-muted/50">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search diagnosis..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm bg-card transition-all focus:w-full sm:focus:w-80"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 w-32 rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border border-border bg-background dark:focus-visible:ring-border"
              >
                <option value="all">All Status</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : diagnoses.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-lg border border-dashed border-border">
            <Stethoscope className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground">No diagnoses found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {searchQuery || statusFilter !== "all"
                ? "Try adjusting your search or filters."
                : "Diagnosis reports will appear here when technicians start working on them."}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-card overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <SortableHeader field="id" sortConfig={sortConfig} onSort={handleSort} className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    ID / WO#
                  </SortableHeader>
                  <SortableHeader field="started_at" sortConfig={sortConfig} onSort={handleSort} className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Date Started
                  </SortableHeader>
                  <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Vehicle
                  </TableHead>
                  <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground hidden md:table-cell">
                    Complaint
                  </TableHead>
                  <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Technician
                  </TableHead>
                  <SortableHeader field="status" sortConfig={sortConfig} onSort={handleSort} className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Status
                  </SortableHeader>
                  <SortableHeader field="diagnostic_fee" sortConfig={sortConfig} onSort={handleSort} className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">
                    Fee
                  </SortableHeader>
                  <TableHead className="h-10 w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diagnoses.map((diagnosis) => {
                  const workOrderId =
                    typeof diagnosis.work_order === "number"
                      ? diagnosis.work_order
                      : diagnosis.work_order?.id || null;
                  const fetchedWorkOrder = workOrderId ? workOrdersById.get(workOrderId) : null;
                  const workOrder = getWorkOrder(diagnosis, fetchedWorkOrder);
                  const vehicleDisplay = getVehicleDisplay(diagnosis, fetchedWorkOrder);
                  const complaint = getComplaint(diagnosis, fetchedWorkOrder);

                  const handleRowClick = () => {
                    if (workOrderId) {
                      router.push(`/workorders/${workOrderId}/diagnosis`);
                    }
                  };

                  return (
                    <TableRow
                      key={diagnosis.id}
                      className="group cursor-pointer hover:bg-muted/80 hover:bg-muted/80 transition-colors"
                      onDoubleClick={handleRowClick}
                    >
                      <TableCell className="py-2.5 font-medium">
                        <div className="flex flex-col">
                          <span className="text-sm text-foreground">
                            #{diagnosis.id}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {diagnosis.work_order_number || (workOrder ? `WO-${workOrder.id}` : "-")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground">
                        {diagnosis.started_at
                          ? format(new Date(diagnosis.started_at), "MMM d, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">
                            {vehicleDisplay.primary}
                          </span>
                          {vehicleDisplay.secondary && (
                            <span className="text-xs text-muted-foreground">
                              {vehicleDisplay.secondary}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 hidden md:table-cell">
                        <div className="max-w-[250px] truncate text-xs text-muted-foreground" title={complaint}>
                          {complaint}
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        {diagnosis.technician_name ? (
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-card-foreground">
                              {diagnosis.technician_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-2 py-0.5 font-medium border shadow-none",
                            diagnosis.status === "completed"
                              ? "bg-success/15 text-success border-success/20 dark:bg-success/20 dark:text-success dark:border-success/30"
                              : diagnosis.status === "on_hold"
                                ? "bg-muted text-foreground border-border bg-muted text-muted-foreground border-border"
                                : "bg-primary/10 text-primary border-warning/20 dark:bg-warning/20 text-primary dark:border-warning/30"
                          )}
                        >
                          {diagnosis.status_display || diagnosis.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-medium text-sm text-foreground">
                        {diagnosis.diagnostic_fee ? `${formatCurrency(Number(diagnosis.diagnostic_fee))}` : "-"}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-7 w-7 p-0 transition-opacity"
                            >
                              <span className="sr-only">Open menu</span>
                              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={handleRowClick}>
                              <Eye className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                              View Details
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination logic could be added here if needed */}
      </div>
    </div>
  );
}
