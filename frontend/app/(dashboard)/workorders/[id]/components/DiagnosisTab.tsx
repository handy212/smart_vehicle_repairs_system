"use client";

import { useQuery } from "@tanstack/react-query";
import { diagnosisApi } from "@/lib/api/diagnosis";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Clock,
  DollarSign,
  Edit,
  Plus,
  Search,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

import { useCurrency } from "@/lib/hooks/useCurrency";
interface DiagnosisTabProps {
  workOrderId: number;

  workOrder?: any;
  onRefresh?: () => void;
}

export default function DiagnosisTab({ workOrderId }: DiagnosisTabProps) {
  const { formatCurrency } = useCurrency();

  // Fetch diagnosis for this work order
  const { data: diagnosis, isLoading } = useQuery({
    queryKey: ["diagnosis", "workorder", workOrderId],
    queryFn: () => diagnosisApi.getByWorkOrder(workOrderId),
    enabled: !!workOrderId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading diagnosis...</p>
        </CardContent>
      </Card>
    );
  }

  // No diagnosis yet
  if (!diagnosis) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Search className="w-12 h-12 text-gray-300 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2 text-foreground">No Diagnosis Started</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Start diagnosis to document findings, identify root causes, and create repair recommendations for the customer.
          </p>
          <Link href={`/workorders/${workOrderId}/diagnosis`}>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Start Diagnosis
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Diagnosis exists - show summary
  return (
    <div className="space-y-6">
      {/* Diagnosis Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Diagnosis</CardTitle>
              <CardDescription>
                {diagnosis.started_at ? (
                  <>Started: {format(new Date(diagnosis.started_at), "PPp")}</>
                ) : (
                  <>Not started yet</>
                )}
                {diagnosis.completed_at && (
                  <> • Completed: {format(new Date(diagnosis.completed_at), "PPp")}</>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Badge
                variant={
                  diagnosis.status === "completed"
                    ? "default"
                    : diagnosis.status === "on_hold"
                      ? "secondary"
                      : "default"
                }
              >
                {diagnosis.status_display || diagnosis.status}
              </Badge>
              <Link href={`/workorders/${workOrderId}/diagnosis`}>
                <Button variant="secondary" size="sm">
                  {diagnosis.is_completed ? (
                    <>
                      <Edit className="w-4 h-4 mr-2" />
                      View Details
                    </>
                  ) : (
                    <>
                      <Wrench className="w-4 h-4 mr-2" />
                      Continue Diagnosis
                    </>
                  )}
                </Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Customer Complaint */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">Customer Complaint</Label>
            <div className="p-3 bg-muted rounded-md border">
              <p className="text-sm whitespace-pre-wrap">{diagnosis.customer_complaint}</p>
            </div>
          </div>

          {/* Root Cause */}
          {diagnosis.root_cause && (
            <div>
              <Label className="text-sm font-semibold mb-2 block">Root Cause</Label>
              <div className="p-3 bg-primary/10 dark:bg-orange-900/20 rounded-md border border-orange-200 dark:border-orange-800">
                <p className="text-sm font-medium mb-1">{diagnosis.root_cause}</p>
                {diagnosis.root_cause_explanation && (
                  <p className="text-sm text-muted-foreground">
                    {diagnosis.root_cause_explanation}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Diagnostic Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 bg-muted rounded-md">
              <div className="flex items-center space-x-2 mb-1">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <Label className="text-xs text-muted-foreground">Diagnostic Time</Label>
              </div>
              <p className="text-sm font-semibold">
                {diagnosis.diagnostic_time_formatted || `${diagnosis.diagnostic_time_hours}h`}
              </p>
            </div>
            <div className="p-3 bg-muted rounded-md">
              <div className="flex items-center space-x-2 mb-1">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <Label className="text-xs text-muted-foreground">Diagnostic Fee</Label>
              </div>
              <p className="text-sm font-semibold">
                {formatCurrency(Number(diagnosis.diagnostic_fee || 0))}
              </p>
            </div>
            <div className="p-3 bg-muted rounded-md">
              <div className="flex items-center space-x-2 mb-1">
                <Wrench className="w-4 h-4 text-muted-foreground" />
                <Label className="text-xs text-muted-foreground">Recommendations</Label>
              </div>
              <p className="text-sm font-semibold">
                {diagnosis.repair_recommendations?.length || 0}
              </p>
            </div>
          </div>

          {/* Recommendations Summary */}
          {diagnosis.repair_recommendations && diagnosis.repair_recommendations.length > 0 && (
            <div>
              <Label className="text-sm font-semibold mb-3 block">Repair Recommendations</Label>
              <div className="space-y-2">
                {diagnosis.repair_recommendations.slice(0, 3).map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 bg-muted rounded-md border flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <Badge variant="secondary" className="text-xs">
                          {rec.priority_display || rec.priority}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {rec.recommendation_type_display || rec.recommendation_type}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{rec.description}</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm font-semibold">
                        {formatCurrency(Number(rec.estimated_total_cost || 0))}
                      </p>
                    </div>
                  </div>
                ))}
                {diagnosis.repair_recommendations.length > 3 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    +{diagnosis.repair_recommendations.length - 3} more recommendations
                  </p>
                )}
              </div>
              {diagnosis.total_estimated_cost && (
                <div className="mt-4 p-3 bg-primary/10 dark:bg-orange-900/20 rounded-md border border-orange-200 dark:border-orange-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Total Estimated Cost</span>
                    <span className="text-lg font-bold text-primary">
                      {formatCurrency(Number(diagnosis.total_estimated_cost))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

