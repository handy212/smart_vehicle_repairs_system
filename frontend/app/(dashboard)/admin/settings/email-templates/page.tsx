"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, NotificationTemplate as NotificationTemplateType } from "@/lib/api/notifications";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Search, Mail, Edit2, Eye, X, Copy, Sparkles, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useRef, useCallback } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

function getApiErrorMessage(error: unknown, fallback: string) {
  const data = (error as {
    response?: {
      data?: {
        detail?: string;
        error?: string;
        non_field_errors?: string[];
        name?: string[];
        subject?: string[];
        body?: string[];
        template_type?: string[];
        channel?: string[];
      };
    };
  })?.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.non_field_errors) && data.non_field_errors[0]) return data.non_field_errors[0];
  return (
    data.error ||
    data.name?.[0] ||
    data.template_type?.[0] ||
    data.channel?.[0] ||
    data.subject?.[0] ||
    data.body?.[0] ||
    fallback
  );
}

export default function EmailTemplatesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission(["manage_notification_templates", "manage_email_templates"]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [channelFilter] = useState<string>("email");
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplateType | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<NotificationTemplateType | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<NotificationTemplateType | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<Partial<NotificationTemplateType>>({});
  const [activeTab, setActiveTab] = useState<"plain" | "html">("plain");
  const [previewTab, setPreviewTab] = useState<string>("plain");
  const [previewRendered, setPreviewRendered] = useState<{
    subject: string;
    body: string;
    html_body: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [draftPreview, setDraftPreview] = useState<{
    subject: string;
    body: string;
    html_body: string;
    unresolved_variables?: string[];
  } | null>(null);
  const [draftPreviewLoading, setDraftPreviewLoading] = useState(false);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: variableHintsData } = useQuery({
    queryKey: ["template-variable-hints", editForm.template_type],
    queryFn: () =>
      notificationsApi.templates.variableHints(editForm.template_type || "custom"),
    enabled: Boolean(creatingTemplate || editingTemplate) && Boolean(editForm.template_type),
  });

  const variableHintsList = variableHintsData?.variables?.length
    ? variableHintsData.variables
    : ["{customer_name}", "{company_name}", "{currency_symbol}", "{total_display}"];

  const { data, isLoading, error } = useQuery({
    queryKey: ["notification-templates", typeFilter, channelFilter],
    queryFn: () => notificationsApi.templates.list({
      template_type: typeFilter !== "all" ? typeFilter : undefined,
      channel: channelFilter || undefined,
    }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<NotificationTemplateType>) =>
      notificationsApi.templates.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
      setCreatingTemplate(false);
      setEditForm({});
      toast({
        title: "Success",
        description: "Template created successfully",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getApiErrorMessage(error, "Failed to create template"),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<NotificationTemplateType> }) =>
      notificationsApi.templates.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
      setEditingTemplate(null);
      setEditForm({});
      toast({
        title: "Success",
        description: "Template updated successfully",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getApiErrorMessage(error, "Failed to update template"),
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      notificationsApi.templates.update(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
      toast({
        title: "Success",
        description: "Template status updated",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getApiErrorMessage(error, "Failed to update template"),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.templates.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
      setDeletingTemplate(null);
      toast({
        title: "Success",
        description: "Template deleted successfully",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getApiErrorMessage(error, "Failed to delete template"),
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    setDraftPreview(null);
    setCreatingTemplate(true);
    setEditForm({
      name: "",
      template_type: "",
      channel: "email",
      subject: "",
      body: "",
      html_body: "",
      is_active: true,
    });
    setActiveTab("plain");
  };

  const handleEdit = (template: NotificationTemplateType) => {
    setDraftPreview(null);
    setEditingTemplate(template);
    setEditForm({
      name: template.name || "",
      template_type: template.template_type || "",
      channel: template.channel || "email",
      subject: template.subject || "",
      body: template.body || "",
      html_body: template.html_body || "",
      is_active: template.is_active,
    });
    setActiveTab("plain");
  };

  const handlePreview = async (template: NotificationTemplateType) => {
    setPreviewTemplate(template);
    setPreviewTab(template.html_body ? "html" : "plain");
    setPreviewRendered(null);
    setPreviewLoading(true);
    try {
      const rendered = await notificationsApi.templates.preview(template.id);
      setPreviewRendered(rendered);
      setPreviewTab(rendered.html_body ? "html" : "plain");
    } catch (error: unknown) {
      toast({
        title: "Preview failed",
        description: getApiErrorMessage(error, "Could not render template preview"),
        variant: "destructive",
      });
      setPreviewRendered({
        subject: template.subject || "",
        body: template.body || "",
        html_body: template.html_body || "",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSave = () => {
    if (creatingTemplate) {
      createMutation.mutate({
        ...editForm,
        channel: editForm.channel || "email",
        is_active: editForm.is_active ?? true,
      });
    } else if (editingTemplate) {
      const { name, subject, body, html_body, is_active } = editForm;
      updateMutation.mutate({
        id: editingTemplate.id,
        data: { name, subject, body, html_body, is_active },
      });
    }
  };

  const canSave =
    Boolean(editForm.name?.trim()) &&
    Boolean(editForm.subject?.trim()) &&
    Boolean(editForm.body?.trim()) &&
    (creatingTemplate ? Boolean(editForm.template_type) : true);

  const handleToggleActive = (template: NotificationTemplateType) => {
    toggleActiveMutation.mutate({
      id: template.id,
      is_active: !template.is_active,
    });
  };

  const handleDelete = (template: NotificationTemplateType) => {
    setDeletingTemplate(template);
  };

  const confirmDelete = () => {
    if (deletingTemplate) {
      deleteMutation.mutate(deletingTemplate.id);
    }
  };


  const templates: NotificationTemplateType[] = data && "results" in data ? data.results : Array.isArray(data) ? data : [];
  const filteredTemplates = templates.filter((template: NotificationTemplateType) => {
    if (search) {
      const searchLower = search.toLowerCase();
      const nameMatch = template.name?.toLowerCase().includes(searchLower) || false;
      const subjectMatch = template.subject?.toLowerCase().includes(searchLower) || false;
      const bodyMatch = template.body?.toLowerCase().includes(searchLower) || false;
      if (!nameMatch && !subjectMatch && !bodyMatch) {
        return false;
      }
    }
    return true;
  });

  const insertVariable = useCallback(
    (variable: string) => {
      const ref = activeTab === "html" ? htmlTextareaRef : bodyTextareaRef;
      const field = activeTab === "html" ? "html_body" : "body";
      const current = (editForm[field] as string) || "";
      const el = ref.current;
      if (el) {
        const start = el.selectionStart ?? current.length;
        const end = el.selectionEnd ?? current.length;
        const next = current.slice(0, start) + variable + current.slice(end);
        setEditForm((prev) => ({ ...prev, [field]: next }));
        requestAnimationFrame(() => {
          el.focus();
          const pos = start + variable.length;
          el.setSelectionRange(pos, pos);
        });
      } else {
        setEditForm((prev) => ({ ...prev, [field]: current + variable }));
      }
      toast({ title: "Inserted", description: variable, duration: 800 });
    },
    [activeTab, editForm, toast]
  );

  const handleDraftPreview = async () => {
    if (!editingTemplate) {
      toast({
        title: "Save first",
        description: "Create the template, then use preview to test variables.",
        variant: "destructive",
      });
      return;
    }
    setDraftPreviewLoading(true);
    try {
      const rendered = await notificationsApi.templates.preview(editingTemplate.id, {
        subject: editForm.subject,
        body: editForm.body,
        html_body: editForm.html_body,
      });
      setDraftPreview(rendered);
      if (rendered.unresolved_variables?.length) {
        toast({
          title: "Unresolved variables",
          description: rendered.unresolved_variables.map((v) => `{${v}}`).join(", "),
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      toast({
        title: "Preview failed",
        description: getApiErrorMessage(error, "Could not render preview"),
        variant: "destructive",
      });
    } finally {
      setDraftPreviewLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-destructive font-medium">Failed to load email templates</p>
        <p className="text-xs text-muted-foreground mt-1">
          {getApiErrorMessage(error, "Check your permissions or try again.")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-background min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/admin/settings" className="hover:text-primary transition-colors">Settings</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Templates</span>
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Email Templates</h1>
        </div>
        <PermissionGuard permissions={["manage_notification_templates", "manage_email_templates"]}>
          <Button onClick={handleCreate} size="sm" className="bg-primary hover:bg-primary/90 text-white dark:bg-primary dark:hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Create Template
          </Button>
        </PermissionGuard>
      </div>

      {/* Filters */}
      <Card className="mx-4 border-none shadow-sm bg-muted/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
              <Input
                type="text"
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm bg-card"
              />
            </div>

            <Select
              value={typeFilter}
              onValueChange={(val) => setTypeFilter(val)}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs bg-card">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="invoice_generated">Invoice Generated</SelectItem>
                <SelectItem value="invoice_due">Invoice Due</SelectItem>
                <SelectItem value="invoice_overdue">Invoice Overdue</SelectItem>
                <SelectItem value="payment_received">Payment Received</SelectItem>
                <SelectItem value="appointment_reminder">Appointment Reminder</SelectItem>
                <SelectItem value="appointment_confirmation">Appointment Confirmation</SelectItem>
                <SelectItem value="appointment_cancelled">Appointment Cancelled</SelectItem>
                <SelectItem value="work_order_created">Work Order Created</SelectItem>
                <SelectItem value="work_order_completed">Work Order Completed</SelectItem>
                <SelectItem value="work_order_approved">Work Order Approved</SelectItem>
                <SelectItem value="inspection_completed">Inspection Completed</SelectItem>
                <SelectItem value="inspection_approved">Inspection Approved</SelectItem>
                <SelectItem value="inspection_rejected">Inspection Rejected</SelectItem>
                <SelectItem value="inspection_sent_to_customer">Inspection Sent to Customer</SelectItem>
                <SelectItem value="vehicle_ready">Vehicle Ready</SelectItem>
                <SelectItem value="parts_arrived">Parts Arrived</SelectItem>
                <SelectItem value="estimate_sent">Estimate Sent</SelectItem>
                <SelectItem value="estimate_approved">Estimate Approved</SelectItem>
                <SelectItem value="estimate_declined">Estimate Declined</SelectItem>
                <SelectItem value="low_stock_alert">Low Stock Alert</SelectItem>
                <SelectItem value="service_due">Service Due</SelectItem>
                <SelectItem value="user_welcome">User Welcome</SelectItem>
                <SelectItem value="password_reset">Password Reset</SelectItem>
                <SelectItem value="password_reset_link">Password Reset Link</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

            {(search || typeFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setTypeFilter("all");
                }}
                className="h-8 px-2 text-xs"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Templates */}
      <div className="px-4 pb-8">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="grid grid-cols-[1fr_190px_86px_120px_96px] border-b border-border bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <div>Template</div>
            <div>Type</div>
            <div>Status</div>
            <div>Updated</div>
            <div className="text-right">Actions</div>
          </div>
          <div className="divide-y divide-border">
        {filteredTemplates.map((template: NotificationTemplateType) => (
          <div key={template.id} className="grid grid-cols-[1fr_190px_86px_120px_96px] items-center gap-3 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground" title={template.name}>
                {template.name || "Unnamed Template"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {template.subject || "No subject"}
              </div>
            </div>
            <div className="truncate text-xs text-muted-foreground">{template.template_type.replace(/_/g, " ")}</div>
            <div className="flex items-center gap-2">
              <Switch
                checked={template.is_active}
                onCheckedChange={() => handleToggleActive(template)}
                disabled={toggleActiveMutation.isPending || !canManage}
                className="scale-75 data-[state=checked]:bg-success"
              />
              <span className="text-xs text-muted-foreground">{template.is_active ? "Active" : "Off"}</span>
            </div>
            <div className="text-xs text-muted-foreground">{format(new Date(template.updated_at), "MMM d, yyyy")}</div>
            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="icon" onClick={() => handlePreview(template)} className="h-7 w-7" title="Preview">
                <Eye className="w-3.5 h-3.5" />
              </Button>
              <PermissionGuard permissions={["manage_notification_templates", "manage_email_templates"]}>
                <Button variant="ghost" size="icon" onClick={() => handleEdit(template)} className="h-7 w-7" title="Edit">
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(template)} className="h-7 w-7 hover:text-destructive" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </PermissionGuard>
            </div>
          </div>
        ))}
          </div>
        </div>
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12 px-4">
          <div className="w-12 h-12 bg-border rounded-full flex items-center justify-center mx-auto mb-3">
            <Mail className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">No templates found</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {search || typeFilter !== "all" ? "Try adjusting your filters" : "Create a new template to get started"}
          </p>
        </div>
      )}

      {/* Create/Edit Dialog */}
      {(creatingTemplate || editingTemplate) && (
        <Dialog
          open={creatingTemplate || !!editingTemplate}
          onOpenChange={(open) => !open && (creatingTemplate ? setCreatingTemplate(false) : setEditingTemplate(null))}
        >
          <DialogContent className="max-w-[min(96vw,1280px)] w-full h-[min(96vh,920px)] max-h-[96vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-6 py-3 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${creatingTemplate ? 'bg-success/15 text-success' : 'bg-warning/15 text-primary'}`}>
                  {creatingTemplate ? <Plus className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-foreground">
                    {creatingTemplate ? "Create Template" : "Edit Template"}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {creatingTemplate ? "New email notification template" : editingTemplate?.name}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
              {/* Main Editor */}
              <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-shrink-0">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs font-semibold">Template Name <span className="text-destructive">*</span></Label>
                    <Input
                      id="name"
                      value={editForm.name || ""}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="h-8 text-sm"
                      placeholder="e.g., Welcome Email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="type" className="text-xs font-semibold">Type <span className="text-destructive">*</span></Label>
                    <Select
                      value={editForm.template_type || ""}
                      onValueChange={(val) => setEditForm({ ...editForm, template_type: val })}
                      disabled={!!editingTemplate}
                    >
                      <SelectTrigger className="h-8 w-full text-sm">
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invoice_generated">Invoice Generated</SelectItem>
                        <SelectItem value="invoice_due">Invoice Due</SelectItem>
                        <SelectItem value="invoice_overdue">Invoice Overdue</SelectItem>
                        <SelectItem value="payment_received">Payment Received</SelectItem>
                        <SelectItem value="appointment_reminder">Appointment Reminder</SelectItem>
                        <SelectItem value="appointment_confirmation">Appointment Confirmation</SelectItem>
                        <SelectItem value="appointment_cancelled">Appointment Cancelled</SelectItem>
                        <SelectItem value="work_order_created">Work Order Created</SelectItem>
                        <SelectItem value="work_order_completed">Work Order Completed</SelectItem>
                        <SelectItem value="work_order_approved">Work Order Approved</SelectItem>
                        <SelectItem value="inspection_completed">Inspection Completed</SelectItem>
                        <SelectItem value="inspection_approved">Inspection Approved</SelectItem>
                        <SelectItem value="inspection_rejected">Inspection Rejected</SelectItem>
                        <SelectItem value="inspection_sent_to_customer">Inspection Sent to Customer</SelectItem>
                        <SelectItem value="estimate_sent">Estimate Sent</SelectItem>
                        <SelectItem value="estimate_approved">Estimate Approved</SelectItem>
                        <SelectItem value="estimate_declined">Estimate Declined</SelectItem>
                        <SelectItem value="estimate_expiring_soon">Estimate Expiring Soon</SelectItem>
                        <SelectItem value="estimate_expired">Estimate Expired</SelectItem>
                        <SelectItem value="vehicle_ready">Vehicle Ready</SelectItem>
                        <SelectItem value="parts_arrived">Parts Arrived</SelectItem>
                        <SelectItem value="low_stock_alert">Low Stock Alert</SelectItem>
                        <SelectItem value="service_due">Service Due</SelectItem>
                        <SelectItem value="user_welcome">User Welcome</SelectItem>
                        <SelectItem value="password_reset">Password Reset</SelectItem>
                        <SelectItem value="password_reset_link">Password Reset Link</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="subject" className="text-xs font-semibold">Subject Line <span className="text-destructive">*</span></Label>
                  <Input
                    id="subject"
                    value={editForm.subject || ""}
                    onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="Email subject..."
                  />
                </div>

                <div className="flex-1 min-h-0 flex flex-col gap-2">
                  <div className="flex items-center justify-between flex-shrink-0">
                    <Label className="text-xs font-semibold">Content</Label>
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "plain" | "html")} className="h-7">
                      <TabsList className="h-7 p-0.5 bg-muted">
                        <TabsTrigger value="plain" className="h-6 text-[10px] px-2">Plain Text</TabsTrigger>
                        <TabsTrigger value="html" className="h-6 text-[10px] px-2">HTML</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="flex-1 min-h-[min(58vh,560px)] border rounded-md border-border overflow-hidden bg-card">
                    {activeTab === "plain" ? (
                      <Textarea
                        ref={bodyTextareaRef}
                        value={editForm.body || ""}
                        onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                        className="w-full h-full min-h-[min(58vh,560px)] resize-y border-0 p-4 font-mono text-sm leading-relaxed focus-visible:ring-0"
                        placeholder="Email content... Use {total_display} for amounts."
                      />
                    ) : (
                      <Textarea
                        ref={htmlTextareaRef}
                        value={editForm.html_body || ""}
                        onChange={(e) => setEditForm({ ...editForm, html_body: e.target.value })}
                        className="w-full h-full min-h-[min(58vh,560px)] resize-y border-0 p-4 font-mono text-xs leading-relaxed focus-visible:ring-0"
                        placeholder="<p>HTML content...</p>"
                      />
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground flex-shrink-0">
                    {activeTab === "plain" ? "Required plain-text fallback for all email clients" : "Optional HTML version — drag corner to resize"}
                  </p>

                  {draftPreview && editingTemplate && (
                    <div className="flex-shrink-0 rounded-md border border-border bg-muted/40 p-3 max-h-32 overflow-y-auto">
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1">Draft preview (subject)</p>
                      <p className="text-xs text-foreground">{draftPreview.subject}</p>
                      {draftPreview.unresolved_variables && draftPreview.unresolved_variables.length > 0 && (
                        <p className="text-[10px] text-destructive mt-2">
                          Unresolved: {draftPreview.unresolved_variables.map((v) => `{${v}}`).join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="w-full lg:w-[300px] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-muted/50 flex flex-col min-h-0 max-h-[40vh] lg:max-h-none">
                <div className="p-4 border-b border-border">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> Variables
                  </h4>
                </div>
                <ScrollArea className="flex-1 min-h-0 p-2">
                  <div className="space-y-1">
                    {variableHintsList.map((variable) => (
                      <div key={variable} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => insertVariable(variable)}
                          className="flex-1 text-left px-3 py-2 text-[10px] font-mono text-muted-foreground hover:bg-primary/10 hover:text-primary rounded transition-colors truncate"
                          title="Click to insert at cursor"
                        >
                          {variable}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(variable);
                            toast({ title: "Copied!", description: variable, duration: 1000 });
                          }}
                          className="p-1.5 text-muted-foreground hover:text-primary rounded"
                          title="Copy"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="p-3 bg-primary/10 border-t border-warning/20 space-y-2 flex-shrink-0">
                  <p className="text-[10px] text-primary leading-tight">
                    Use <span className="font-mono">{"{total_display}"}</span> for amounts — do not hardcode <span className="font-mono">$</span> or <span className="font-mono">{"${total}"}</span>.
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Click a variable to insert; copy icon for clipboard. Hints match backend triggers.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter className="px-6 py-3 border-t border-border flex-shrink-0 bg-muted/50">
              <div className="flex items-center justify-between w-full gap-2 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraftPreview(null);
                    if (creatingTemplate) setCreatingTemplate(false);
                    else setEditingTemplate(null);
                  }}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
                <div className="flex items-center gap-2">
                  {editingTemplate && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDraftPreview}
                      disabled={draftPreviewLoading || !editForm.body}
                      className="h-8 text-xs"
                    >
                      {draftPreviewLoading ? "Previewing…" : "Test variables"}
                    </Button>
                  )}
                  <Button
                    onClick={handleSave}
                    disabled={createMutation.isPending || updateMutation.isPending || !canSave || !canManage}
                    size="sm"
                    className="h-8 text-xs bg-primary hover:bg-primary/90 text-white"
                  >
                    {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Template"}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Preview Dialog */}
      {previewTemplate && (
        <Dialog open={!!previewTemplate} onOpenChange={() => { setPreviewTemplate(null); setPreviewRendered(null); }}>
          <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-success" />
                <div>
                  <DialogTitle className="text-base font-bold">Preview: {previewTemplate.name}</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Sample data with your system currency
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-6 py-3 border-b border-border bg-muted/50">
                <p className="text-sm font-medium text-foreground">
                  <span className="text-muted-foreground font-normal mr-2">Subject:</span>
                  {previewLoading ? "Rendering…" : (previewRendered?.subject ?? previewTemplate.subject)}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {previewLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : (
                <Tabs
                  value={(previewRendered?.html_body || previewTemplate.html_body) ? (previewTab === "html" ? "html" : "plain") : "plain"}
                  onValueChange={setPreviewTab}
                  className="w-full"
                >
                  <TabsList className="w-full justify-start h-9 p-1 bg-muted border-b border-border rounded-none mb-4">
                    <TabsTrigger value="plain" className="text-xs h-7">Plain Text</TabsTrigger>
                    <TabsTrigger value="html" className="text-xs h-7" disabled={!(previewRendered?.html_body || previewTemplate.html_body)}>HTML</TabsTrigger>
                  </TabsList>

                  <TabsContent value="plain" className="mt-0">
                    <div className="rounded-md border border-border bg-muted/30 p-4 font-mono text-sm whitespace-pre-wrap text-foreground leading-relaxed">
                      {previewRendered?.body ?? previewTemplate.body}
                    </div>
                  </TabsContent>
                  <TabsContent value="html" className="mt-0">
                    <div className="rounded-md border border-border bg-card overflow-hidden">
                      <iframe
                        title="Email HTML preview"
                        sandbox=""
                        className="w-full min-h-[320px] border-0"
                        srcDoc={previewRendered?.html_body || previewTemplate.html_body || ""}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
                )}
              </div>
            </div>
            <DialogFooter className="px-6 py-3 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => { setPreviewTemplate(null); setPreviewRendered(null); }} className="h-8 text-xs">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingTemplate && (
        <Dialog open={!!deletingTemplate} onOpenChange={() => !deleteMutation.isPending && setDeletingTemplate(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-destructive" />
                Delete Template
              </DialogTitle>
              <DialogDescription className="pt-2">
                Are you sure you want to delete the template <strong>{deletingTemplate.name}</strong>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeletingTemplate(null)}
                disabled={deleteMutation.isPending}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
                className="h-8 text-xs bg-destructive hover:bg-destructive"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
