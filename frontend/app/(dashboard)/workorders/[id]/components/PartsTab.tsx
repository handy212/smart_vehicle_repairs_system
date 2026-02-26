"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { workOrderPartsApi, WorkOrderPart } from "@/lib/api/workorder-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, CheckCircle2, Package, ThumbsUp } from "lucide-react";
import AddPartDialog from "./AddPartDialog";

import { useCurrency } from "@/lib/hooks/useCurrency";
interface PartsTabProps {
  workOrderId: number;
  parts: WorkOrderPart[];
  onRefresh: () => void;
}

export default function WorkOrderPartsTab({
  workOrderId, parts, onRefresh }: PartsTabProps) {
  const { formatCurrency } = useCurrency();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "installed":
        return "success";
      case "ordered":
        return "info";
      case "received":
        return "warning";
      default:
        return "default";
    }
  };

  const markInstalledMutation = useMutation({
    mutationFn: (partId: number) => workOrderPartsApi.markInstalled(partId),
    onSuccess: () => {
      onRefresh();
    },
  });

  const approveMutation = useMutation({
    mutationFn: (partId: number) => workOrderPartsApi.approve(partId),
    onSuccess: () => {
      onRefresh();
    },
  });

  const totalPartsCost = parts.reduce((sum, part) => {
    return sum + parseFloat(part.total_cost || "0");
  }, 0);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Parts & Materials</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {parts.length > 0 ? (
                <>Total Cost: {formatCurrency(totalPartsCost)} • {parts.length} {parts.length === 1 ? 'part' : 'parts'}</>
              ) : (
                <>No parts added yet</>
              )}
            </p>
          </div>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Part
          </Button>
        </CardHeader>
        <CardContent>
          {parts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-300 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">
                No parts added yet
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Add parts and materials as they are used in the repair work.
              </p>
              <Button onClick={() => setShowAddDialog(true)} variant="secondary">
                <Plus className="w-4 h-4 mr-2" />
                Add First Part
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Req. #</TableHead>
                  <TableHead>Part Details</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit Cost</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.map((part) => (
                  <TableRow key={part.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {part.requisition_number || "-"}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{part.part_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{part.part_number}</div>
                        {part.description && (
                          <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{part.description}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {part.requested_by_name || "Unknown"}
                      </div>
                    </TableCell>
                    <TableCell>{part.quantity}</TableCell>
                    <TableCell>{formatCurrency(parseFloat(part.unit_cost || "0"))}</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(parseFloat(part.total_cost || "0"))}
                    </TableCell>
                    <TableCell>

                      <Badge variant={getStatusVariant(part.status) as any}>
                        {part.status?.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {part.status !== "installed" && (
                        <>
                          {!part.approved_by && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mr-2 border-green-500 text-green-600 hover:bg-green-50"
                              onClick={() => approveMutation.mutate(part.id)}
                              disabled={approveMutation.isPending}
                            >
                              <ThumbsUp className="w-3 h-3 mr-1" />
                              Approve
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => markInstalledMutation.mutate(part.id)}
                            disabled={markInstalledMutation.isPending}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Mark Installed
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showAddDialog && (
        <AddPartDialog
          workOrderId={workOrderId}
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onSuccess={() => {
            setShowAddDialog(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
}

