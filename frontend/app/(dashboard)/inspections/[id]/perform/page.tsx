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
import { Card, CardContent } from "@/components/ui/card";
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
import { InspectionItemCard } from "@/components/inspections/InspectionItemCard";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

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
      const result = await inspectionsApi.update(inspectionId, { vehicle_damage: damage });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.vehicle_damage?.[0] || error.message || "Failed to save vehicle damage",
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
          result: (results[itemId]?.result as any) || 'not_checked'
        }]);

        targetResultId = response.results?.find((r: any) => r.inspection_item === itemId)?.id;
      }

      if (!targetResultId) throw new Error("Could not prepare result for photo upload");

      const formData = new FormData();
      formData.append("image", file);
      return inspectionsApi.results.addPhoto(targetResultId, formData);
    },
    onSuccess: () => {
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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );

  const uncheckedCriticalItems = validateCriticalItems();
  const hasUncheckedCritical = uncheckedCriticalItems.length > 0;

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center space-x-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            <Link href="/dashboard" className="hover:text-blue-600 transition-colors">Dashboard</Link>
            <span className="text-gray-300">/</span>
            <Link href="/inspections" className="hover:text-blue-600 transition-colors">Inspections</Link>
            <span className="text-gray-300">/</span>
            <Link href={`/inspections/${inspectionId}`} className="hover:text-blue-600 transition-colors">#{inspection.inspection_number}</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 dark:text-gray-100">Perform</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
            Perform Inspection
          </h1>
        </div>
      </div>

      {/* Summary Card */}
      <Card className="mb-8 border-none bg-gray-900 text-white overflow-hidden shadow-xl">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-white/10">
            <div className="p-6">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 block mb-1">Vehicle</span>
              <span className="text-sm font-bold truncate block">{inspection.vehicle_info || "N/A"}</span>
              <div className="flex items-center gap-2 mt-2">
                <Badge className="bg-white/10 text-white/80 hover:bg-white/20 border-none text-[10px]">
                  {typeof inspection.vehicle === 'object' ? inspection.vehicle.license_plate : 'N/A'}
                </Badge>
              </div>
            </div>
            <div className="p-6">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 block mb-1">Template</span>
              <span className="text-sm font-bold truncate block">{templateData?.name}</span>
              <span className="text-[10px] text-white/60 mt-2 block">{categories.length} Categories • {categories.reduce((acc, cat) => acc + (cat.item_count || 0), 0)} Items</span>
            </div>
            <div className="p-6 md:col-span-2 flex flex-col justify-center">
              <div className="flex justify-between items-end mb-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 block mb-1">Overall Progress</span>
                  <span className="text-2xl font-black text-blue-400">{inspection.completion_percentage}%</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 block mb-1">Checks Done</span>
                  <span className="text-sm font-bold text-white/80">{getFilledResults().length} / {categories.reduce((acc, cat) => acc + (cat.item_count || 0), 0)}</span>
                </div>
              </div>
              <Progress value={inspection.completion_percentage} className="h-2 bg-white/10" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Categories & Vehicle Damage */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full space-y-6"
      >
        <div className="sticky top-0 z-30 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800 -mx-6 px-6 py-2">
          <TabsList className="bg-transparent h-auto p-0 flex space-x-6 overflow-x-auto scrollbar-none">
            {categories.map((cat) => (
              <TabsTrigger
                key={cat.id}
                value={String(cat.id)}
                className="relative h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 font-bold text-xs uppercase tracking-widest transition-all px-0"
              >
                {cat.name}
                <Badge variant="secondary" className="ml-2 h-5 min-w-[20px] justify-center px-1 text-[10px]">
                  {cat.item_count}
                </Badge>
              </TabsTrigger>
            ))}
            <TabsTrigger
              value="vehicle-damage"
              className="relative h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 font-bold text-xs uppercase tracking-widest transition-all px-0"
            >
              Vehicle Damage
              <Badge variant="secondary" className="ml-2 h-5 min-w-[20px] justify-center px-1 text-[10px]">
                {vehicleDamage.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Vehicle Damage Tab */}
        <TabsContent value="vehicle-damage" className="mt-0">
          <Card className="border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <VehicleDamageMarker
                damage={vehicleDamage}
                onChange={setVehicleDamage}
                disabled={inspection.status === "completed"}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {categories.map((cat) => (
          <TabsContent key={cat.id} value={String(cat.id)} className="mt-0 outline-none">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(cat.items || []).map((item) => (
                <InspectionItemCard
                  key={item.id}
                  item={item}
                  result={results[item.id] || {}}
                  onUpdate={(field: string, value: any) => updateResult(item.id, field, value)}
                  onAddPhoto={(itemId, file, resultId) => {
                    addPhotoMutation.mutate({ itemId, file, resultId });
                  }}
                  onDeletePhoto={(photoId) => deletePhotoMutation.mutate(photoId)}
                  showNotes={showNotes[item.id] || false}
                  onToggleNotes={() => setShowNotes(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                  isCriticalRemaining={item.is_critical && !results[item.id]?.result}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-t border-gray-100 dark:border-gray-800 p-4 shadow-2xl transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="hidden sm:flex items-center gap-4">
            {hasUncheckedCritical ? (
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5 animate-pulse" />
                <span className="text-[11px] font-black uppercase tracking-tighter italic">
                  Critical items pending: {uncheckedCriticalItems.length}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600">
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
              className="flex-1 sm:flex-none h-12 px-8 text-xs font-black uppercase tracking-widest border-2 hover:bg-gray-50 transition-all active:scale-95"
              disabled={saveMutation.isPending || saveDamageMutation.isPending}
            >
              {saveMutation.isPending || saveDamageMutation.isPending ? (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
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
                hasUncheckedCritical ? "bg-gray-400 hover:bg-gray-500" : "bg-blue-600 hover:bg-blue-700"
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
        <DialogContent className="max-w-xl p-0 border-none overflow-hidden shadow-2xl">
          <div className="bg-gray-900 p-8 text-white relative">
            <button
              onClick={() => setShowCompleteDialog(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-600 rounded-lg">
                <CheckCircle className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black tracking-tight">Complete Inspection</h2>
            </div>
            <p className="text-gray-400 text-sm">
              You are about to finalize this inspection report. Once completed, it will be ready for review and transmission to the customer.
            </p>
          </div>

          <div className="p-8 space-y-6">
            {templateData?.requires_technician_signature && (
              <div className="space-y-4">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Technician Authentication</Label>
                <div className="border-2 border-dashed border-gray-200 rounded-xl overflow-hidden bg-gray-50 group hover:border-blue-400 transition-colors">
                  <SignaturePad
                    value={technicianSignature || undefined}
                    onChange={setTechnicianSignature}
                    label=""
                    required
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                className="flex-1 h-12 text-xs font-bold uppercase tracking-widest border-2"
                onClick={() => {
                  setShowCompleteDialog(false);
                  setTechnicianSignature(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-[2] h-12 text-xs font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 shadow-lg"
                onClick={handleCompleteWithSignature}
                disabled={templateData?.requires_technician_signature && !technicianSignature}
              >
                Sign & Finalize Report
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
