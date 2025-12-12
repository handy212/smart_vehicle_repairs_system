"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { diagnosisApi } from "@/lib/api/diagnosis";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Stethoscope,
  Search,
  User,
  Clock,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";

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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Stethoscope className="w-6 h-6" />
          Diagnosis
        </h1>
        {diagnoses.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>{stats.total} total</span>
          </div>
        )}
      </div>

      {/* Stats Bar - Only show if there are diagnoses */}
      {diagnoses.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500 mb-1">Total</p>
              <p className="text-xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-yellow-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500 mb-1">In Progress</p>
              <p className="text-xl font-bold">{stats.inProgress}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500 mb-1">Completed</p>
              <p className="text-xl font-bold">{stats.completed}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500 mb-1">Total Fees</p>
              <p className="text-xl font-bold">${stats.totalFee.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm"
        >
          <option value="all">All Status</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="on_hold">On Hold</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="fee_high">Fee: High to Low</option>
          <option value="fee_low">Fee: Low to High</option>
        </select>
      </div>

      {/* Diagnosis List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : diagnoses.length === 0 ? (
        <div className="text-center py-16">
          <Stethoscope className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p className="text-sm text-gray-500">
            {searchQuery || statusFilter !== "all" ? "No diagnoses found" : "No diagnoses yet"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {diagnoses.map((diagnosis) => {
            const workOrder =
              typeof diagnosis.work_order === "object" ? diagnosis.work_order : null;
            const workOrderId =
              typeof diagnosis.work_order === "number"
                ? diagnosis.work_order
                : workOrder?.id || null;

            return (
              <Card
                key={diagnosis.id}
                className="hover:shadow-lg transition-all cursor-pointer group border-l-4 border-l-transparent hover:border-l-blue-500"
                onClick={() => {
                  if (workOrderId) {
                    router.push(`/workorders/${workOrderId}/diagnosis`);
                  }
                }}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">
                        {diagnosis.work_order_number ||
                          (workOrder ? `WO-${workOrder.id}` : `#${diagnosis.id}`)}
                      </h3>
                      {diagnosis.started_at && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {format(new Date(diagnosis.started_at), "MMM d, yyyy")}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        diagnosis.status === "completed"
                          ? "default"
                          : diagnosis.status === "on_hold"
                          ? "secondary"
                          : "info"
                      }
                      className="shrink-0 text-xs"
                    >
                      {diagnosis.status_display || diagnosis.status}
                    </Badge>
                  </div>

                  {/* Vehicle */}
                  {diagnosis.vehicle_info && (
                    <div className="text-sm font-medium text-gray-700 truncate">
                      {diagnosis.vehicle_info.year} {diagnosis.vehicle_info.make}{" "}
                      {diagnosis.vehicle_info.model}
                    </div>
                  )}

                  {/* Complaint */}
                  {diagnosis.customer_complaint && (
                    <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                      {diagnosis.customer_complaint}
                    </p>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {diagnosis.technician_name && (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span className="truncate max-w-20">
                            {diagnosis.technician_name.split(" ")[0]}
                          </span>
                        </div>
                      )}
                      {diagnosis.diagnostic_time_hours && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            {typeof diagnosis.diagnostic_time_hours === "string"
                              ? diagnosis.diagnostic_time_hours
                              : `${diagnosis.diagnostic_time_hours}h`}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {diagnosis.diagnostic_fee && (
                        <span className="text-sm font-semibold text-gray-700">
                          ${Number(diagnosis.diagnostic_fee).toFixed(2)}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && data.count > diagnoses.length && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button
           variant="secondary"
            size="sm"
            disabled={!data.previous}
            onClick={() => {
              // Handle pagination - implement if needed
            }}
          >
            Previous
          </Button>
          <span className="text-xs text-gray-500">
            Showing {diagnoses.length} of {data.count}
          </span>
          <Button
           variant="secondary"
            size="sm"
            disabled={!data.next}
            onClick={() => {
              // Handle pagination - implement if needed
            }}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
