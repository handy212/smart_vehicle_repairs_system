"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { diagnosisApi, DiagnosticCode } from "@/lib/api/diagnosis";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useToast } from "@/lib/hooks/useToast";
import { Plus, Edit, Trash2, Search, X, AlertTriangle, Info, AlertCircle as AlertCircleIcon } from "lucide-react";
import { format } from "date-fns";

interface CodesTabProps {
  diagnosisId: number;
  onRefresh: () => void;
}

export function CodesTab({ diagnosisId, onRefresh }: CodesTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCode, setEditingCode] = useState<DiagnosticCode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["diagnosis-codes", diagnosisId],
    queryFn: () => diagnosisApi.codes.list({ diagnosis: diagnosisId }),
  });

  const filteredCodes = codes.filter((code) =>
    code.code_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    code.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const createMutation = useMutation({
    mutationFn: (data: Partial<DiagnosticCode>) => diagnosisApi.codes.create(diagnosisId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis-codes", diagnosisId] });
      onRefresh();
      setShowAddDialog(false);
      toast({ title: "Diagnostic code added", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add code",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DiagnosticCode> }) =>
      diagnosisApi.codes.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis-codes", diagnosisId] });
      onRefresh();
      setEditingCode(null);
      toast({ title: "Code updated", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update code",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => diagnosisApi.codes.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis-codes", diagnosisId] });
      onRefresh();
      toast({ title: "Code deleted", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete code",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case "warning":
        return <AlertCircleIcon className="w-4 h-4 text-yellow-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getSeverityVariant = (severity: string) => {
    switch (severity) {
      case "critical":
        return "destructive";
      case "warning":
        return "secondary";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Diagnostic Codes (DTCs)</CardTitle>
              <CardDescription>
                Manage diagnostic trouble codes pulled from the vehicle
              </CardDescription>
            </div>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Code
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search codes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Codes List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredCodes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Code className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No diagnostic codes yet. Add your first code to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCodes.map((code) => (
                <div
                  key={code.id}
                  className="p-4 border rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono font-bold text-lg">{code.code_number}</span>
                        <Badge variant={getSeverityVariant(code.severity)}>
                          {getSeverityIcon(code.severity)}
                          <span className="ml-1">{code.severity_display || code.severity}</span>
                        </Badge>
                        <Badge variant="outline">{code.code_type_display || code.code_type}</Badge>
                        <Badge variant={code.status === "resolved" ? "default" : "secondary"}>
                          {code.status_display || code.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">{code.description}</p>
                      {code.freeze_frame_data && Object.keys(code.freeze_frame_data).length > 0 && (
                        <details className="text-xs text-gray-500">
                          <summary className="cursor-pointer">Freeze Frame Data</summary>
                          <pre className="mt-2 p-2 bg-gray-50 rounded text-xs">
                            {JSON.stringify(code.freeze_frame_data, null, 2)}
                          </pre>
                        </details>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        Recorded: {format(new Date(code.recorded_at || code.created_at), "PPp")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingCode(code)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this code?")) {
                            deleteMutation.mutate(code.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <CodeDialog
        open={showAddDialog || editingCode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false);
            setEditingCode(null);
          }
        }}
        code={editingCode}
        onSave={(data) => {
          if (editingCode) {
            updateMutation.mutate({ id: editingCode.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

// Code Dialog Component
function CodeDialog({
  open,
  onOpenChange,
  code,
  onSave,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: DiagnosticCode | null;
  onSave: (data: Partial<DiagnosticCode>) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    code_number: code?.code_number || "",
    code_type: code?.code_type || "obd_ii",
    description: code?.description || "",
    severity: code?.severity || "warning",
    status: code?.status || "active",
    freeze_frame_data: code?.freeze_frame_data || {},
  });

  React.useEffect(() => {
    if (code) {
      setFormData({
        code_number: code.code_number || "",
        code_type: code.code_type || "obd_ii",
        description: code.description || "",
        severity: code.severity || "warning",
        status: code.status || "active",
        freeze_frame_data: code.freeze_frame_data || {},
      });
    } else {
      setFormData({
        code_number: "",
        code_type: "obd_ii",
        description: "",
        severity: "warning",
        status: "active",
        freeze_frame_data: {},
      });
    }
  }, [code]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      recorded_at: code?.recorded_at || new Date().toISOString(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogClose onOpenChange={onOpenChange} />
        <DialogHeader>
          <DialogTitle>{code ? "Edit Diagnostic Code" : "Add Diagnostic Code"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="code_number">Code Number *</Label>
                <Input
                  id="code_number"
                  value={formData.code_number}
                  onChange={(e) => setFormData({ ...formData, code_number: e.target.value })}
                  placeholder="e.g., P0301"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code_type">Code Type *</Label>
                <Select
                  id="code_type"
                  value={formData.code_type}
                  onChange={(e) => setFormData({ ...formData, code_type: e.target.value as any })}
                  required
                >
                  <option value="" disabled>
                    Select type
                  </option>
                  <option value="obd_ii">OBD-II</option>
                  <option value="manufacturer">Manufacturer</option>
                  <option value="abs">ABS</option>
                  <option value="airbag">Airbag</option>
                  <option value="transmission">Transmission</option>
                  <option value="body">Body</option>
                  <option value="chassis">Chassis</option>
                  <option value="other">Other</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what this code represents..."
                required
                rows={4}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="severity">Severity *</Label>
                <Select
                  id="severity"
                  value={formData.severity}
                  onChange={(e) => setFormData({ ...formData, severity: e.target.value as any })}
                  required
                >
                  <option value="" disabled>
                    Select severity
                  </option>
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Select
                  id="status"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  required
                >
                  <option value="" disabled>
                    Select status
                  </option>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="resolved">Resolved</option>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : code ? "Update Code" : "Add Code"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Import React for useEffect
import React from "react";
import { Code } from "lucide-react";

