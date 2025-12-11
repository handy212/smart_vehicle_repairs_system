"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { diagnosisApi } from "@/lib/api/diagnosis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Stethoscope,
  Plus,
  Search,
  Filter,
  Calendar,
  User,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

export default function DiagnosisListPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["diagnoses", { search: searchQuery, status: statusFilter }],
    queryFn: () =>
      diagnosisApi.list({
        search: searchQuery || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        ordering: "-created_at",
      }),
  });

  const diagnoses = data?.results || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Stethoscope className="w-8 h-8" />
            Diagnosis
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage vehicle diagnostic processes
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search by work order, customer, vehicle..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border rounded-md"
            >
              <option value="all">All Status</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="on_hold">On Hold</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Diagnosis List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : diagnoses.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <Stethoscope className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold mb-2">No diagnoses found</h3>
            <p className="text-gray-500 mb-4">
              {searchQuery
                ? "Try adjusting your search criteria"
                : "Get started by creating a diagnosis from a work order"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {diagnoses.map((diagnosis) => {
            const workOrder =
              typeof diagnosis.work_order === "object"
                ? diagnosis.work_order
                : null;
            const workOrderId =
              typeof diagnosis.work_order === "number"
                ? diagnosis.work_order
                : workOrder?.id || null;

            return (
              <Card
                key={diagnosis.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  if (workOrderId) {
                    router.push(`/workorders/${workOrderId}/diagnosis`);
                  }
                }}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">
                          {diagnosis.work_order_number ||
                            (workOrder ? `WO-${workOrder.id}` : `Diagnosis #${diagnosis.id}`)}
                        </h3>
                        <Badge
                          variant={
                            diagnosis.status === "completed"
                              ? "default"
                              : diagnosis.status === "on_hold"
                              ? "secondary"
                              : "info"
                          }
                        >
                          {diagnosis.status_display || diagnosis.status}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        {diagnosis.customer_name && (
                          <p>
                            <strong>Customer:</strong> {diagnosis.customer_name}
                          </p>
                        )}
                        {diagnosis.vehicle_info && (
                          <p>
                            <strong>Vehicle:</strong> {diagnosis.vehicle_info.year}{" "}
                            {diagnosis.vehicle_info.make}{" "}
                            {diagnosis.vehicle_info.model}
                          </p>
                        )}
                        {diagnosis.technician_name && (
                          <p>
                            <strong>Technician:</strong>{" "}
                            {diagnosis.technician_name}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-2">
                          Started:{" "}
                          {diagnosis.started_at
                            ? format(new Date(diagnosis.started_at), "PPp")
                            : "N/A"}
                        </p>
                      </div>
                      {diagnosis.customer_complaint && (
                        <p className="mt-3 text-sm text-gray-700 line-clamp-2">
                          {diagnosis.customer_complaint}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      <div className="text-right text-sm">
                        {diagnosis.diagnostic_fee && (
                          <p className="font-semibold">
                            ${Number(diagnosis.diagnostic_fee).toFixed(2)}
                          </p>
                        )}
                        {diagnosis.diagnostic_time_hours && (
                          <p className="text-gray-500">
                            {typeof diagnosis.diagnostic_time_hours === "string"
                              ? diagnosis.diagnostic_time_hours
                              : `${diagnosis.diagnostic_time_hours}h`}
                          </p>
                        )}
                      </div>
                      {workOrderId && (
                        <Link
                          href={`/workorders/${workOrderId}/diagnosis`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="outline">View</Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && (data.next || data.previous) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            disabled={!data.previous}
            onClick={() => {
              // Handle pagination
            }}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-500">
            Showing {diagnoses.length} of {data.count} diagnoses
          </span>
          <Button
            variant="outline"
            disabled={!data.next}
            onClick={() => {
              // Handle pagination
            }}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

