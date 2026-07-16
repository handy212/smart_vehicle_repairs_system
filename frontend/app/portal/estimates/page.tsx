"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { portalApi } from "@/lib/api/portal";
import { authApi } from "@/lib/api/auth";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { PremiumIcons } from "@/components/ui/icons";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalList } from "../components/PortalList";
import { PortalCard } from "../components/PortalCard";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { Estimate } from "@/lib/api/portal";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { getUserFacingError } from "@/lib/api/errors";

export default function MyEstimatesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const router = useRouter();

  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const { data: estimatesData, isLoading } = useQuery({
    queryKey: ["portal", "estimates", statusFilter],
    queryFn: () => {
      const customerId = user?.customer_profile?.id || user?.customer?.id;
      if (!customerId) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });

      const params: Record<string, string | number | boolean> = {
        customer: customerId,
        ordering: "-created_at",
      };
      if (statusFilter !== "all") {
        params.status = statusFilter;
      }
      return portalApi.listEstimates(params);
    },
    enabled: !!user && !!(user?.customer_profile?.id || user?.customer?.id),
  });

  const estimates = (Array.isArray(estimatesData) ? estimatesData : estimatesData?.results || []) as Estimate[];

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      portalApi.approveEstimate(id, {
        notes: "Approved via portal",
        accepted_terms: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "estimates"] });
      toast.success("Estimate Approved", {
        description: "The estimate has been approved. Work will begin shortly.",
      });
    },
    onError: (error: { response?: { data?: { error?: string; detail?: string } } }) => {
      toast.error("Error", {
        description: getUserFacingError(error, "Failed to approve estimate"),
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => 
      portalApi.declineEstimate(id, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "estimates"] });
      toast.success("Estimate Declined", {
        description: "The estimate has been declined successfully.",
      });
    },
    onError: (error: { response?: { data?: { error?: string; detail?: string } } }) => {
      toast.error("Error", {
        description: getUserFacingError(error, "Failed to decline estimate"),
      });
    },
  });

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "approved": return { variant: "success" as const, className: "bg-success/10 text-success border-success/20" };
      case "sent": return { variant: "warning" as const, className: "bg-warning/10 text-warning border-warning/20" };
      case "declined": return { variant: "danger" as const, className: "bg-destructive/10 text-destructive border-destructive/20" };
      case "expired": return { variant: "secondary" as const, className: "opacity-50" };
      default: return { variant: "secondary" as const, className: "bg-muted text-muted-foreground" };
    }
  };

  const canActOnEstimate = (estimate: Estimate) => {
    return ["sent", "viewed"].includes(estimate.status) && (
      !estimate.work_order_status || estimate.work_order_status === "awaiting_approval"
    );
  };

  return (
    <div className="space-y-8 w-full">
      <PortalPageHeader
        title="Repairs Estimates"
      />

      <div className="space-y-10">
        <div className="flex flex-wrap gap-2">
            {["all", "sent", "approved", "declined"].map((status) => (
                <Button
                    key={status}
                    variant={statusFilter === status ? "default" : "outline"}
                    onClick={() => setStatusFilter(status)}
                    className="capitalize"
                    size="sm"
                >
                    {status}
                </Button>
            ))}
        </div>
        
        <div>
            <PortalList
          data={estimates}
          isLoading={isLoading}
          emptyMessage="No estimates found."
          columns={[
            {
              header: "Reference",
              cell: (est) => (
                <div className="flex flex-col">
                  <span className="font-bold text-foreground">EST-{est.id.toString().padStart(4, '0')}</span>
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest opacity-60">
                    {est.created_at ? format(new Date(est.created_at), "MMM d, yyyy") : "Draft"}
                  </span>
                </div>
              ),
            },
            {
              header: "Vehicle",
              cell: (est) => (
                <div className="flex items-center gap-2 text-sm font-bold text-foreground group-hover/row:text-primary transition-colors">
                  <PremiumIcons.Car className="w-4 h-4 opacity-40" />
                  {est.vehicle_info || "Premium Vehicle"}
                </div>
              ),
            },
            {
              header: "Amount",
              cell: (est) => (
                <div className="font-semibold text-foreground">
                  {formatCurrency(parseFloat(String(est.total || 0)))}
                </div>
              ),
            },
            {
              header: "Status",
              cell: (est) => {
                const config = getStatusConfig(est.status);
                return (
                  <Badge 
                    variant={config.variant} 
                    className={cn("capitalize text-[10px] font-semibold tracking-widest px-3 py-1 rounded-full border", config.className)}
                  >
                    {est.status}
                  </Badge>
                );
              },
            },
            {
              header: "Actions",
              className: "text-right",
              cell: (est) => (
                <div className="flex justify-end gap-2">
                  {canActOnEstimate(est) && (
                    <>
                      <Button
                        size="sm"
                        className="bg-success hover:bg-success text-white rounded-xl px-4 font-bold shadow-lg shadow-success/20"
                        onClick={() => router.push(`/portal/estimates/${est.id}`)}
                      >
                        Review & Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/20 text-destructive hover:bg-destructive/5 rounded-xl px-4 font-bold"
                        onClick={() => {
                          const reason = prompt("Reason for declining (optional):");
                          declineMutation.mutate({ id: est.id, reason: reason || undefined });
                        }}
                        disabled={declineMutation.isPending}
                      >
                        Decline
                      </Button>
                    </>
                  )}
                  {["sent", "viewed"].includes(est.status) && !canActOnEstimate(est) && (
                    <Badge variant="outline" className="h-8 capitalize">
                      WO {est.work_order_status?.replace(/_/g, " ")}
                    </Badge>
                  )}
                  <Link href={`/portal/estimates/${est.id}`}>
                    <Button variant="ghost" size="sm" className="gap-2 hover:bg-primary/5 hover:text-primary rounded-lg font-bold group/btn">
                      View
                      <ExternalLink className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                    </Button>
                  </Link>
                </div>
              ),
            },
          ]}
          renderMobileItem={(est) => {
            const config = getStatusConfig(est.status);
            return (
              <PortalCard
                key={est.id}
                href={`/portal/estimates/${est.id}`}
                icon={<PremiumIcons.FileText className="w-6 h-6" />}
                title={`Estimate EST-${est.id.toString().padStart(4, '0')}`}
                subtitle={
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold uppercase text-muted-foreground/60 tracking-widest">{est.vehicle_info}</span>
                      <span className="font-semibold text-foreground">{formatCurrency(parseFloat(String(est.total || 0)))}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <Badge 
                        variant={config.variant} 
                        className={cn("capitalize text-[9px] font-semibold tracking-widest px-2 py-0.5 rounded-full border", config.className)}
                      >
                        {est.status}
                      </Badge>
                      {canActOnEstimate(est) && (
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                className="bg-success hover:bg-success text-white rounded-xl font-bold h-10"
                                onClick={(e) => {
                                    e.preventDefault();
                                    router.push(`/portal/estimates/${est.id}`);
                                }}
                            >
                                Review & Approve
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-destructive/20 text-destructive hover:bg-destructive/5 rounded-xl font-bold h-10"
                                onClick={() => {
                                    const reason = prompt("Reason for declining (optional):");
                                    declineMutation.mutate({ id: est.id, reason: reason || undefined });
                                }}
                            >
                                Decline
                            </Button>
                        </div>
                      )}
                      {["sent", "viewed"].includes(est.status) && !canActOnEstimate(est) && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          WO {est.work_order_status?.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </div>
                }
              />
            );
          }}
        />
        </div>
      </div>
    </div>
  );
}
