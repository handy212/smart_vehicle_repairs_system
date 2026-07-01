"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Edit, Plus, Tags, Trash2 } from "lucide-react";
import {
  jobTypesApi,
  workflowProfilesApi,
  type JobType,
} from "@/lib/api/job-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

const CATEGORY_OPTIONS = [
  { value: "repair", label: "Repair" },
  { value: "maintenance", label: "Maintenance" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "inspection", label: "Inspection" },
  { value: "body", label: "Body & Paint" },
  { value: "commercial", label: "Warranty / Insurance" },
  { value: "installation", label: "Installation" },
];

type JobTypeForm = {
  code: string;
  name: string;
  category: string;
  description: string;
  workflow_profile: number | "";
  is_active: boolean;
  sort_order: number;
  allows_bundle: boolean;
  requires_inspection: boolean;
  requires_diagnosis: boolean;
  requires_approval: boolean;
  quality_check_required: boolean;
  sets_warranty_flag: boolean;
  sets_insurance_flag: boolean;
};

const emptyForm: JobTypeForm = {
  code: "",
  name: "",
  category: "repair",
  description: "",
  workflow_profile: "",
  is_active: true,
  sort_order: 100,
  allows_bundle: false,
  requires_inspection: true,
  requires_diagnosis: true,
  requires_approval: true,
  quality_check_required: true,
  sets_warranty_flag: false,
  sets_insurance_flag: false,
};

export default function JobTypesAdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<JobType | null>(null);
  const [form, setForm] = useState<JobTypeForm>(emptyForm);

  const { data: jobTypesData, isLoading } = useQuery({
    queryKey: ["workorders", "job-types", "admin"],
    queryFn: () => jobTypesApi.list({ active_only: false }),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["workorders", "workflow-profiles"],
    queryFn: () => workflowProfilesApi.list(),
  });

  const jobTypes = jobTypesData?.results ?? [];

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const openDialog = (jobType?: JobType) => {
    if (jobType) {
      setEditing(jobType);
      setForm({
        code: jobType.code,
        name: jobType.name,
        category: jobType.category,
        description: jobType.description || "",
        workflow_profile: jobType.workflow_profile?.id ?? "",
        is_active: jobType.is_active,
        sort_order: jobType.sort_order,
        allows_bundle: jobType.allows_bundle,
        requires_inspection: jobType.requires_inspection,
        requires_diagnosis: jobType.requires_diagnosis,
        requires_approval: jobType.requires_approval,
        quality_check_required: jobType.quality_check_required,
        sets_warranty_flag: jobType.sets_warranty_flag,
        sets_insurance_flag: jobType.sets_insurance_flag,
      });
    } else {
      setEditing(null);
      setForm(emptyForm);
    }
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        workflow_profile: Number(form.workflow_profile),
        sort_order: Number(form.sort_order) || 0,
      };
      if (editing) {
        return jobTypesApi.update(editing.code, payload);
      }
      return jobTypesApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorders", "job-types"] });
      queryClient.invalidateQueries({ queryKey: ["workorders", "job-types", "admin"] });
      toast({ title: "Saved", description: editing ? "Job type updated" : "Job type created" });
      closeDialog();
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Could not save job type"),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (code: string) => jobTypesApi.remove(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorders", "job-types"] });
      queryClient.invalidateQueries({ queryKey: ["workorders", "job-types", "admin"] });
      toast({ title: "Removed", description: "Job type deactivated or deleted" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Could not remove job type"),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.workflow_profile) {
      toast({ title: "Workflow profile required", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/admin/settings" className="hover:text-primary">
              Settings
            </Link>
            <span>/</span>
            <span className="text-foreground">Job Types</span>
          </div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Tags className="h-5 w-5" />
            Job Types
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage work order job types and their workflow profiles.
          </p>
        </div>
        <PermissionGuard permission="manage_workorders">
          <Button size="sm" onClick={() => openDialog()}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Job Type
          </Button>
        </PermissionGuard>
      </div>

      <div className="p-4">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="grid grid-cols-[1.2fr_1fr_120px_90px_74px] border-b border-border bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <div>Job Type</div>
            <div>Workflow Profile</div>
            <div>Category</div>
            <div>Status</div>
            <div className="text-right">Actions</div>
          </div>
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading job types...</div>
          ) : jobTypes.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No job types found.</div>
          ) : (
            jobTypes.map((jt) => (
              <div
                key={jt.code}
                className="grid grid-cols-[1.2fr_1fr_120px_90px_74px] items-center border-b border-border px-3 py-3 text-sm last:border-b-0"
              >
                <div>
                  <div className="font-medium">{jt.name}</div>
                  <div className="text-xs text-muted-foreground">{jt.code}</div>
                </div>
                <div className="text-muted-foreground">{jt.workflow_profile?.name ?? "—"}</div>
                <div>
                  <Badge variant="outline" className="text-[10px]">
                    {jt.category_display || jt.category}
                  </Badge>
                </div>
                <div>{jt.is_active ? "Active" : "Inactive"}</div>
                <div className="flex justify-end gap-1">
                  <PermissionGuard permission="manage_workorders">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDialog(jt)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => {
                        if (confirm(`Remove "${jt.name}"?`)) deleteMutation.mutate(jt.code);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </PermissionGuard>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Job Type" : "Add Job Type"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="jt-name">Name</Label>
                <Input
                  id="jt-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="jt-code">Code</Label>
                <Input
                  id="jt-code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  required
                  disabled={Boolean(editing)}
                />
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Workflow profile</Label>
              <Select
                value={form.workflow_profile ? String(form.workflow_profile) : ""}
                onValueChange={(v) => setForm((f) => ({ ...f, workflow_profile: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select profile" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="jt-desc">Description</Label>
              <Textarea
                id="jt-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["allows_bundle", "Allows service bundle"],
                ["requires_inspection", "Requires inspection"],
                ["requires_diagnosis", "Requires diagnosis"],
                ["requires_approval", "Requires approval"],
                ["quality_check_required", "Quality check required"],
                ["sets_warranty_flag", "Sets warranty flag"],
                ["sets_insurance_flag", "Sets insurance flag"],
                ["is_active", "Active"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5">
                  <span>{label}</span>
                  <Switch
                    checked={Boolean(form[key as keyof JobTypeForm])}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, [key]: checked }))
                    }
                  />
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
