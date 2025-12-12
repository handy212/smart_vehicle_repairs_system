"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inspectionsApi, InspectionResult } from "@/lib/api/inspections";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle, Save, AlertCircle, X } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { useState, useEffect } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SignaturePad } from "@/components/inspections/SignaturePad";
import { VehicleDamageMarker, DamageMark } from "@/components/inspections/VehicleDamageMarker";

export default function PerformInspectionPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const inspectionId = Number(params.id);

  /* --------------------- Data Queries ------------------------- */
  const { data: inspection } = useQuery({
    queryKey: ["inspection", inspectionId],
    queryFn: () => inspectionsApi.get(inspectionId),
  });

  const templateId =
    typeof inspection?.template === "object"
      ? inspection.template.id
      : inspection?.template;

  const { data: template } = useQuery({
    queryKey: ["template", templateId],
    queryFn: () => inspectionsApi.templates.get(templateId!),
    enabled: !!templateId,
  });

  const templateData =
    template ||
    (typeof inspection?.template === "object" ? inspection.template : null);

  const categories = templateData?.categories || [];

  /* --------------------- Local State -------------------------- */
  const [results, setResults] = useState<Record<
    number,
    Partial<InspectionResult>
  >>({});

  const [activeTab, setActiveTab] = useState("");
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [technicianSignature, setTechnicianSignature] = useState<string | null>(null);
  const [vehicleDamage, setVehicleDamage] = useState<DamageMark[]>([]);
  const [showNotes, setShowNotes] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (categories.length && !activeTab) {
      setActiveTab(categories[0]?.id.toString());
    }
  }, [categories]);

  /* --------------------- Initialize Results -------------------- */
  useEffect(() => {
    if (!inspection?.results) return;

    const prefill: Record<number, Partial<InspectionResult>> = {};
    const notesVisibility: Record<number, boolean> = {};

    inspection.results.forEach((r) => {
      if (!r.inspection_item) return;
      prefill[r.inspection_item] = { ...r };
      // Show notes field if notes exist OR if we already have it shown in state
      if (r.notes || showNotes[r.inspection_item]) {
        notesVisibility[r.inspection_item] = true;
      }
    });

    setResults((prev) => {
      // Merge with existing results to preserve unsaved changes
      const merged = { ...prefill };
      Object.keys(prev).forEach((key) => {
        const itemId = Number(key);
        if (merged[itemId]) {
          merged[itemId] = { ...merged[itemId], ...prev[itemId] };
        } else {
          merged[itemId] = prev[itemId];
        }
      });
      return merged;
    });
    
    // Only update showNotes if we're adding new ones, don't reset existing state
    setShowNotes((prev) => {
      const updated = { ...prev };
      if (inspection?.results) {
        inspection.results.forEach((r) => {
          if (r.inspection_item && (r.notes || updated[r.inspection_item])) {
            updated[r.inspection_item] = true;
          }
        });
      }
      return updated;
    });
  }, [inspection]);

  /* --------------------- Initialize Vehicle Damage -------------------- */
  useEffect(() => {
    if (inspection?.vehicle_damage && Array.isArray(inspection.vehicle_damage)) {
      setVehicleDamage(inspection.vehicle_damage as DamageMark[]);
    }
  }, [inspection]);

  /* --------------------- Mutations ----------------------------- */
  const saveMutation = useMutation({
    mutationFn: (r: Partial<InspectionResult>[]) =>
      inspectionsApi.saveResults(inspectionId, r),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to save results",
        variant: "destructive",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (data?: { technician_signature?: string }) => 
      inspectionsApi.complete(inspectionId, data),
    onSuccess: () => {
      toast({
        title: "Completed",
        description: "Inspection completed",
        variant: "success",
      });
      router.push(`/inspections/${inspectionId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to complete inspection",
        variant: "destructive",
      });
    },
  });

  /* --------------------- Helpers ------------------------------- */
  const updateResult = (itemId: number, field: string, value: any) => {
    setResults((p) => ({
      ...p,
      [itemId]: { ...p[itemId], inspection_item: itemId, [field]: value },
    }));
  };

  const getFilledResults = () =>
    Object.values(results).filter(
      (r) =>
        r.inspection_item &&
        (r.result ||
          r.measurement_value !== undefined ||
          r.percentage_value !== undefined ||
          r.rating_value !== undefined ||
          r.condition ||
          r.text_note ||
          r.notes ||
          r.needs_immediate_attention === true)
    );

  const saveDamageMutation = useMutation({
    mutationFn: async (damage: DamageMark[]) => {
      console.log("Saving vehicle damage:", damage);
      const result = await inspectionsApi.update(inspectionId, { vehicle_damage: damage });
      console.log("Vehicle damage saved successfully:", result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
    },
    onError: (error: any) => {
      console.error("Vehicle damage save error:", error);
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.vehicle_damage?.[0] || error.message || "Failed to save vehicle damage",
        variant: "destructive",
      });
    },
  });

  const hasDamageChanged = () => {
    const currentDamage = inspection?.vehicle_damage || [];
    if (currentDamage.length !== vehicleDamage.length) return true;
    
    // Create maps for easier comparison
    const currentMap = new Map((currentDamage as DamageMark[]).map(m => [m.id, m]));
    const newMap = new Map(vehicleDamage.map(m => [m.id, m]));
    
    // Check if any marks were added, removed, or changed
    if (currentMap.size !== newMap.size) return true;
    
    for (const [id, mark] of newMap) {
      const currentMark = currentMap.get(id);
      if (!currentMark) return true; // New mark added
      // Compare mark properties
      if (
        currentMark.type !== mark.type ||
        currentMark.severity !== mark.severity ||
        currentMark.x !== mark.x ||
        currentMark.y !== mark.y ||
        (currentMark.description || '') !== (mark.description || '')
      ) {
        return true;
      }
    }
    
    return false;
  };

  const save = async () => {
    const payload = getFilledResults();
    let hasChanges = false;
    const promises: Promise<any>[] = [];
    
    // Save inspection results if any
    if (payload.length > 0) {
      promises.push(saveMutation.mutateAsync(payload));
      hasChanges = true;
    }
    
    // Always save vehicle damage if there are any marks
    // This ensures vehicle damage saves regardless of change detection
    if (vehicleDamage.length > 0) {
      promises.push(saveDamageMutation.mutateAsync(vehicleDamage));
      hasChanges = true;
    } else {
      // Also save if we're clearing damage (had damage before but now empty)
      const hadDamageBefore = (inspection?.vehicle_damage || []).length > 0;
      if (hadDamageBefore) {
        promises.push(saveDamageMutation.mutateAsync([]));
        hasChanges = true;
      }
    }
    
    if (!hasChanges) {
      toast({
        title: "No Changes",
        description: "No results or damage to save",
        variant: "default",
      });
      return;
    }
    
    // Execute all saves
    try {
      await Promise.all(promises);
      toast({
        title: "Saved",
        description: "All changes saved successfully",
        variant: "success",
      });
    } catch (error: any) {
      console.error("Save error:", error);
      toast({
        title: "Error",
        description: error?.response?.data?.error || error?.message || "Failed to save changes",
        variant: "destructive",
      });
    }
  };

  const validateCriticalItems = () => {
    const allItems = categories.flatMap((cat) => cat.items || []);
    const criticalItems = allItems.filter((item) => item.is_critical);
    const filledResults = getFilledResults();
    const filledItemIds = new Set(filledResults.map((r) => r.inspection_item));

    const uncheckedCriticalItems = criticalItems.filter(
      (item) => !filledItemIds.has(item.id)
    );

    return uncheckedCriticalItems;
  };

  const saveAndComplete = async () => {
    const payload = getFilledResults();
    if (!payload.length) {
      return toast({
        title: "No results",
        description: "Enter at least one result",
        variant: "destructive",
      });
    }

    // Validate critical items
    const uncheckedCritical = validateCriticalItems();
    if (uncheckedCritical.length > 0) {
      toast({
        title: "Critical Items Not Checked",
        description: `Please check all critical items: ${uncheckedCritical.map((i) => i.name).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    // Save vehicle damage before completing
    saveDamageMutation.mutate(vehicleDamage);

    // Check if signature is required
    if (templateData?.requires_technician_signature) {
      setShowCompleteDialog(true);
      return;
    }

    await saveMutation.mutateAsync(payload);
    completeMutation.mutate({});
  };

  const handleCompleteWithSignature = async () => {
    if (templateData?.requires_technician_signature && !technicianSignature) {
      toast({
        title: "Signature Required",
        description: "Please provide your signature to complete the inspection",
        variant: "destructive",
      });
      return;
    }

    // Save vehicle damage before completing
    await saveDamageMutation.mutateAsync(vehicleDamage);

    const payload = getFilledResults();
    await saveMutation.mutateAsync(payload);
    completeMutation.mutate({
      technician_signature: technicianSignature || undefined,
    });
    setShowCompleteDialog(false);
    setTechnicianSignature(null);
  };

  /* --------------------- UI Render ----------------------------- */
  if (!inspection)
    return (
      <div className="flex justify-center p-20">
        <div className="animate-spin w-12 h-12 border-b-2 border-blue-600 rounded-full" />
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex gap-3 items-center">
          <Link href={`/inspections/${inspectionId}`}>
            <Buttonvariant="secondary" size="icon">
              <ArrowLeft />
            </Button>
          </Link>

          <div>
            <h1 className="text-2xl font-bold">
              Perform Inspection #{inspection.inspection_number}
            </h1>
            <p className="text-gray-500 text-sm">
              {templateData?.name} –{" "}
              {format(
                new Date(inspection.inspection_date),
                "MMMM dd, yyyy h:mm a"
              )}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={save}variant="secondary">
            <Save className="mr-2" /> Save
          </Button>

          <Button onClick={saveAndComplete}>
            <CheckCircle className="mr-2" /> Save & Complete
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500">Vehicle:</span>
          <span className="text-sm text-gray-900">{inspection.vehicle_info || "N/A"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500">Template:</span>
          <span className="text-sm text-gray-900">{templateData?.name}</span>
        </div>
        <div className="flex items-center gap-2 flex-1">
          <span className="text-sm font-medium text-gray-500">Progress:</span>
          <div className="flex-1 max-w-xs bg-gray-200 h-2 rounded">
            <div
              className="h-2 bg-blue-600 rounded transition-all"
              style={{ width: `${inspection.completion_percentage}%` }}
            />
          </div>
          <span className="text-sm text-gray-600">{inspection.completion_percentage}%</span>
        </div>
      </div>

      {/* Categories & Vehicle Damage */}
      <div className="w-full">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <div className="w-full overflow-x-auto -mx-4 px-4">
            <TabsList className="inline-flex w-max">
              {categories.map((cat) => (
                <TabsTrigger key={cat.id} value={String(cat.id)} className="whitespace-nowrap">
                  {cat.name} <Badge className="ml-2">{cat.item_count}</Badge>
                </TabsTrigger>
              ))}
              <TabsTrigger value="vehicle-damage" className="whitespace-nowrap">
                Vehicle Damage <Badge className="ml-2">{vehicleDamage.length}</Badge>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Vehicle Damage Tab */}
          <TabsContent value="vehicle-damage" className="mt-4">
            <VehicleDamageMarker
              damage={vehicleDamage}
              onChange={setVehicleDamage}
              disabled={inspection.status === "completed"}
            />
          </TabsContent>

          {categories.map((cat) => (
            <TabsContent key={cat.id} value={String(cat.id)} className="mt-4">
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900">{cat.name}</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {(cat.items || []).map((item) => {
                    const r = results[item.id] || {};
                    const isCritical = item.is_critical;
                    const isChecked = !!results[item.id]?.result || 
                                     results[item.id]?.measurement_value !== undefined ||
                                     results[item.id]?.percentage_value !== undefined ||
                                     results[item.id]?.rating_value !== undefined ||
                                     results[item.id]?.condition ||
                                     results[item.id]?.text_note;
                    
                    const rowClassName = `flex flex-col gap-2 p-3 rounded-md border ${
                      isCritical && !isChecked 
                        ? "border-red-500 bg-red-50" 
                        : isCritical 
                          ? "border-red-200 bg-red-50/30" 
                          : "border-gray-200 hover:bg-gray-50"
                    } transition-colors`;

                    return (
                      <div key={item.id} className={rowClassName}>
                        {/* Item Name */}
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-900">
                            {item.name}
                          </span>
                          {item.is_critical && (
                            <Badge className="bg-red-100 text-red-700 text-xs">
                              Critical
                            </Badge>
                          )}
                          {isCritical && !isChecked && (
                            <span className="text-xs text-red-600">
                              (Required)
                            </span>
                          )}
                        </div>
                          
                        {/* Input Fields - Inline */}
                        <div className="flex flex-col gap-2">
                            {item.item_type === "yes_no" || item.item_type === "pass_fail" ? (
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <Label className="text-sm whitespace-nowrap">Result:</Label>
                                  <select
                                    value={r.result || "not_checked"}
                                    onChange={(e) =>
                                      updateResult(item.id, "result", e.target.value)
                                    }
                                    className="w-40 h-8 text-sm rounded-md border border-gray-300 px-2"
                                  >
                                    <option value="not_checked">Not Checked</option>
                                    <option value="pass">Pass</option>
                                    <option value="fail">Fail</option>
                                    <option value="advisory">Advisory</option>
                                    <option value="not_applicable">N/A</option>
                                  </select>
                                </div>
                                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={showNotes[item.id] || false}
                                    onChange={(e) => {
                                      setShowNotes((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.checked,
                                      }));
                                      // Clear notes when hiding
                                      if (!e.target.checked) {
                                        updateResult(item.id, "notes", "");
                                      }
                                    }}
                                    className="w-4 h-4"
                                  />
                                  <span className="text-xs">Add Notes</span>
                                </label>
                              </div>
                            ) : null}

                            {item.item_type === "measurement" && (
                              <div className="flex items-center gap-2">
                                <Label className="text-sm whitespace-nowrap">
                                  Value ({item.measurement_unit}):
                                </Label>
                                <Input
                                  type="number"
                                  value={r.measurement_value || ""}
                                  onChange={(e) =>
                                    updateResult(
                                      item.id,
                                      "measurement_value",
                                      Number(e.target.value)
                                    )
                                  }
                                  className="w-32 h-8 text-sm"
                                />
                              </div>
                            )}

                            {item.item_type === "percentage" && (
                              <div className="flex items-center gap-2">
                                <Label className="text-sm whitespace-nowrap">Percentage:</Label>
                                <Input
                                  type="number"
                                  max={100}
                                  value={r.percentage_value || ""}
                                  onChange={(e) =>
                                    updateResult(
                                      item.id,
                                      "percentage_value",
                                      Number(e.target.value)
                                    )
                                  }
                                  className="w-24 h-8 text-sm"
                                />
                                <span className="text-sm text-gray-500">%</span>
                              </div>
                            )}

                            {item.item_type === "rating" && (
                              <div className="flex items-center gap-2">
                                <Label className="text-sm whitespace-nowrap">Rating:</Label>
                                <div className="flex gap-1">
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <button
                                      key={n}
                                      type="button"
                                      onClick={() =>
                                        updateResult(item.id, "rating_value", n)
                                      }
                                      className={`w-8 h-8 text-xs rounded border transition-colors ${
                                        r.rating_value === n
                                          ? "bg-blue-600 text-white border-blue-600"
                                          : "bg-white border-gray-300 hover:border-blue-400"
                                      }`}
                                    >
                                      {n}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {item.item_type === "condition" && (
                              <div className="flex items-center gap-2">
                                <Label className="text-sm whitespace-nowrap">Condition:</Label>
                                <select
                                  value={r.condition || ""}
                                  onChange={(e) =>
                                    updateResult(item.id, "condition", e.target.value || null)
                                  }
                                  className="w-40 h-8 text-sm rounded-md border border-gray-300 px-2"
                                >
                                  <option value="">Select...</option>
                                  <option value="excellent">Excellent</option>
                                  <option value="good">Good</option>
                                  <option value="fair">Fair</option>
                                  <option value="poor">Poor</option>
                                  <option value="critical">Critical</option>
                                </select>
                              </div>
                            )}

                            {item.item_type === "text" && (
                              <div className="w-full">
                                <Label className="text-sm">Note:</Label>
                                <Textarea
                                  value={r.text_note || ""}
                                  onChange={(e) =>
                                    updateResult(item.id, "text_note", e.target.value)
                                  }
                                  className="w-full text-sm min-h-[60px] mt-1"
                                  placeholder="Enter text note..."
                                />
                              </div>
                            )}

                            {/* Notes - Only show when checkbox is checked */}
                            {showNotes[item.id] && (
                              <div className="w-full">
                                <Textarea
                                  placeholder="Add notes..."
                                  value={r.notes || ""}
                                  onChange={(e) =>
                                    updateResult(item.id, "notes", e.target.value)
                                  }
                                  className="w-full text-sm min-h-[60px]"
                                />
                              </div>
                            )}

                            {/* Needs Attention Checkbox */}
                            <label className="flex items-center gap-1.5 text-sm cursor-pointer mt-1">
                              <input
                                type="checkbox"
                                checked={r.needs_immediate_attention || false}
                                onChange={(e) =>
                                  updateResult(
                                    item.id,
                                    "needs_immediate_attention",
                                    e.target.checked
                                  )
                                }
                                className="w-4 h-4"
                              />
                              <span className="text-xs">Needs Attention</span>
                            </label>
                          </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Completion Dialog with Signature */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Complete Inspection</DialogTitle>
            <DialogDescription>
              {templateData?.requires_technician_signature
                ? "Please provide your signature to complete this inspection"
                : "Are you sure you want to complete this inspection?"}
            </DialogDescription>
          </DialogHeader>

          {templateData?.requires_technician_signature && (
            <div className="py-4">
              <SignaturePad
                value={technicianSignature || undefined}
                onChange={setTechnicianSignature}
                label="Technician Signature"
                required
              />
            </div>
          )}

          <DialogFooter>
            <Button
             variant="secondary"
              onClick={() => {
                setShowCompleteDialog(false);
                setTechnicianSignature(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCompleteWithSignature}
              disabled={templateData?.requires_technician_signature && !technicianSignature}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Complete Inspection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
