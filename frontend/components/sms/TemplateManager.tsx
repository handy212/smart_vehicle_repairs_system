"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api/client";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Search,
  MessageSquare,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { AIAssistDialog } from "./AIAssistDialog";
import { useToast } from "@/lib/hooks/useToast";
import { useTheme } from "@/lib/hooks/useTheme";
import { cn } from "@/lib/utils/cn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Template {
  id: number;
  name: string;
  sms_body: string;
  template_type: string;
  channel: string;
  is_active: boolean;
  created_at: string;
}

const EMPTY_FORM = { name: "", sms_body: "" };
const MAX_CHARS = 320;
const SMS_SEGMENT = 160;

function charCount(body: string) {
  const len = body.length;
  const segments = len === 0 ? 0 : len > SMS_SEGMENT ? Math.ceil(len / 153) : 1;
  return { len, segments };
}

export function TemplateManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { theme: activeTheme } = useTheme();
  const isPerfex = activeTheme === "perfex";

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Template | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);

  // Always-on fetch — not gated by dialog state
  const { data: raw, isLoading } = useQuery({
    queryKey: ["sms-templates-manager"],
    queryFn: async () => {
      const res = await api.get("/notifications/templates/", {
        params: { channel: "sms", page_size: 500 },
      });
      return (res.data.results ?? res.data) as Template[];
    },
  });
  const templates = raw ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.sms_body.toLowerCase().includes(q)
    );
  }, [templates, search]);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; sms_body: string }) =>
      api.post("/notifications/templates/", {
        ...data,
        channel: "sms",
        template_type: "custom",
        body: data.sms_body,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["sms-templates-manager"] });
      queryClient.invalidateQueries({ queryKey: ["sms-templates"] });
      toast({ title: "Template created" });
      setIsNew(false);
      setSelected(res.data);
      setForm({ name: res.data.name, sms_body: res.data.sms_body });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.response?.data?.detail || err.response?.data?.name?.[0] || "Failed to create",
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; name: string; sms_body: string }) =>
      api.patch(`/notifications/templates/${data.id}/`, {
        name: data.name,
        sms_body: data.sms_body,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["sms-templates-manager"] });
      queryClient.invalidateQueries({ queryKey: ["sms-templates"] });
      toast({ title: "Template saved" });
      setSelected(res.data);
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.response?.data?.detail || "Failed to save",
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      api.delete(`/notifications/templates/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sms-templates-manager"] });
      queryClient.invalidateQueries({ queryKey: ["sms-templates"] });
      toast({ title: "Template deleted" });
      setDeleteTarget(null);
      setSelected(null);
      setForm(EMPTY_FORM);
      setIsNew(false);
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err.response?.data?.detail || "Failed to delete",
        variant: "destructive",
      }),
  });

  const handleSelect = (t: Template) => {
    setSelected(t);
    setForm({ name: t.name, sms_body: t.sms_body });
    setIsNew(false);
  };

  const handleNew = () => {
    setSelected(null);
    setForm(EMPTY_FORM);
    setIsNew(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.sms_body.trim()) {
      toast({
        title: "Missing fields",
        description: "Name and message body are required.",
        variant: "destructive",
      });
      return;
    }
    if (isNew) {
      createMutation.mutate(form);
    } else if (selected) {
      updateMutation.mutate({ id: selected.id, ...form });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const { len, segments } = charCount(form.sms_body);
  const isDirty =
    form.name !== (selected?.name ?? "") ||
    form.sms_body !== (selected?.sms_body ?? "");

  // Shared styles
  const cardCls = isPerfex
    ? "border border-border bg-card rounded-md shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]"
    : "border border-border rounded-xl bg-card";
  const headerCls = isPerfex
    ? "px-4 py-3 border-b border-border flex items-center justify-between"
    : "px-5 py-4 border-b border-border flex items-center justify-between";
  const titleCls = isPerfex
    ? "text-sm font-semibold text-foreground"
    : "text-sm font-semibold text-foreground";

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* LEFT — template list */}
        <div className={cn(cardCls, "flex flex-col overflow-hidden")}>
          <div className={headerCls}>
            <span className={titleCls}>Templates ({templates.length})</span>
            <Button
              size="sm"
              onClick={handleNew}
              className={cn("h-7 text-xs gap-1", isPerfex && "rounded")}
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          </div>

          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                className={cn(
                  "pl-8",
                  isPerfex ? "h-7 text-xs rounded" : "h-8 text-sm"
                )}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  {search ? "No matches" : "No templates yet"}
                </p>
                {!search && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Click &quot;New&quot; to create your first template
                  </p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((t) => {
                  const isActive =
                    (selected?.id === t.id && !isNew) ||
                    (!selected && !isNew && false);
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleSelect(t)}
                      className={cn(
                        "w-full text-left px-4 py-3 transition-colors hover:bg-muted/50",
                        isActive && "bg-muted"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            "font-medium truncate",
                            isPerfex ? "text-xs" : "text-sm"
                          )}
                        >
                          {t.name}
                        </span>
                        {!t.is_active && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p
                        className={cn(
                          "text-muted-foreground truncate mt-0.5",
                          isPerfex ? "text-[11px]" : "text-xs"
                        )}
                      >
                        {t.sms_body}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — form */}
        <div className={cn(cardCls, "lg:col-span-2 flex flex-col overflow-hidden")}>
          {!selected && !isNew ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-4" />
              <p className="text-sm font-medium text-muted-foreground">
                Select a template to edit, or create a new one
              </p>
            </div>
          ) : (
            <>
              <div className={headerCls}>
                <span className={titleCls}>
                  {isNew ? "New Template" : `Edit: ${selected?.name}`}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-primary hover:bg-primary/10"
                    onClick={() => setIsAIDialogOpen(true)}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    AI Assist
                  </Button>
                  {!isNew && selected && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(selected)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Delete
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving || (!isNew && !isDirty)}
                    className={cn("h-7 text-xs", isPerfex && "rounded")}
                  >
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                    )}
                    {isNew ? "Create" : "Save Changes"}
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="tpl-name"
                    className={isPerfex ? "text-xs font-semibold" : "text-sm font-medium"}
                  >
                    Template Name
                  </Label>
                  <Input
                    id="tpl-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Appointment Reminder"
                    className={isPerfex ? "h-8 text-sm rounded" : "h-9 text-sm"}
                    maxLength={200}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="tpl-body"
                      className={isPerfex ? "text-xs font-semibold" : "text-sm font-medium"}
                    >
                      Message Body
                    </Label>
                    <span
                      className={cn(
                        "tabular-nums",
                        isPerfex ? "text-[10px]" : "text-xs",
                        len > MAX_CHARS * 0.9
                          ? "text-warning font-semibold"
                          : "text-muted-foreground"
                      )}
                    >
                      {len} / {MAX_CHARS} chars · {segments} segment{segments !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <Textarea
                    id="tpl-body"
                    value={form.sms_body}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sms_body: e.target.value }))
                    }
                    placeholder="Type the SMS message content here. Use {customer_name}, {appointment_date}, etc. for variables."
                    className={cn(
                      "resize-none",
                      isPerfex ? "text-sm rounded min-h-[180px]" : "text-sm min-h-[200px]"
                    )}
                    maxLength={MAX_CHARS}
                  />
                  <div className={cn("text-muted-foreground space-y-1", isPerfex ? "text-[10px]" : "text-xs")}>
                    <p className="font-medium text-foreground">Available variables:</p>
                    <div className="flex flex-wrap gap-1">
                      {[
                        "{customer_name}", "{appointment_date}", "{appointment_time}",
                        "{appointment_number}", "{vehicle}", "{vehicle_display}",
                        "{service_description}", "{technician_name}",
                        "{invoice_number}", "{invoice_date}", "{total}",
                        "{due_date}", "{balance_due}", "{amount_paid}",
                        "{payment_method}", "{invoice_link}",
                        "{work_order_number}", "{days_until_due}", "{days_overdue}",
                        "{part_name}", "{part_number}", "{quantity}",
                        "{company_name}", "{company_phone}",
                      ].map((v) => (
                        <code
                          key={v}
                          className="bg-muted px-1 py-0.5 rounded text-[10px] cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
                          title="Click to insert"
                          onClick={() => setForm((f) => ({ ...f, sms_body: f.sms_body + v }))}
                        >
                          {v}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>

                {!isNew && selected && (
                  <div className={cn("rounded-md p-3 bg-muted/40 border border-border", isPerfex ? "text-[11px]" : "text-xs")}>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground">
                      <span>Type: <strong className="text-foreground">Custom SMS</strong></span>
                      <span>Status: <strong className={selected.is_active ? "text-success" : "text-muted-foreground"}>{selected.is_active ? "Active" : "Inactive"}</strong></span>
                      <span className="col-span-2">
                        Created: <strong className="text-foreground">{new Date(selected.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Delete Template
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <strong className="text-foreground">&quot;{deleteTarget?.name}&quot;</strong>? This
            cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AIAssistDialog
        open={isAIDialogOpen}
        onOpenChange={setIsAIDialogOpen}
        currentDraft={form.sms_body}
        mode="template"
        onUseSuggestion={(text) => setForm((f) => ({ ...f, sms_body: text }))}
      />
    </>
  );
}
