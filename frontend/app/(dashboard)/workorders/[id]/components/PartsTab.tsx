"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { workOrderPartsApi, WorkOrderPart } from "@/lib/api/workorder-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, CheckCircle2 } from "lucide-react";
import AddPartDialog from "./AddPartDialog";

interface PartsTabProps {
  workOrderId: number;
  parts: WorkOrderPart[];
  onRefresh: () => void;
}

export default function WorkOrderPartsTab({ workOrderId, parts, onRefresh }: PartsTabProps) {
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

  const totalPartsCost = parts.reduce((sum, part) => {
    return sum + parseFloat(part.total_cost || "0");
  }, 0);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Parts Used</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Total: ${totalPartsCost.toFixed(2)} ({parts.length} parts)
            </p>
          </div>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Part
          </Button>
        </CardHeader>
        <CardContent>
          {parts.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No parts added yet. Add parts as they are used.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Part Name</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Unit Cost</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.map((part) => (
                  <TableRow key={part.id}>
                    <TableCell className="font-mono text-sm">{part.part_number}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{part.part_name}</p>
                        {part.description && (
                          <p className="text-xs text-gray-500 mt-1">{part.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{part.quantity}</TableCell>
                    <TableCell>${parseFloat(part.unit_cost || "0").toFixed(2)}</TableCell>
                    <TableCell className="font-medium">
                      ${parseFloat(part.total_cost || "0").toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(part.status) as any}>
                        {part.status?.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {part.status !== "installed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markInstalledMutation.mutate(part.id)}
                          disabled={markInstalledMutation.isPending}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Mark Installed
                        </Button>
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

