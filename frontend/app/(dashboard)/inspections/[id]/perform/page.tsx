"use client";

import { useParams, useRouter, usePathname } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inspectionsApi, InspectionResult } from "@/lib/api/inspections";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { CheckCircle, Save, AlertCircle, X, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SignaturePad } from "@/components/inspections/SignaturePad";
import { VehicleDamageMarker, DamageMark } from "@/components/inspections/VehicleDamageMarker";
import { InspectionItemRow } from "@/components/inspections/InspectionItemRow";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getUserFacingError } from "@/lib/api/errors";

type InspectionResultUpdateValue = InspectionResult[keyof InspectionResult] | undefined | null;

export default function PerformInspectionPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const inspectionId = Number(params.id);
  const isMobileApp = pathname.startsWith("/mobile/");
  const inspectionsListPath = isMobileApp ? "/mobile/inspections" : "/inspections";
  const inspectionDetailPath = isMobileApp
    ? `/mobile/inspections/${inspectionId}`
    : `/inspections/${inspectionId}`;
  const dashboardPath = isMobileApp ? "/mobile/dashboard" : "/dashboard";

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

  const categories = useMemo(() => templateData?.categories || [], [templateData]);
  const allowsPhotos = templateData?.allows_photos !== false;

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(categories[0]?.id.toString());
    }
  }, [categories, activeTab]);

  /* --------------------- Initialize Results -------------------- */
  useEffect(() => {
    if (!inspection?.results) return;

    const prefill: Record<number, Partial<InspectionResult>> = {};

    inspection.results.forEach((r) => {
      if (!r.inspection_item) return;
      prefill[r.inspection_item] = { ...r };
    });

    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      inspection.results?.forEach((r) => {
        if (r.inspection_item && (r.notes || updated[r.inspection_item])) {
          updated[r.inspection_item] = true;
        }
      });
      return updated;
    });
  }, [inspection]);

  /* --------------------- Initialize Vehicle Damage -------------------- */
  useEffect(() => {
    if (inspection?.vehicle_damage && Array.isArray(inspection.vehicle_damage)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to save results"),
        variant: "destructive",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (data?: { technician_signature?: string }) =>
      inspectionsApi.complete(inspectionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
      queryClient.invalidateQueries({ queryKey: ["inspections"] });

      // Auto-triggering the AI Summary generation so it is there when they land
      const generateSilentSummary = async () => {
        try {
          await inspectionsApi.generateSummary(inspectionId);
        } catch (e) {
          console.error("Failed to auto-generate AI summary", e);
        }
      }
      generateSilentSummary();

      toast({
        title: "Completed & Analyzed",
        description: "Inspection completed. AI is generating the vehicle health report...",
        variant: "success",
      });
      router.push(inspectionDetailPath);
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to complete inspection"),
        variant: "destructive",
      });
    },
  });

  /* --------------------- Helpers ------------------------------- */

  const updateResult = (itemId: number, field: string, value: InspectionResultUpdateValue) => {
    setResults((p) => ({
      ...p,
      [itemId]: {
        ...(p[itemId] as Record<string, InspectionResultUpdateValue>),
        inspection_item: itemId,
        [field]: value,
      },
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
      const result = await inspectionsApi.update(inspectionId, { vehicle_damage: damage });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to save vehicle damage"),
        variant: "destructive",
      });
    },
  });

  const addPhotoMutation = useMutation({
    mutationFn: async ({ itemId, file, resultId }: { itemId: number, file: File, resultId?: number }) => {
      let targetResultId = resultId;

      if (!targetResultId) {
        // Create result first
        const response = await inspectionsApi.saveResults(inspectionId, [{
          inspection_item: itemId,
          result: results[itemId]?.result || 'not_checked'
        }]);


        targetResultId = response.results?.find((result) => result.inspection_item === itemId)?.id;
      }

      if (!targetResultId) throw new Error("Could not prepare result for photo upload");

      const formData = new FormData();
      formData.append("image", file);
      return inspectionsApi.results.addPhoto(targetResultId, formData);
    },
    onSuccess: async (data, variables) => {
      // Update local results state with the new photo
      setResults((prev) => {
        const itemId = variables.itemId;
        const currentResult = prev[itemId] || {};
        const currentPhotos = currentResult.photos || [];
        return {
          ...prev,
          [itemId]: {
            ...currentResult,
            photos: [...currentPhotos, data],
          },
        };
      });
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
      toast({ title: "Photo added", variant: "success" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to upload photo", variant: "destructive" });
    }
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (photoId: number) => {
      return inspectionsApi.photos.delete(photoId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
      toast({ title: "Photo removed" });
    }
  });

  const save = async () => {
    const payload = getFilledResults();
    let hasChanges = false;

    const promises: Promise<unknown>[] = [];

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

    } catch (error: unknown) {
      console.error("Save error:", error);
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to save changes"),
        variant: "destructive",
      });
    }
  };

  const isCheckedResult = (result?: Partial<InspectionResult>) => {
    if (!result) return false;
    if (result.result && result.result !== "not_checked") return true;
    return (
      result.measurement_value !== undefined ||
      result.percentage_value !== undefined ||
      result.rating_value !== undefined ||
      !!result.condition ||
      !!result.text_note
    );
  };

  const checkedResultCount = () => {
    const allItems = categories.flatMap((cat) => cat.items || []);
    return allItems.filter((item) => isCheckedResult(results[item.id])).length;
  };

  const validateCriticalItems = () => {
    const allItems = categories.flatMap((cat) => cat.items || []);
    const criticalItems = allItems.filter((item) => item.is_critical);

    const uncheckedCriticalItems = criticalItems.filter(
      (item) => !isCheckedResult(results[item.id])
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
    await saveDamageMutation.mutateAsync(vehicleDamage);

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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  const uncheckedCriticalItems = validateCriticalItems();
  const hasUncheckedCritical = uncheckedCriticalItems.length > 0;

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          {isMobileApp ? (
            <Link
              href={inspectionDetailPath}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to inspection
            </Link>
          ) : (
            <div className="flex items-center space-x-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
              <Link href={dashboardPath} className="hover:text-primary transition-colors">Dashboard</Link>
              <span className="text-muted-foreground">/</span>
              <Link href={inspectionsListPath} className="hover:text-primary transition-colors">Inspections</Link>
              <span className="text-muted-foreground">/</span>
              <Link href={inspectionDetailPath} className="hover:text-primary transition-colors">#{inspection.inspection_number}</Link>
              <span className="text-muted-foreground">/</span>
              <span className="text-foreground">Perform</span>
            </div>
          )}
          <h1 className="text-2xl font-black text-foreground tracking-tight">
            Perform Inspection
          </h1>
        </div>
      </div>

      {/* Summary Card - Compact */}
      <div className="mb-6 bg-card border rounded-lg p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Vehicle</span>
            <span className="text-sm font-semibold text-foreground truncate block">{inspection.vehicle_info || "N/A"}</span>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {typeof inspection.vehicle === 'object' ? inspection.vehicle.license_plate : 'N/A'}
              </Badge>
            </div>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Template</span>
            <span className="text-sm font-semibold text-foreground truncate block">{templateData?.name}</span>
            <span className="text-[10px] text-muted-foreground mt-1.5 block">{categories.length} Categories • {categories.reduce((acc, cat) => acc + (cat.item_count || 0), 0)} Items</span>
          </div>
          <div className="md:col-span-2">
            <div className="flex justify-between items-end mb-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Overall Progress</span>
                <span className="text-2xl font-bold text-primary">{inspection.completion_percentage}%</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Checks Done</span>
                <span className="text-sm font-semibold text-foreground">{checkedResultCount()} / {categories.reduce((acc, cat) => acc + (cat.item_count || 0), 0)}</span>
              </div>
            </div>
            <Progress value={inspection.completion_percentage} className="h-1.5 bg-muted" />
          </div>
        </div>
      </div>

      {/* Categories & Vehicle Damage - Subnav Style */}
      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <div className="w-64 flex-shrink-0">
          <div className="sticky top-4 bg-card border rounded-lg p-2 shadow-sm">
            <div className="space-y-1">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(String(cat.id))}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    activeTab === String(cat.id)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <span>{cat.name}</span>
                  <Badge variant="secondary" className="h-5 min-w-[20px] justify-center px-1.5 text-[10px]">
                    {cat.item_count}
                  </Badge>
                </button>
              ))}
              <button
                onClick={() => setActiveTab("vehicle-damage")}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  activeTab === "vehicle-damage"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <span>Vehicle Damage</span>
                <Badge variant="secondary" className="h-5 min-w-[20px] justify-center px-1.5 text-[10px]">
                  {vehicleDamage.length}
                </Badge>
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {/* Vehicle Damage */}
          {activeTab === "vehicle-damage" && (
            <Card className="border-border shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <VehicleDamageMarker
                  damage={vehicleDamage}
                  onChange={setVehicleDamage}
                  disabled={inspection.status === "completed"}
                />
              </CardContent>
            </Card>
          )}

          {/* Category Content */}
          {categories.map((cat) => (
            activeTab === String(cat.id) && (
              <div key={cat.id} className="space-y-1 bg-card rounded-lg border overflow-hidden">
                {(cat.items || []).map((item, index) => (
                  <InspectionItemRow
                    key={item.id}
                    item={item}
                    result={results[item.id] || {}}

                    onUpdate={(field: string, value: InspectionResultUpdateValue) => updateResult(item.id, field, value)}
                    onAddPhoto={(itemId: number, file: File, resultId?: number) => {
                      addPhotoMutation.mutate({ itemId, file, resultId });
                    }}
                    onDeletePhoto={(photoId: number) => deletePhotoMutation.mutate(photoId)}
                    showNotes={showNotes[item.id] || false}
                    onToggleNotes={() => setShowNotes(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                    isCriticalRemaining={item.is_critical && !results[item.id]?.result}
                    isLast={index === (cat.items || []).length - 1}
                    allowPhotos={allowsPhotos}
                  />
                ))}
              </div>
            )
          ))}
        </div>
      </div>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 z-30 bg-background/80 backdrop-blur-md border-t p-4 shadow-2xl transition-all duration-300">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="hidden sm:flex items-center gap-4">
            {hasUncheckedCritical ? (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-5 h-5 animate-pulse" />
                <span className="text-[11px] font-black uppercase tracking-tighter italic">
                  Critical items pending: {uncheckedCriticalItems.length}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="w-5 h-5" />
                <span className="text-[11px] font-black uppercase tracking-tighter">All critical checks completed</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              size="lg"
              onClick={save}
              className="flex-1 sm:flex-none h-12 px-8 text-xs font-black uppercase tracking-widest border-2 hover:bg-muted transition-all active:scale-95"
              disabled={saveMutation.isPending || saveDamageMutation.isPending}
            >
              {saveMutation.isPending || saveDamageMutation.isPending ? (
                <div className="w-4 h-4 border-2 border-border border-t-gray-600 rounded-full animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Progress
            </Button>
            <Button
              size="lg"
              onClick={saveAndComplete}
              className={cn(
                "flex-1 sm:flex-none h-12 px-10 text-xs font-black uppercase tracking-widest shadow-lg transition-all active:scale-95",
                hasUncheckedCritical ? "bg-muted text-muted-foreground" : ""
              )}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Finalize & Complete
            </Button>
          </div>
        </div>
      </div>

      {/* Completion Dialog with Signature */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg max-h-[calc(100dvh-1rem)] p-0 sm:w-full sm:max-h-[calc(100dvh-2rem)]">
          <DialogHeader className="flex-shrink-0 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <DialogTitle className="text-lg font-semibold">Complete Inspection</DialogTitle>
              </div>
              <button
                onClick={() => {
                  setShowCompleteDialog(false);
                  setTechnicianSignature(null);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors rounded-sm p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <DialogDescription className="text-sm mt-2">
              Finalize this inspection report. Once completed, it will be ready for review.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5 space-y-3">
            {/* Inspection Summary - Compact */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-muted rounded-md">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Progress</p>
                <p className="text-base font-semibold">{inspection.completion_percentage}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Items Checked</p>
                <p className="text-base font-semibold">
                  {checkedResultCount()} / {categories.reduce((acc, cat) => acc + (cat.item_count || 0), 0)}
                </p>
              </div>
            </div>

            {/* Signature Section */}
            {templateData?.requires_technician_signature && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Technician Signature
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  {technicianSignature && (
                    <Badge variant="outline" className="text-xs">
                      Signed
                    </Badge>
                  )}
                </div>
                <div className="border-2 border-dashed rounded-md overflow-hidden bg-muted/50">
                  <SignaturePad
                    value={technicianSignature || undefined}
                    onChange={setTechnicianSignature}
                    label=""
                    required
                    height={140}
                    showPreview={false}
                  />
                </div>
                {!technicianSignature && (
                  <p className="text-xs text-muted-foreground">
                    Please provide your signature to complete the inspection
                  </p>
                )}
              </div>
            )}

            {/* Warning for unchecked critical items */}
            {hasUncheckedCritical && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-destructive mb-0.5">
                    Critical Items Pending
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {uncheckedCriticalItems.length} critical item{uncheckedCriticalItems.length !== 1 ? 's' : ''} still need to be checked.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <DialogFooter className="flex-row flex-shrink-0 gap-2 border-t bg-card px-4 py-3 sm:px-5 sm:py-4 sm:gap-3">
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setShowCompleteDialog(false);
                setTechnicianSignature(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              onClick={handleCompleteWithSignature}
              disabled={
                (templateData?.requires_technician_signature && !technicianSignature) ||
                hasUncheckedCritical ||
                completeMutation.isPending
              }
            >
              {completeMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  Finalizing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {templateData?.requires_technician_signature ? "Sign & Complete" : "Complete"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
