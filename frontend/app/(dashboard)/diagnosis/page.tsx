"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { diagnosisApi } from "@/lib/api/diagnosis";
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
  Clock,
  MoreVertical,
  Eye,
  FileText,
  DollarSign,
  MonitorCheck,
  Timer,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function DiagnosisListPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");

  const { data, isLoading } = useQuery({
    queryKey: ["diagnoses", { search: searchQuery, status: statusFilter, sort: sortBy }],
    queryFn: () => {
      let ordering = "-created_at";
      if (sortBy === "oldest") ordering = "created_at";
      else if (sortBy === "fee_high") ordering = "-diagnostic_fee";
      else if (sortBy === "fee_low") ordering = "diagnostic_fee";

      return diagnosisApi.list({
        search: searchQuery || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        ordering,
      });
    },
  });

  const diagnoses = data?.results || [];

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
            <Link href="/dashboard" className="hover:text-blue-600 transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">Diagnosis</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
            Diagnosis Overview
          </h1>
        </div>
        {/* Actions could go here if needed, e.g. "Export" */}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Total Reports
            </span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {stats.total}
              </span>
              <FileText className="w-5 h-5 text-gray-400 mb-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              In Progress
            </span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {stats.inProgress}
              </span>
              <Timer className="w-5 h-5 text-blue-400 mb-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Completed
            </span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-green-600 dark:text-green-400">
                {stats.completed}
              </span>
              <CheckCircle2 className="w-5 h-5 text-green-400 mb-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Total Fees
            </span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-purple-600 dark:text-purple-400">
                ${stats.totalFee.toFixed(2)}
              </span>
              <DollarSign className="w-5 h-5 text-purple-400 mb-0.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search diagnosis..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm bg-white dark:bg-gray-900 transition-all focus:w-full sm:focus:w-80"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 w-32 rounded-md border border-gray-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 dark:border-gray-800 dark:bg-gray-900 dark:focus-visible:ring-gray-300"
              >
                <option value="all">All Status</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="h-9 w-36 rounded-md border border-gray-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 dark:border-gray-800 dark:bg-gray-900 dark:focus-visible:ring-gray-300"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="fee_high">Fee: High to Low</option>
                <option value="fee_low">Fee: Low to High</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : diagnoses.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-800">
            <Stethoscope className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No diagnoses found</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {searchQuery || statusFilter !== "all"
                ? "Try adjusting your search or filters."
                : "Diagnosis reports will appear here when technicians start working on them."}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50 dark:bg-gray-800/50 hover:bg-gray-50/50">
                  <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    ID / WO#
                  </TableHead>
                  <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    Date Started
                  </TableHead>
                  <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    Vehicle
                  </TableHead>
                  <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 hidden md:table-cell">
                    Complaint
                  </TableHead>
                  <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    Technician
                  </TableHead>
                  <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    Status
                  </TableHead>
                  <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 text-right">
                    Fee
                  </TableHead>
                  <TableHead className="h-10 w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diagnoses.map((diagnosis) => {
                  const workOrder =
                    typeof diagnosis.work_order === "object" ? diagnosis.work_order : null;
                  const workOrderId =
                    typeof diagnosis.work_order === "number"
                      ? diagnosis.work_order
                      : workOrder?.id || null;

                  const handleRowClick = () => {
                    if (workOrderId) {
                      router.push(`/workorders/${workOrderId}/diagnosis`);
                    }
                  };

                  return (
                    <TableRow
                      key={diagnosis.id}
                      className="group cursor-pointer hover:bg-gray-50/80 dark:hover:bg-gray-800/80 transition-colors"
                      onDoubleClick={handleRowClick}
                    >
                      <TableCell className="py-2.5 font-medium">
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            #{diagnosis.id}
                          </span>
                          <span className="text-xs text-gray-500 font-mono">
                            {diagnosis.work_order_number || (workOrder ? `WO-${workOrder.id}` : "-")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-gray-600 dark:text-gray-400">
                        {diagnosis.started_at
                          ? format(new Date(diagnosis.started_at), "MMM d, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="py-2.5">
                        {diagnosis.vehicle_info ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {diagnosis.vehicle_info.make} {diagnosis.vehicle_info.model}
                            </span>
                            <span className="text-xs text-gray-500">
                              {diagnosis.vehicle_info.year} • {diagnosis.vehicle_info.license_plate}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Unknown Vehicle</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 hidden md:table-cell">
                        <div className="max-w-[250px] truncate text-xs text-gray-600 dark:text-gray-400" title={diagnosis.customer_complaint}>
                          {diagnosis.customer_complaint || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        {diagnosis.technician_name ? (
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-700 dark:text-gray-300">
                              {diagnosis.technician_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-2 py-0.5 font-medium border shadow-none",
                            diagnosis.status === "completed"
                              ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                              : diagnosis.status === "on_hold"
                                ? "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700"
                                : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800"
                          )}
                        >
                          {diagnosis.status_display || diagnosis.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-medium text-sm text-gray-900 dark:text-gray-100">
                        {diagnosis.diagnostic_fee ? `$${Number(diagnosis.diagnostic_fee).toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <span className="sr-only">Open menu</span>
                              <MoreVertical className="h-3.5 w-3.5 text-gray-500" />
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
