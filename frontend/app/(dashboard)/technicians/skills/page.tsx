"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { skillsApi } from "@/lib/api/technicians";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Award, Edit, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

interface Skill {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
}

type SkillForm = {
  name: string;
  description: string;
  is_active: boolean;
};

function getApiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { detail?: string; error?: string; name?: string[] } } })?.response?.data;
  return data?.detail || data?.error || data?.name?.[0] || fallback;
}

const emptyForm: SkillForm = {
  name: "",
  description: "",
  is_active: true,
};

export default function SkillsManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [formData, setFormData] = useState<SkillForm>(emptyForm);

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ["skills"],
    queryFn: () => skillsApi.list(),
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingSkill(null);
    setFormData(emptyForm);
  };

  const createMutation = useMutation({
    mutationFn: (data: SkillForm) => skillsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      toast({ title: "Saved", description: "Skill created" });
      closeDialog();
    },
    onError: (error: unknown) => {
      toast({ title: "Error", description: getApiErrorMessage(error, "Failed to create skill"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: SkillForm }) => skillsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      toast({ title: "Saved", description: "Skill updated" });
      closeDialog();
    },
    onError: (error: unknown) => {
      toast({ title: "Error", description: getApiErrorMessage(error, "Failed to update skill"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => skillsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      toast({ title: "Deleted", description: "Skill removed" });
    },
    onError: (error: unknown) => {
      toast({ title: "Error", description: getApiErrorMessage(error, "Failed to delete skill"), variant: "destructive" });
    },
  });

  const openDialog = (skill?: Skill) => {
    setEditingSkill(skill || null);
    setFormData(skill ? {
      name: skill.name,
      description: skill.description || "",
      is_active: skill.is_active,
    } : emptyForm);
    setIsDialogOpen(true);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (editingSkill) {
      updateMutation.mutate({ id: editingSkill.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (skill: Skill) => {
    if (confirm(`Delete "${skill.name}"?`)) {
      deleteMutation.mutate(skill.id);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/technicians" className="hover:text-primary">Technicians</Link>
            <span>/</span>
            <span className="text-foreground">Skills</span>
          </div>
          <h1 className="text-lg font-semibold text-foreground">Skills</h1>
        </div>
        <PermissionGuard permission="manage_settings">
          <Button size="sm" onClick={() => openDialog()} className="h-8">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Skill
          </Button>
        </PermissionGuard>
      </div>

      <div className="p-4">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="grid grid-cols-[1fr_110px_74px] border-b border-border bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <div>Skill</div>
            <div>Status</div>
            <div className="text-right">Actions</div>
          </div>
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading skills...</div>
          ) : skills.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Award className="mx-auto mb-2 h-5 w-5" />
              No skills yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {skills.map((skill) => (
                <div key={skill.id} className="grid grid-cols-[1fr_110px_74px] items-center gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{skill.name}</div>
                    {skill.description ? (
                      <div className="truncate text-xs text-muted-foreground">{skill.description}</div>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">{skill.is_active ? "Active" : "Inactive"}</div>
                  <div className="flex justify-end gap-1">
                    <PermissionGuard permission="manage_settings">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDialog(skill)} title="Edit">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => handleDelete(skill)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </PermissionGuard>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? setIsDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingSkill ? "Edit Skill" : "Add Skill"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="skill-name" className="text-xs">Name</Label>
                <Input id="skill-name" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} required className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="skill-description" className="text-xs">Description</Label>
                <Textarea id="skill-description" value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} rows={3} />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <Label htmlFor="skill-active" className="text-xs">Active</Label>
                <Switch id="skill-active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createMutation.isPending || updateMutation.isPending || !formData.name.trim()}>
                {editingSkill ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
