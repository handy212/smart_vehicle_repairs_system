"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { billingApi } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

export default function SalesOrderDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ["sales-order", id],
    queryFn: () => billingApi.salesOrders.get(id),
    enabled: !!id,
  });

  const convertMutation = useMutation({
    mutationFn: () => billingApi.salesOrders.convertToWorkOrder(id),
    onSuccess: () => {
      toast({ title: "Work order created" });
      queryClient.invalidateQueries({ queryKey: ["sales-order", id] });
    },
    onError: (error) => {
      toast({ title: "Conversion failed", description: getUserFacingError(error), variant: "destructive" });
    },
  });

  if (isLoading || !order) {
    return <div className="p-6 text-muted-foreground">Loading sales order...</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{order.sales_order_number}</h1>
          <p className="text-sm text-muted-foreground mt-1">{order.customer_name}</p>
        </div>
        <Badge variant="outline">{order.status.replace("_", " ")}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Order Date</span><span>{format(new Date(order.order_date), "MMM d, yyyy")}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span>{order.reference_number || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Vehicle</span><span>{order.vehicle_display || "—"}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Linked Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Estimate</span>
              {order.estimate ? (
                <Link href={`/billing/estimates/${order.estimate}`} className="text-primary hover:underline">
                  {order.estimate_number}
                </Link>
              ) : "—"}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Work Order</span>
              {order.work_order ? (
                <Link href={`/workorders/${order.work_order}`} className="text-primary hover:underline">
                  {order.work_order_number}
                </Link>
              ) : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {order.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent className="text-sm">{order.notes}</CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {order.estimate && !order.work_order && (
          <Button onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}>
            Convert Estimate to Work Order
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link href="/billing/sales-orders">Back to List</Link>
        </Button>
      </div>
    </div>
  );
}
