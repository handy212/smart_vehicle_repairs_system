"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inspectionsApi, InspectionResult } from "@/lib/api/inspections";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle, Save, AlertCircle } from "lucide-react";
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

  useEffect(() => {
    if (categories.length && !activeTab) {
      setActiveTab(categories[0]?.id.toString());
    }
  }, [categories]);

  /* --------------------- Initialize Results -------------------- */
  useEffect(() => {
    if (!inspection?.results) return;

    const prefill: Record<number, Partial<InspectionResult>> = {};

    inspection.results.forEach((r) => {
      if (!r.inspection_item) return;
      prefill[r.inspection_item] = { ...r };
    });

    setResults(prefill);
  }, [inspection]);

  /* --------------------- Mutations ----------------------------- */
  const saveMutation = useMutation({
    mutationFn: (r: Partial<InspectionResult>[]) =>
      inspectionsApi.saveResults(inspectionId, r),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
      toast({ title: "Saved", description: "Results saved", variant: "success" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => inspectionsApi.complete(inspectionId),
    onSuccess: () => {
      toast({
        title: "Completed",
        description: "Inspection completed",
        variant: "success",
      });
      router.push(`/inspections/${inspectionId}`);
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
          r.measurement_value ||
          r.percentage_value ||
          r.rating_value ||
          r.condition ||
          r.text_note)
    );

  const save = () => {
    const payload = getFilledResults();
    if (!payload.length)
      return toast({
        title: "No results",
        description: "Enter at least one result",
      });
    saveMutation.mutate(payload);
  };

  const saveAndComplete = async () => {
    const payload = getFilledResults();
    if (!payload.length)
      return toast({
        title: "No results",
        description: "Enter at least one result",
      });

    await saveMutation.mutateAsync(payload);
    completeMutation.mutate();
  };

  /* --------------------- UI Render ----------------------------- */
  if (!inspection)
    return (
      <div className="flex justify-center p-20">
        <div className="animate-spin w-12 h-12 border-b-2 border-blue-600 rounded-full" />
      </div>
    );

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex gap-3 items-center">
          <Link href={`/inspections/${inspectionId}`}>
            <Button variant="outline" size="icon">
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
          <Button onClick={save} variant="outline">
            <Save className="mr-2" /> Save
          </Button>

          <Button onClick={saveAndComplete}>
            <CheckCircle className="mr-2" /> Save & Complete
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Vehicle</CardTitle>
          </CardHeader>
          <CardContent>
            {inspection.vehicle_info || "N/A"}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Template</CardTitle>
          </CardHeader>
          <CardContent>{templateData?.name}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full bg-gray-200 h-2 rounded">
              <div
                className="h-2 bg-blue-600 rounded"
                style={{ width: `${inspection.completion_percentage}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Categories */}
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
            </TabsList>
          </div>

          {categories.map((cat) => (
            <TabsContent key={cat.id} value={String(cat.id)} className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{cat.name}</CardTitle>
                </CardHeader>

                <CardContent>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {(cat.items || []).map((item) => {
                     const r = results[item.id] || {};

                    return (
                      <div
                        key={item.id}
                        className="border rounded-lg p-4 space-y-4 bg-white shadow-sm"
                      >
                        <h4 className="font-semibold flex items-center gap-2">
                          {item.name}
                          {item.is_critical && (
                            <Badge className="bg-red-200 text-red-700">
                              Critical
                            </Badge>
                          )}
                        </h4>

                        {/* Render type inputs */}
                        {item.item_type === "yes_no" ||
                        item.item_type === "pass_fail" ? (
                          <div className="flex gap-4">
                            {["Pass", "Fail", "Advisory", "Not Applicable"].map(
                              (opt) => (
                                <label key={opt} className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name={`i_${item.id}`}
                                    checked={r.result === opt}
                                    onChange={() =>
                                      updateResult(item.id, "result", opt)
                                    }
                                  />
                                  {opt}
                                </label>
                              )
                            )}
                          </div>
                        ) : null}

                        {item.item_type === "measurement" && (
                          <>
                            <Label>Value ({item.measurement_unit})</Label>
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
                            />
                          </>
                        )}

                        {item.item_type === "percentage" && (
                          <>
                            <Label>Percentage</Label>
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
                            />
                          </>
                        )}

                        {item.item_type === "rating" && (
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Button
                                key={n}
                                variant={r.rating_value === n ? "default" : "outline"}
                                onClick={() =>
                                  updateResult(item.id, "rating_value", n)
                                }
                              >
                                {n}
                              </Button>
                            ))}
                          </div>
                        )}

                        {item.item_type === "text" && (
                          <Textarea
                            value={r.text_note || ""}
                            onChange={(e) =>
                              updateResult(item.id, "text_note", e.target.value)
                            }
                          />
                        )}

                        <Textarea
                          placeholder="Additional notes"
                          value={r.notes || ""}
                          onChange={(e) =>
                            updateResult(item.id, "notes", e.target.value)
                          }
                        />

                        <label className="flex items-center gap-2">
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
                          />
                          Needs Immediate Attention
                        </label>
                      </div>
                    );
                  })}
                </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex justify-end gap-3">
        <Button onClick={save} variant="outline">
          <Save className="mr-2" />
          Save
        </Button>

        <Button onClick={saveAndComplete}>
          <CheckCircle className="mr-2" />
          Complete
        </Button>
      </div>
    </div>
  );
}
