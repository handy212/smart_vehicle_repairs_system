"use client";

import { useState } from "react";
import React from "react";
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
import { Plus, Edit, Trash2, Search, X, AlertTriangle, Info, AlertCircle as AlertCircleIcon, Code } from "lucide-react";
import { format } from "date-fns";

interface CodesTabProps {
  diagnosisId: number;
  onRefresh: () => void;
  isDisabled?: boolean;
}

export function CodesTab({ diagnosisId, onRefresh, isDisabled = false }: CodesTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCode, setEditingCode] = useState<DiagnosticCode | null>(null);

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["diagnosis-codes", diagnosisId],
    queryFn: () => diagnosisApi.codes.list({ diagnosis: diagnosisId }),
  });

  // Helper to check if a code already exists
  const codeExists = (codeNumber: string, codeType: string) => {
    if (!codeNumber || !codeType) return false;
    const normalizedCode = codeNumber.trim().toUpperCase();
    return codes.some(
      (code) =>
        code.code_number.toUpperCase() === normalizedCode &&
        code.code_type === codeType
    );
  };

  const createMutation = useMutation({
    mutationFn: (data: Partial<DiagnosticCode>) => diagnosisApi.codes.create(diagnosisId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis-codes", diagnosisId] });
      onRefresh();
      setShowAddDialog(false);
      toast({ title: "Diagnostic code added", variant: "default" });
    },
    onError: (error: any) => {
      // Handle duplicate code error specifically
      const errorMessage = error.response?.data;
      let errorTitle = "Failed to add code";
      let errorDescription = error.response?.data?.message || error.message;
      
      if (error.response?.status === 400) {
        // Check for duplicate code error
        if (errorMessage?.code_number) {
          errorTitle = "Duplicate code";
          errorDescription = Array.isArray(errorMessage.code_number) 
            ? errorMessage.code_number[0] 
            : errorMessage.code_number;
        } else if (errorMessage?.non_field_errors) {
          errorTitle = "Validation error";
          errorDescription = Array.isArray(errorMessage.non_field_errors)
            ? errorMessage.non_field_errors[0]
            : errorMessage.non_field_errors;
        }
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
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

  const getSeverityVariant = (severity: string): "default" | "success" | "warning" | "info" | "secondary" | "danger" => {
    switch (severity) {
      case "critical":
        return "danger";
      case "warning":
        return "warning";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg">Diagnostic Codes</CardTitle>
          <Button onClick={() => setShowAddDialog(true)} size="sm" disabled={isDisabled}>
            <Plus className="w-4 h-4 mr-2" />
            Add Code
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : codes.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Code className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No diagnostic codes yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {codes.map((code) => (
                <div
                  key={code.id}
                  className="p-3 border rounded-lg hover:shadow-sm transition-shadow space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono font-bold text-base">{code.code_number}</span>
                        <Badge variant={getSeverityVariant(code.severity)} className="text-xs">
                          {getSeverityIcon(code.severity)}
                          <span className="ml-1">{code.severity_display || code.severity}</span>
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700 line-clamp-2 mb-2">{code.description}</p>
                      {code.recorded_at && (
                        <p className="text-xs text-gray-500">
                          Recorded: {format(new Date(code.recorded_at), "MMM d, yyyy h:mm a")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setEditingCode(code)}
                        disabled={isDisabled}
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          if (confirm("Delete this code?")) {
                            deleteMutation.mutate(code.id);
                          }
                        }}
                        disabled={isDisabled}
                      >
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      {code.code_type_display || code.code_type}
                    </Badge>
                    <Badge variant={code.status === "resolved" ? "default" : "secondary"} className="text-xs">
                      {code.status_display || code.status}
                    </Badge>
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
        existingCodes={codes}
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
  existingCodes = [],
  onSave,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: DiagnosticCode | null;
  existingCodes?: DiagnosticCode[];
  onSave: (data: Partial<DiagnosticCode>) => void;
  isLoading: boolean;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    code_number: code?.code_number || "",
    code_type: code?.code_type || "obd_ii",
    description: code?.description || "",
    severity: code?.severity || "warning",
    status: code?.status || "active",
    freeze_frame_data: code?.freeze_frame_data || {},
  });
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [libraryResults, setLibraryResults] = useState<any[]>([]);
  const [isSearchingLibrary, setIsSearchingLibrary] = useState(false);

  // Search library when code number changes
  React.useEffect(() => {
    const trimmedCode = formData.code_number.trim().toUpperCase();
    if (open && !code && trimmedCode.length >= 3) {
      const searchTimer = setTimeout(async () => {
        setIsSearchingLibrary(true);
        try {
          const results = await diagnosisApi.codeLibrary.search(
            trimmedCode,
            formData.code_type
          );
          setLibraryResults(results.slice(0, 5)); // Show top 5 results
        } catch (error: any) {
          // Silent fail for autocomplete search - library search is optional
          // Only show errors for non-404 cases (network issues, etc.)
          if (error.response?.status && error.response?.status !== 404) {
            console.warn("Code library search error:", error);
          }
          setLibraryResults([]);
        } finally {
          setIsSearchingLibrary(false);
        }
      }, 500); // Debounce 500ms

      return () => clearTimeout(searchTimer);
    } else {
      setLibraryResults([]);
    }
  }, [formData.code_number, formData.code_type, open, code]);

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
      setLibraryResults([]);
    } else {
      setFormData({
        code_number: "",
        code_type: "obd_ii",
        description: "",
        severity: "warning",
        status: "active",
        freeze_frame_data: {},
      });
      setLibraryResults([]);
    }
  }, [code]);

  const handleLookupCode = async () => {
    // Trim the code number to remove any trailing/leading spaces
    const trimmedCodeNumber = formData.code_number.trim();
    
    if (!trimmedCodeNumber || !formData.code_type) {
      toast({
        title: "Missing information",
        description: "Please enter code number and select code type",
        variant: "destructive",
      });
      return;
    }

    setIsSearchingLibrary(true);
    try {
      const libraryCode = await diagnosisApi.codeLibrary.lookup(trimmedCodeNumber, formData.code_type);
      if (libraryCode) {
        setFormData({
          ...formData,
          description: libraryCode.description || libraryCode.title || formData.description,
          severity: libraryCode.severity || formData.severity,
        });
        toast({
          title: "Code found in library",
          description: `Loaded description for ${libraryCode.code_number}`,
          variant: "default",
        });
      }
    } catch (error: any) {
      // Handle different error cases
      if (error.response?.status === 404) {
        // Code not found in library - this is okay, user can enter manually
        toast({
          title: "Code not in library",
          description: `${formData.code_number} not found. You can enter details manually.`,
          variant: "default",
        });
      } else {
        // Other errors (network, server, etc.)
        toast({
          title: "Library lookup failed",
          description: error.response?.data?.error || error.message || "Could not search code library",
          variant: "destructive",
        });
      }
    } finally {
      setIsSearchingLibrary(false);
    }
  };

  const handleSelectLibraryCode = (libraryCode: any) => {
    setFormData({
      code_number: libraryCode.code_number,
      code_type: libraryCode.code_type,
      description: libraryCode.description || libraryCode.title,
      severity: libraryCode.severity || "warning",
      status: formData.status,
      freeze_frame_data: formData.freeze_frame_data,
    });
    setLibraryResults([]);
    toast({
      title: "Code loaded from library",
      description: `${libraryCode.code_number} - ${libraryCode.title}`,
      variant: "default",
    });
  };

  // Check if code already exists (excluding current code if editing)
  const isDuplicate = React.useMemo(() => {
    if (!formData.code_number || !formData.code_type) return false;
    const normalizedCode = formData.code_number.trim().toUpperCase();
    return existingCodes.some(
      (existingCode) =>
        existingCode.id !== code?.id && // Exclude current code if editing
        existingCode.code_number.toUpperCase() === normalizedCode &&
        existingCode.code_type === formData.code_type
    );
  }, [formData.code_number, formData.code_type, existingCodes, code]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isDuplicate) {
      toast({
        title: "Duplicate code detected",
        description: `Code ${formData.code_number} (${formData.code_type}) already exists for this diagnosis.`,
        variant: "destructive",
      });
      return;
    }
    
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
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      id="code_number"
                      value={formData.code_number}
                      onChange={(e) => {
                        // Remove spaces and convert to uppercase
                        const cleanValue = e.target.value.replace(/\s+/g, '').toUpperCase();
                        setFormData({ ...formData, code_number: cleanValue });
                      }}
                      placeholder="e.g., P0301"
                      required
                      className={isDuplicate ? "border-red-500 focus:ring-red-500" : ""}
                    />
                    {isDuplicate && (
                      <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        This code already exists for this diagnosis
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLookupCode}
                    disabled={!formData.code_number || isSearchingLibrary}
                    title="Lookup code in library (210+ codes available)"
                    className="shrink-0"
                  >
                    {isSearchingLibrary ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-1" />
                        <span className="text-xs">Lookup</span>
                      </>
                    )}
                  </Button>
                </div>
                {libraryResults.length > 0 && (
                  <div className="mt-2 border border-blue-200 rounded-lg bg-blue-50/50 max-h-48 overflow-y-auto shadow-sm">
                    <div className="p-2 text-xs font-medium text-blue-800 border-b border-blue-200 bg-blue-100/50">
                      {libraryResults.length} matching code{libraryResults.length !== 1 ? 's' : ''} found:
                    </div>
                    {libraryResults.map((libCode: any) => (
                      <button
                        key={libCode.id}
                        type="button"
                        onClick={() => handleSelectLibraryCode(libCode)}
                        className="w-full text-left p-3 hover:bg-blue-100 border-b border-blue-200 last:border-b-0 transition-colors group"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <div className="font-mono font-semibold text-sm text-blue-900 group-hover:text-blue-700">
                              {libCode.code_number}
                            </div>
                            <div className="text-xs text-gray-700 mt-0.5 line-clamp-1 font-medium">
                              {libCode.title || libCode.description}
                            </div>
                            {libCode.common_causes && Array.isArray(libCode.common_causes) && libCode.common_causes.length > 0 && (
                              <div className="text-xs text-gray-600 mt-1">
                                💡 Common: {libCode.common_causes[0]}
                              </div>
                            )}
                          </div>
                          <div className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Search className="w-4 h-4" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {formData.code_number && formData.code_number.length >= 3 && libraryResults.length === 0 && !isSearchingLibrary && (
                  <div className="mt-2 text-xs text-gray-500">
                    💡 Tip: Code not in library? You can enter details manually or try a different code type.
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="code_type">Code Type *</Label>
                <Select
                  id="code_type"
                  value={formData.code_type}
                  onChange={(e) => {
                    setFormData({ ...formData, code_type: e.target.value as any });
                    setLibraryResults([]); // Clear results when type changes
                  }}
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
            <Button type="submit" disabled={isLoading || isDuplicate}>
              {isLoading ? "Saving..." : code ? "Update Code" : "Add Code"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


