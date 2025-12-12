"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, NotificationTemplate as NotificationTemplateType } from "@/lib/api/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Search, Mail, CheckCircle2, XCircle, Edit2, Eye, X, Code2, Info, FileText, Monitor, Copy, Sparkles, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        Error loading email templates. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin/settings">
            <Buttonvariant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Email Templates</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Customize email notification templates for your business</p>
          </div>
        </div>
        <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Create New Template
        </Button>
      </div>

      {/* Filters - Compact Design */}
      <Card className="border-gray-200 dark:border-gray-800 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search by name, subject, or content..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-10 border-gray-300 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 min-w-[220px] rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white"
            >
              <option value="">All Template Types</option>
              <option value="invoice_generated">Invoice Generated/Sent</option>
              <option value="invoice_due">Invoice Due Reminder</option>
              <option value="invoice_overdue">Invoice Overdue</option>
              <option value="payment_received">Payment Received</option>
              <option value="appointment_reminder">Appointment Reminder</option>
              <option value="appointment_confirmation">Appointment Confirmation</option>
              <option value="appointment_cancelled">Appointment Cancelled</option>
              <option value="work_order_created">Work Order Created</option>
              <option value="work_order_completed">Work Order Completed</option>
              <option value="work_order_approved">Work Order Approved</option>
              <option value="vehicle_ready">Vehicle Ready</option>
              <option value="inspection_completed">Inspection Completed</option>
              <option value="low_stock_alert">Low Stock Alert</option>
              <option value="service_due">Service Due</option>
              <option value="parts_arrived">Parts Arrived</option>
              <option value="estimate_sent">Estimate Sent</option>
              <option value="estimate_expiring_soon">Estimate Expiring Soon</option>
              <option value="estimate_expired">Estimate Expired</option>
              <option value="user_welcome">User Welcome</option>
              <option value="password_reset">Password Reset</option>
              <option value="password_reset_link">Password Reset Link</option>
            </select>

            {(search || typeFilter) && (
              <Button
               variant="secondary"
                onClick={() => {
                  setSearch("");
                  setTypeFilter("");
                }}
                className="h-10"
                size="sm"
              >
                <X className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredTemplates.map((template: NotificationTemplateType) => (
          <Card 
            key={template.id} 
            className="hover:shadow-lg transition-all duration-200 border-gray-200 dark:border-gray-800 group"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base font-semibold text-gray-900 dark:text-white line-clamp-1">
                    {template.name || "Unnamed Template"}
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge 
                      variant={template.is_active ? "success" : "secondary"}
                      className="text-xs"
                    >
                      {template.template_type.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {template.channel}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <Switch
                    checked={template.is_active}
                    onCheckedChange={() => handleToggleActive(template)}
                    disabled={toggleActiveMutation.isPending}
                    className="data-[state=checked]:bg-green-500"
                  />
                  <span className={`text-xs font-medium ${template.is_active ? "text-green-600 dark:text-green-400" : "text-gray-500"}`}>
                    {template.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Subject
                  </Label>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-1.5 line-clamp-2">
                    {template.subject || <span className="text-gray-400 italic">(No subject)</span>}
                  </p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Preview
                  </Label>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1.5 line-clamp-3 leading-relaxed">
                    {template.body ? (
                      template.body.substring(0, 150) + (template.body.length > 150 ? "..." : "")
                    ) : (
                      <span className="text-gray-400 italic">(No body content)</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-800">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Updated {format(new Date(template.updated_at), "MMM dd, yyyy")}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                     variant="secondary"
                      size="sm"
                      onClick={() => handlePreview(template)}
                      className="h-8 px-3"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      Preview
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleEdit(template)}
                      className="h-8 px-3"
                    >
                      <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="py-16">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No templates found</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {search || typeFilter 
                  ? "Try adjusting your search or filter criteria"
                  : "No email templates available"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      {creatingTemplate && (
        <Dialog open={creatingTemplate} onOpenChange={(open) => !open && setCreatingTemplate(false)}>
          <DialogContent className="max-w-7xl max-h-[95vh] overflow-hidden flex flex-col p-0 gap-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <Plus className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-white">
                    Create New Template
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Create a new email template. Variables like {'{customer_name}'} will be replaced automatically.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Editor - 2 columns */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="create-template-type" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Template Type <span className="text-red-500">*</span>
                      </Label>
                      <select
                        id="create-template-type"
                        value={editForm.template_type || ""}
                        onChange={(e) => setEditForm({ ...editForm, template_type: e.target.value })}
                        className="h-10 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                      >
                        <option value="">Select template type...</option>
                        <option value="invoice_generated">Invoice Generated</option>
                        <option value="invoice_due">Invoice Due</option>
                        <option value="invoice_overdue">Invoice Overdue</option>
                        <option value="payment_received">Payment Received</option>
                        <option value="appointment_reminder">Appointment Reminder</option>
                        <option value="appointment_confirmation">Appointment Confirmation</option>
                        <option value="appointment_cancelled">Appointment Cancelled</option>
                        <option value="work_order_created">Work Order Created</option>
                        <option value="work_order_completed">Work Order Completed</option>
                        <option value="work_order_approved">Work Order Approved</option>
                        <option value="vehicle_ready">Vehicle Ready</option>
                        <option value="inspection_completed">Inspection Completed</option>
                        <option value="low_stock_alert">Low Stock Alert</option>
                        <option value="service_due">Service Due</option>
                        <option value="parts_arrived">Parts Arrived</option>
                        <option value="estimate_sent">Estimate Sent</option>
                        <option value="estimate_expiring_soon">Estimate Expiring Soon</option>
                        <option value="estimate_expired">Estimate Expired</option>
                        <option value="user_welcome">User Welcome</option>
                        <option value="password_reset">Password Reset</option>
                        <option value="password_reset_link">Password Reset Link</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-channel" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Channel <span className="text-red-500">*</span>
                      </Label>
                      <select
                        id="create-channel"
                        value={editForm.channel || "email"}
                        onChange={(e) => setEditForm({ ...editForm, channel: e.target.value })}
                        className="h-10 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                      >
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                        <option value="push">Push Notification</option>
                        <option value="in_app">In-App Notification</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="create-name" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Template Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="create-name"
                      value={editForm.name || ""}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="h-10"
                      placeholder="e.g., User Welcome - Default"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="create-subject" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Email Subject Line <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="create-subject"
                      value={editForm.subject || ""}
                      onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                      className="h-10"
                      placeholder="Welcome to Smart Vehicle Repairs System"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Use variables like {'{user_name}'}, {'{email}'}, etc.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Email Body Content <span className="text-red-500">*</span>
                    </Label>
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "plain" | "html")} className="w-full">
                      <TabsList className="grid w-full grid-cols-2 h-11">
                        <TabsTrigger value="plain" className="flex items-center gap-2 text-sm">
                          <FileText className="w-4 h-4" />
                          Plain Text
                        </TabsTrigger>
                        <TabsTrigger value="html" className="flex items-center gap-2 text-sm">
                          <Monitor className="w-4 h-4" />
                          HTML
                        </TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="plain" className="mt-4 space-y-2">
                        <Textarea
                          id="create-body"
                          value={editForm.body || ""}
                          onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                          className="font-mono text-sm min-h-[450px] resize-none border-gray-300 dark:border-gray-700 focus:border-blue-500"
                          placeholder="Dear {user_name},&#10;&#10;Welcome to Smart Vehicle Repairs System!..."
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Plain text version (required)
                        </p>
                      </TabsContent>
                      
                      <TabsContent value="html" className="mt-4 space-y-2">
                        <Textarea
                          id="create-html_body"
                          value={editForm.html_body || ""}
                          onChange={(e) => setEditForm({ ...editForm, html_body: e.target.value })}
                          className="font-mono text-sm min-h-[450px] resize-none border-gray-300 dark:border-gray-700 focus:border-blue-500"
                          placeholder="&lt;html&gt;&lt;body&gt;&lt;p&gt;Dear {user_name},&lt;/p&gt;..."
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          HTML version (optional, enables rich formatting and styling)
                        </p>
                      </TabsContent>
                    </Tabs>
                  </div>
                </div>

                {/* Sidebar - Variable Helper - 1 column */}
                <div className="lg:col-span-1">
                  <Card className="sticky top-4 border-gray-200 dark:border-gray-800 shadow-sm">
                    <CardHeader className="pb-3 border-b border-gray-200 dark:border-gray-800">
                      <CardTitle className="text-base font-semibold flex items-center gap-2 text-gray-900 dark:text-white">
                        <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                          <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        Available Variables
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                            Click any variable below to copy it. Variables are automatically replaced with actual values when emails are sent.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {getVariableHints(editForm.template_type).map((variable, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(variable);
                                toast({
                                  title: "Copied!",
                                  description: `${variable} copied to clipboard`,
                                });
                              } catch (err) {
                                console.error("Failed to copy:", err);
                              }
                            }}
                            className="w-full text-left px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-sm font-mono text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center justify-between group"
                          >
                            <span>{variable}</span>
                            <Copy className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center justify-between w-full">
                <Button
                 variant="secondary"
                  onClick={() => {
                    setCreatingTemplate(false);
                    setEditForm({});
                  }}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={createMutation.isPending || !editForm.name || !editForm.template_type || !editForm.body}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {createMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Create Template
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Dialog - Clean & Modern */}
      {editingTemplate && (
        <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
          <DialogContent className="max-w-7xl max-h-[95vh] overflow-hidden flex flex-col p-0 gap-0">
            <DialogClose onOpenChange={(open) => !open && setEditingTemplate(null)} />
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Edit2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-white">
                    Edit Template
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {editingTemplate.name} • Variables like {'{customer_name}'} will be replaced automatically
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Editor - 2 columns */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Template Name
                    </Label>
                    <Input
                      id="name"
                      value={editForm.name || ""}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="h-10"
                      placeholder="e.g., Invoice Sent - Default"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="subject" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Email Subject Line
                    </Label>
                    <Input
                      id="subject"
                      value={editForm.subject || ""}
                      onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                      className="h-10"
                      placeholder="Invoice {invoice_number} - ${total}"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Use variables like {'{customer_name}'}, {'{invoice_number}'}, etc.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Email Body Content
                    </Label>
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "plain" | "html")} className="w-full">
                      <TabsList className="grid w-full grid-cols-2 h-11">
                        <TabsTrigger value="plain" className="flex items-center gap-2 text-sm">
                          <FileText className="w-4 h-4" />
                          Plain Text
                        </TabsTrigger>
                        <TabsTrigger value="html" className="flex items-center gap-2 text-sm">
                          <Monitor className="w-4 h-4" />
                          HTML
                        </TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="plain" className="mt-4 space-y-2">
                        <Textarea
                          id="body"
                          value={editForm.body || ""}
                          onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                          className="font-mono text-sm min-h-[450px] resize-none border-gray-300 dark:border-gray-700 focus:border-blue-500"
                          placeholder="Dear {customer_name},&#10;&#10;Your invoice is ready..."
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Plain text version (used as fallback for email clients without HTML support)
                        </p>
                      </TabsContent>
                      
                      <TabsContent value="html" className="mt-4 space-y-2">
                        <Textarea
                          id="html_body"
                          value={editForm.html_body || ""}
                          onChange={(e) => setEditForm({ ...editForm, html_body: e.target.value })}
                          className="font-mono text-sm min-h-[450px] resize-none border-gray-300 dark:border-gray-700 focus:border-blue-500"
                          placeholder="&lt;html&gt;&lt;body&gt;&lt;p&gt;Dear {customer_name},&lt;/p&gt;..."
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          HTML version (optional, enables rich formatting and styling)
                        </p>
                      </TabsContent>
                    </Tabs>
                  </div>
                </div>

                {/* Sidebar - Variable Helper - 1 column */}
                <div className="lg:col-span-1">
                  <Card className="sticky top-4 border-gray-200 dark:border-gray-800 shadow-sm">
                    <CardHeader className="pb-3 border-b border-gray-200 dark:border-gray-800">
                      <CardTitle className="text-base font-semibold flex items-center gap-2 text-gray-900 dark:text-white">
                        <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                          <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        Available Variables
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                            Click any variable below to copy it. Variables are automatically replaced with actual values when emails are sent.
                          </p>
                        </div>
                      </div>
                      
                      <div>
                        <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3 block uppercase tracking-wide">
                          Template Variables
                        </Label>
                        <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
                          {getVariableHints(editingTemplate.template_type).map((variable, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                navigator.clipboard.writeText(variable);
                                toast({
                                  title: "Copied!",
                                  description: `${variable} copied to clipboard`,
                                });
                              }}
                              className="w-full text-left px-3 py-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 text-xs font-mono text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-all duration-150 flex items-center justify-between group"
                            >
                              <span className="flex-1">{variable}</span>
                              <Copy className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" />
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="pt-3 border-t border-gray-200 dark:border-gray-800">
                        <div className="flex items-start gap-2">
                          <Info className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                            <strong className="font-semibold">Note:</strong> Variables are case-sensitive. Include the curly braces exactly as shown.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
            
            <DialogFooter className="border-t border-gray-200 dark:border-gray-800 px-6 py-4 bg-gray-50 dark:bg-gray-900/50">
              <Button 
               variant="secondary" 
                onClick={() => setEditingTemplate(null)}
                className="h-10"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending || !editForm.name || !editForm.subject || !editForm.body}
                className="h-10 min-w-[120px]"
              >
                {updateMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Preview Dialog - Clean & Modern */}
      {previewTemplate && (
        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
            <DialogClose onOpenChange={(open) => !open && setPreviewTemplate(null)} />
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <Eye className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-white">
                    Email Preview
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {previewTemplate.name} • This is how recipients will see the email
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <Tabs 
                value={previewTemplate.html_body ? (previewTab === "html" ? "html" : previewTab === "source" ? "source" : "plain") : "plain"} 
                onValueChange={(v) => {
                  if (v === "html" && !previewTemplate.html_body) return;
                  setPreviewTab(v);
                }} 
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-3 h-11">
                  <TabsTrigger value="plain" className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4" />
                    Plain Text
                  </TabsTrigger>
                  <TabsTrigger 
                    value="html" 
                    className={`flex items-center gap-2 text-sm ${!previewTemplate.html_body ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                  >
                    <Monitor className="w-4 h-4" />
                    HTML Preview
                  </TabsTrigger>
                  <TabsTrigger value="source" className="flex items-center gap-2 text-sm">
                    <Code2 className="w-4 h-4" />
                    Source Code
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="plain" className="mt-6 space-y-4">
                  <div>
                    <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                      Email Subject
                    </Label>
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {previewTemplate.subject || <span className="text-gray-400 italic">(No subject)</span>}
                      </p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                      Plain Text Body
                    </Label>
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 font-mono text-sm whitespace-pre-wrap max-h-[550px] overflow-y-auto text-gray-900 dark:text-gray-100 leading-relaxed">
                      {previewTemplate.body || <span className="text-gray-400 italic">(No body content)</span>}
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="html" className="mt-6 space-y-4">
                  <div>
                    <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                      Email Subject
                    </Label>
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {previewTemplate.subject || <span className="text-gray-400 italic">(No subject)</span>}
                      </p>
                    </div>
                  </div>
                  {previewTemplate.html_body ? (
                    <div>
                      <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                        HTML Email Preview
                      </Label>
                      <div className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 shadow-sm max-h-[550px] overflow-y-auto">
                        <div dangerouslySetInnerHTML={{ __html: previewTemplate.html_body }} />
                      </div>
                    </div>
                  ) : (
                    <div className="p-12 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
                      <Monitor className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No HTML version available</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Add HTML content in the editor to see a preview</p>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="source" className="mt-6 space-y-4">
                  <div>
                    <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                      Subject Source
                    </Label>
                    <div className="p-4 bg-gray-900 dark:bg-gray-950 rounded-lg border border-gray-800 font-mono text-sm text-green-400 max-h-[120px] overflow-y-auto">
                      <pre className="whitespace-pre-wrap">{previewTemplate.subject || "(No subject)"}</pre>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                      HTML Source Code
                    </Label>
                    <div className="p-4 bg-gray-900 dark:bg-gray-950 rounded-lg border border-gray-800 font-mono text-xs text-green-400 max-h-[550px] overflow-y-auto">
                      <pre className="whitespace-pre-wrap">{previewTemplate.html_body || previewTemplate.body || "(No content)"}</pre>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
            
            <DialogFooter className="border-t border-gray-200 dark:border-gray-800 px-6 py-4 bg-gray-50 dark:bg-gray-900/50">
              <Button 
               variant="secondary" 
                onClick={() => setPreviewTemplate(null)}
                className="h-10"
              >
                Close Preview
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
