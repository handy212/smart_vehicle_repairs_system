"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Filter, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks/useToast";

export default function MyEstimatesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const { data: estimatesData, isLoading } = useQuery({
    queryKey: ["portal", "estimates", statusFilter],
    queryFn: () => {
      const customerId = user?.customer_profile?.id || (user as any)?.customer?.id;
      if (!customerId) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });
      const params: any = {
        customer: customerId,
        ordering: "-created_at",
      };
      if (statusFilter !== "all") {
        params.status = statusFilter;
      }
      return billingApi.estimates.list(params);
    },
    enabled: !!user && !!(user?.customer_profile?.id || (user as any)?.customer?.id),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => billingApi.estimates.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "estimates"] });
      toast({
        title: "Estimate Approved",
        description: "The estimate has been approved. Work will begin shortly.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to approve estimate",
        variant: "destructive",
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      billingApi.estimates.decline(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "estimates"] });
      toast({
        title: "Estimate Declined",
        description: "The estimate has been declined.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to decline estimate",
        variant: "destructive",
      });
    },
  });

  const estimates = (estimatesData?.results || estimatesData || []) as any[];
  const pendingEstimates = estimates.filter((est: any) => est.status === "sent");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-48 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "approved":
        return "success";
      case "sent":
        return "warning";
      case "declined":
        return "danger";
      case "expired":
        return "secondary";
      default:
        return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">My Estimates</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          View and approve your service estimates
        </p>
      </div>

      {pendingEstimates.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              <div>
                <p className="font-medium text-yellow-900 dark:text-yellow-100">
                  {pendingEstimates.length} estimate(s) pending your approval
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Please review and approve or decline these estimates
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-4">
            <Filter className="w-5 h-5 text-gray-400" />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-48"
            >
              <option value="all">All Status</option>
              <option value="sent">Pending</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
              <option value="expired">Expired</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Estimates List */}
      {estimates.length > 0 ? (
        <div className="space-y-4">
          {estimates.map((estimate: any) => (
            <Card key={estimate.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <FileText className="w-5 h-5 text-blue-500" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Estimate #{estimate.estimate_number}
                      </h3>
                    </div>
                    <div className="ml-8 space-y-1">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Date: {format(new Date(estimate.estimate_date || estimate.created_at), "MMM d, yyyy")}
                      </p>
                      {estimate.expiration_date && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Expires: {format(new Date(estimate.expiration_date), "MMM d, yyyy")}
                        </p>
                      )}
                      {estimate.work_order && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Work Order: #{typeof estimate.work_order === "object" ? estimate.work_order.work_order_number : estimate.work_order}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      ${parseFloat(estimate.total || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <Badge variant={getStatusVariant(estimate.status)}>{estimate.status}</Badge>
                    <div className="flex items-center space-x-2 mt-2">
                      <Link href={`/portal/estimates/${estimate.id}`}>
                        <Buttonvariant="secondary" size="sm">
                          View Details
                        </Button>
                      </Link>
                      {estimate.status === "sent" && estimate.can_be_approved && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => approveMutation.mutate(estimate.id)}
                            disabled={approveMutation.isPending}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              const reason = prompt("Reason for declining (optional):");
                              declineMutation.mutate({ id: estimate.id, reason: reason || undefined });
                            }}
                            disabled={declineMutation.isPending}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Decline
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              No estimates found
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
              {statusFilter !== "all"
                ? `No estimates with status "${statusFilter}" found.`
                : "You don't have any estimates yet. Estimates will appear here when services are quoted."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

