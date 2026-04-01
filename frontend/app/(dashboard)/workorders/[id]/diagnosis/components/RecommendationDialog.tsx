"use client";

import React, { useState } from "react";
import { Package, Plus, Trash2 } from "lucide-react";

import { DiagnosisFinding } from "@/lib/api/diagnosis";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

type PartLine = {
  part_name: string;
  part_number?: string;
  quantity: number;
};

type RecommendationDialogRecommendation = {
  recommendation_type?: "repair" | "replace" | "service" | "adjust" | "clean" | "inspect";
  description?: string;
  priority?: "critical" | "necessary" | "recommended" | "advisory";
  parts_needed?: Array<{
    part_name?: string;
    part_number?: string;
    quantity?: number | string;
  }>;
  linked_findings?: Array<{ id: number }>;
};

type FormData = {
  recommendation_type: "repair" | "replace" | "service" | "adjust" | "clean" | "inspect";
  description: string;
  priority: "critical" | "necessary" | "recommended" | "advisory";
  parts_needed: PartLine[];
  findings: number[];
};

interface RecommendationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    recommendation_type: FormData["recommendation_type"];
    description: string;
    priority: FormData["priority"];
    parts_needed: PartLine[];
    findings: number[];
  }) => void;
  recommendation?: RecommendationDialogRecommendation;
  findings?: DiagnosisFinding[];
  isLoading: boolean;
}

const emptyPartLine = (): PartLine => ({
  part_name: "",
  part_number: "",
  quantity: 1,
});

const buildFormData = (recommendation?: RecommendationDialogRecommendation): FormData => {
  if (!recommendation) {
    return {
      recommendation_type: "repair",
      description: "",
      priority: "necessary",
      parts_needed: [emptyPartLine()],
      findings: [],
    };
  }

  const existingParts = Array.isArray(recommendation.parts_needed) && recommendation.parts_needed.length > 0
    ? recommendation.parts_needed.map((part) => ({
        part_name: part.part_name || "",
        part_number: part.part_number || "",
        quantity: Number(part.quantity || 1),
      }))
    : [emptyPartLine()];

  return {
    recommendation_type: recommendation.recommendation_type || "repair",
    description: recommendation.description || "",
    priority: recommendation.priority || "necessary",
    parts_needed: existingParts,
    findings: Array.isArray(recommendation.linked_findings) ? recommendation.linked_findings.map((finding) => finding.id) : [],
  };
};

export function RecommendationDialog({
  open,
  onOpenChange,
  onSave,
  recommendation,
  findings = [],
  isLoading,
}: RecommendationDialogProps) {
  const [formData, setFormData] = useState<FormData>(() => buildFormData(recommendation));
  const recommendationTypes: Array<FormData["recommendation_type"]> = ["repair", "replace", "service", "adjust", "clean", "inspect"];
  const priorityOptions: Array<FormData["priority"]> = ["critical", "necessary", "recommended", "advisory"];

  const updatePartLine = (index: number, field: keyof PartLine, value: string) => {
    setFormData((prev) => ({
      ...prev,
      parts_needed: prev.parts_needed.map((part, currentIndex) => {
        if (currentIndex !== index) {
          return part;
        }

        if (field === "quantity") {
          const quantity = Number(value || "1");
          return { ...part, quantity: Number.isNaN(quantity) || quantity < 1 ? 1 : quantity };
        }

        return { ...part, [field]: value };
      }),
    }));
  };

  const addPartLine = () => {
    setFormData((prev) => ({
      ...prev,
      parts_needed: [...prev.parts_needed, emptyPartLine()],
    }));
  };

  const removePartLine = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      parts_needed: prev.parts_needed.length === 1
        ? [emptyPartLine()]
        : prev.parts_needed.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const toggleFinding = (findingId: number, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      findings: checked
        ? [...prev.findings, findingId]
        : prev.findings.filter((id) => id !== findingId),
    }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const normalizedParts = formData.parts_needed
      .map((part) => ({
        part_name: part.part_name.trim(),
        part_number: (part.part_number || "").trim(),
        quantity: Number(part.quantity || 1),
      }))
      .filter((part) => part.part_name);

    onSave({
      recommendation_type: formData.recommendation_type,
      description: formData.description.trim(),
      priority: formData.priority,
      parts_needed: normalizedParts,
      findings: formData.findings,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-base font-semibold">
            {recommendation ? "Edit Recommendation" : "Add Recommendation"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Capture the work needed now. Pricing happens later when stores prepares the quotation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="space-y-4 px-5 py-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="recommendation_type" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Type
                </Label>
                <Select
                  value={formData.recommendation_type}
                  onValueChange={(value: FormData["recommendation_type"]) => setFormData((prev) => ({ ...prev, recommendation_type: value }))}
                >
                  <SelectTrigger id="recommendation_type" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {recommendationTypes.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="priority" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Priority
                </Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: FormData["priority"]) => setFormData((prev) => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger id="priority" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recommendation
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Describe the repair or service the customer should approve."
                className="min-h-[100px] resize-none"
                required
              />
            </div>

            <div className="rounded-lg border bg-muted/30">
              <div className="border-b px-4 py-3">
                <p className="text-sm font-medium">Supporting Findings</p>
                <p className="text-xs text-muted-foreground">
                  Link this recommendation to the diagnostic finding that explains why the work is needed.
                </p>
              </div>
              <div className="space-y-2 p-4">
                {findings.length > 0 ? (
                  findings.map((finding) => {
                    const codeSummary = Array.isArray(finding.diagnostic_codes) && finding.diagnostic_codes.length > 0
                      ? finding.diagnostic_codes.map((code) => code.code_number).join(", ")
                      : "";

                    return (
                      <label key={finding.id} className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3">
                        <Checkbox
                          checked={formData.findings.includes(finding.id)}
                          onCheckedChange={(checked) => toggleFinding(finding.id, checked === true)}
                          className="mt-0.5"
                        />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">{finding.finding_title}</p>
                          <p className="text-xs text-muted-foreground">
                            {finding.severity_display || finding.severity} • {finding.category_display || finding.category}
                          </p>
                          {codeSummary && (
                            <p className="text-xs text-muted-foreground">
                              Codes: {codeSummary}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No structured findings have been recorded for this diagnosis yet.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Parts Needed</p>
                    <p className="text-xs text-muted-foreground">Attach the parts stores should quote for this recommendation.</p>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={addPartLine}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Part
                </Button>
              </div>

              <div className="space-y-2 p-4">
                {formData.parts_needed.map((part, index) => (
                  <div key={`${index}-${part.part_name}`} className="grid gap-2 rounded-md border bg-background p-3 md:grid-cols-[1.5fr_1fr_90px_44px]">
                    <Input
                      value={part.part_name}
                      onChange={(event) => updatePartLine(index, "part_name", event.target.value)}
                      placeholder="Part name"
                      className="h-9"
                    />
                    <Input
                      value={part.part_number || ""}
                      onChange={(event) => updatePartLine(index, "part_number", event.target.value)}
                      placeholder="Part number"
                      className="h-9"
                    />
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={part.quantity}
                      onChange={(event) => updatePartLine(index, "quantity", event.target.value)}
                      placeholder="Qty"
                      className="h-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground"
                      onClick={() => removePartLine(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-5 py-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : recommendation ? "Update Recommendation" : "Save Recommendation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
