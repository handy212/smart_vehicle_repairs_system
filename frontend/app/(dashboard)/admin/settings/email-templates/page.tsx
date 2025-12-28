"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, NotificationTemplate as NotificationTemplateType } from "@/lib/api/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Search, Mail, Edit2, Eye, X, Code2, Info, FileText, Monitor, Copy, Sparkles, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function EmailTemplatesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState<string>("email");
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplateType | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<NotificationTemplateType | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<Partial<NotificationTemplateType>>({});
  const [activeTab, setActiveTab] = useState<"plain" | "html">("plain");
  const [previewTab, setPreviewTab] = useState<string>("plain");

  const { data, isLoading, error } = useQuery({
    queryKey: ["notification-templates", typeFilter, channelFilter],
    queryFn: () => notificationsApi.templates.list({
      template_type: typeFilter || undefined,
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to create template",
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update template",
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update template",
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
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
    setEditingTemplate(template);
    setEditForm({
      name: template.name || "",
      subject: template.subject || "",
      body: template.body || "",
      html_body: template.html_body || "",
    });
    setActiveTab("plain");
  };

  const handlePreview = (template: NotificationTemplateType) => {
    setPreviewTemplate(template);
    setPreviewTab(template.html_body ? "html" : "plain");
  };

  const handleSave = () => {
    if (creatingTemplate) {
      createMutation.mutate(editForm);
    } else if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: editForm });
    }
  };

  const handleToggleActive = (template: NotificationTemplateType) => {
    toggleActiveMutation.mutate({
      id: template.id,
      is_active: !template.is_active,
    });
  };

  const templates = (data as any)?.results || (Array.isArray(data) ? data : []) || [];
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

  // Variable helper based on template type
  const getVariableHints = (templateType?: string) => {
    const common = ["{customer_name}", "{company_name}", "{work_order_number}"];
    const hints: Record<string, string[]> = {
      invoice_generated: [...common, "{invoice_number}", "{total}", "{due_date}", "{balance_due}", "{vehicle_display}", "{invoice_link}"],
      invoice_due: [...common, "{invoice_number}", "{balance_due}", "{due_date}", "{days_until_due}", "{invoice_link}"],
      invoice_overdue: [...common, "{invoice_number}", "{balance_due}", "{due_date}", "{days_overdue}", "{invoice_link}"],
      payment_received: [...common, "{payment_number}", "{amount}", "{payment_date}", "{payment_method}", "{invoice_number}", "{balance_remaining}"],
      appointment_reminder: [...common, "{appointment_date}", "{appointment_time}", "{vehicle}", "{service_description}", "{technician_name}"],
      appointment_confirmation: [...common, "{appointment_date}", "{appointment_time}", "{vehicle}", "{service_description}", "{technician_name}"],
      appointment_cancelled: [...common, "{appointment_date}", "{appointment_time}", "{vehicle}", "{reason}"],
      work_order_created: [...common, "{work_order_number}", "{vehicle}", "{service_description}", "{estimated_completion}"],
      work_order_completed: [...common, "{work_order_number}", "{vehicle}", "{completion_date}", "{total_amount}"],
      work_order_approved: [...common, "{work_order_number}", "{vehicle}", "{estimate_amount}"],
      vehicle_ready: [...common, "{vehicle}", "{work_order_number}", "{pickup_location}", "{ready_time}"],
      inspection_completed: [...common, "{inspection_number}", "{vehicle}", "{inspection_date}", "{inspection_link}"],
      user_welcome: ["{user_name}", "{email}", "{username}", "{password}", "{role}", "{login_url}", "{branch_info}", "{company_name}"],
      password_reset: ["{user_name}", "{email}", "{username}", "{new_password}", "{login_url}", "{company_name}"],
      password_reset_link: ["{user_name}", "{email}", "{username}", "{reset_link}", "{company_name}"],
      low_stock_alert: ["{part_name}", "{part_number}", "{current_stock}", "{min_stock}", "{reorder_quantity}"],
      parts_arrived: ["{part_name}", "{part_number}", "{quantity}", "{work_order_number}", "{vehicle}"],
      service_due: [...common, "{vehicle}", "{service_type}", "{due_date}", "{miles_remaining}"],
    };
    return hints[templateType || ""] || common;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/admin/settings" className="hover:text-blue-600 transition-colors">Settings</Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">Templates</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Email Templates</h1>
        </div>
        <Button onClick={handleCreate} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-700">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Create Template
        </Button>
      </div>

      {/* Filters */}
      <Card className="mx-4 border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
              <Input
                type="text"
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm bg-white dark:bg-gray-900"
              />
            </div>

            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-8 w-[180px] text-xs bg-white dark:bg-gray-900"
            >
              <option value="">All Types</option>
              <option value="invoice_generated">Invoice Generated</option>
              <option value="invoice_due">Invoice Due</option>
              <option value="invoice_overdue">Invoice Overdue</option>
              <option value="payment_received">Payment Received</option>
              <option value="appointment_reminder">Appointment Reminder</option>
              <option value="appointment_confirmation">Appointment Confirmation</option>
              <option value="work_order_created">Work Order Created</option>
              <option value="work_order_completed">Work Order Completed</option>
              <option value="user_welcome">User Welcome</option>
              <option value="password_reset">Password Reset</option>
            </Select>

            {(search || typeFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setTypeFilter("");
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

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 px-4 pb-8">
        {filteredTemplates.map((template: NotificationTemplateType) => (
          <Card
            key={template.id}
            className="hover:shadow-md transition-all duration-200 group border border-gray-200 dark:border-gray-800"
          >
            <CardHeader className="p-3 pb-0">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[200px]" title={template.name}>
                    {template.name || "Unnamed Template"}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-gray-200 bg-gray-50 text-gray-600">
                      {template.template_type.replace(/_/g, " ")}
                    </Badge>
                    {template.channel === 'email' && <Mail className="w-3 h-3 text-gray-400" />}
                  </div>
                </div>
                <Switch
                  checked={template.is_active}
                  onCheckedChange={() => handleToggleActive(template)}
                  disabled={toggleActiveMutation.isPending}
                  className="scale-75 data-[state=checked]:bg-green-500"
                />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-2">
              <div className="space-y-2">
                <div>
                  <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-0.5">Subject</div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 truncate font-medium">
                    {template.subject || <span className="text-gray-400 italic">No subject</span>}
                  </p>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-0.5">Preview</div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-2 min-h-[2.5em]">
                    {template.body || <span className="text-gray-400 italic">No content</span>}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-[10px] text-gray-400">
                    {format(new Date(template.updated_at), "MMM d, yyyy")}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePreview(template)}
                      className="h-6 w-6 p-0 hover:text-blue-600"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(template)}
                      className="h-6 w-6 p-0 hover:text-blue-600"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12 px-4">
          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
            <Mail className="w-6 h-6 text-gray-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">No templates found</h3>
          <p className="text-xs text-gray-500 mt-1">
            {search || typeFilter ? "Try adjusting your filters" : "Create a new template to get started"}
          </p>
        </div>
      )}

      {/* Create/Edit Dialog */}
      {(creatingTemplate || editingTemplate) && (
        <Dialog
          open={creatingTemplate || !!editingTemplate}
          onOpenChange={(open) => !open && (creatingTemplate ? setCreatingTemplate(false) : setEditingTemplate(null))}
        >
          <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${creatingTemplate ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                  {creatingTemplate ? <Plus className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-gray-900 dark:text-white">
                    {creatingTemplate ? "Create Template" : "Edit Template"}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-gray-500">
                    {creatingTemplate ? "New email notification template" : editingTemplate?.name}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              {/* Main Editor */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs font-semibold">Template Name <span className="text-red-500">*</span></Label>
                    <Input
                      id="name"
                      value={editForm.name || ""}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="h-8 text-sm"
                      placeholder="e.g., Welcome Email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="type" className="text-xs font-semibold">Type <span className="text-red-500">*</span></Label>
                    <Select
                      value={editForm.template_type || ""}
                      onChange={(e) => setEditForm({ ...editForm, template_type: e.target.value })}
                      className="h-8 w-full text-sm"
                      disabled={!!editingTemplate}
                    >
                      <option value="">Select type...</option>
                      <option value="invoice_generated">Invoice Generated</option>
                      <option value="invoice_due">Invoice Due</option>
                      <option value="invoice_overdue">Invoice Overdue</option>
                      <option value="payment_received">Payment Received</option>
                      <option value="appointment_reminder">Appointment Reminder</option>
                      <option value="user_welcome">User Welcome</option>
                      <option value="password_reset">Password Reset</option>
                      <option value="custom">Custom</option>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="subject" className="text-xs font-semibold">Subject Line <span className="text-red-500">*</span></Label>
                  <Input
                    id="subject"
                    value={editForm.subject || ""}
                    onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="Email subject..."
                  />
                </div>

                <div className="space-y-2 flex-1 flex flex-col min-h-[400px]">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Content</Label>
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "plain" | "html")} className="h-7">
                      <TabsList className="h-7 p-0.5 bg-gray-100">
                        <TabsTrigger value="plain" className="h-6 text-[10px] px-2">Plain Text</TabsTrigger>
                        <TabsTrigger value="html" className="h-6 text-[10px] px-2">HTML</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="flex-1 relative border rounded-md border-gray-200 dark:border-gray-700 overflow-hidden">
                    {activeTab === "plain" ? (
                      <Textarea
                        value={editForm.body || ""}
                        onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                        className="w-full h-full min-h-[400px] resize-none border-0 p-4 font-mono text-sm focus-visible:ring-0"
                        placeholder="Email content..."
                      />
                    ) : (
                      <Textarea
                        value={editForm.html_body || ""}
                        onChange={(e) => setEditForm({ ...editForm, html_body: e.target.value })}
                        className="w-full h-full min-h-[400px] resize-none border-0 p-4 font-mono text-sm focus-visible:ring-0"
                        placeholder="<p>HTML content...</p>"
                      />
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 text-right">
                    {activeTab === "plain" ? "Required fallback version" : "Optional rich version"}
                  </p>
                </div>
              </div>

              {/* Sidebar */}
              <div className="w-full lg:w-[280px] border-l border-gray-100 dark:border-gray-800 bg-gray-50/50 flex flex-col">
                <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> Variables
                  </h4>
                </div>
                <ScrollArea className="flex-1 p-2">
                  <div className="space-y-1">
                    {getVariableHints(editForm.template_type).map((variable, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          navigator.clipboard.writeText(variable);
                          toast({ title: "Copied!", description: variable, duration: 1000 });
                        }}
                        className="w-full text-left px-3 py-2 text-[10px] font-mono text-gray-600 hover:bg-blue-50 hover:text-blue-600 rounded transition-colors flex items-center justify-between group border border-transparent hover:border-blue-100"
                      >
                        {variable}
                        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                </ScrollArea>
                <div className="p-3 bg-blue-50 border-t border-blue-100">
                  <p className="text-[10px] text-blue-700 leading-tight">
                    Click to copy variables to clipboard.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 bg-gray-50/50">
              <div className="flex items-center justify-between w-full">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (creatingTemplate) setCreatingTemplate(false);
                    else setEditingTemplate(null);
                  }}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={createMutation.isPending || updateMutation.isPending || !editForm.name || !editForm.subject || !editForm.body}
                  size="sm"
                  className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Template"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Preview Dialog */}
      {previewTemplate && (
        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-green-600" />
                <div>
                  <DialogTitle className="text-base font-bold">Preview: {previewTemplate.name}</DialogTitle>
                </div>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/50">
                <p className="text-sm font-medium text-gray-900">
                  <span className="text-gray-500 font-normal mr-2">Subject:</span>
                  {previewTemplate.subject}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <Tabs
                  value={previewTemplate.html_body ? (previewTab === "html" ? "html" : "plain") : "plain"}
                  onValueChange={setPreviewTab}
                  className="w-full"
                >
                  <TabsList className="w-full justify-start h-9 p-1 bg-gray-100 border-b border-gray-200 rounded-none mb-4">
                    <TabsTrigger value="plain" className="text-xs h-7">Plain Text</TabsTrigger>
                    <TabsTrigger value="html" className="text-xs h-7" disabled={!previewTemplate.html_body}>HTML</TabsTrigger>
                  </TabsList>

                  <TabsContent value="plain" className="mt-0">
                    <div className="font-mono text-sm whitespace-pre-wrap text-gray-800 leading-relaxed">
                      {previewTemplate.body}
                    </div>
                  </TabsContent>
                  <TabsContent value="html" className="mt-0">
                    <div className="prose max-w-none text-sm" dangerouslySetInnerHTML={{ __html: previewTemplate.html_body || "" }} />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
            <DialogFooter className="px-6 py-3 border-t border-gray-100">
              <Button variant="secondary" size="sm" onClick={() => setPreviewTemplate(null)} className="h-8 text-xs">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
