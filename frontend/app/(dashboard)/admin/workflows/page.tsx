"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, DatabaseZap, GitBranch, Plus, Save, ShieldCheck, Zap } from "lucide-react";

import { workflowsApi, WorkflowDefinition, WorkflowState } from "@/lib/api/workflows";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/hooks/useToast";

export default function WorkflowAdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    code: "",
    model_path: "workorders.WorkOrder",
    description: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(),
  });

  const { data: registry = [] } = useQuery({
    queryKey: ["workflow-registry"],
    queryFn: () => workflowsApi.registry(),
  });

  const { data: instances } = useQuery({
    queryKey: ["workflow-instances"],
    queryFn: () => workflowsApi.instances(),
  });

  const { data: logs } = useQuery({
    queryKey: ["workflow-logs"],
    queryFn: () => workflowsApi.logs(),
  });

  const workflows = useMemo(() => data?.results || [], [data?.results]);
  const modelOptions = useMemo(
    () => registry.map((item) => ({ value: item.model_path, label: item.label })),
    [registry],
  );
  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedId) || workflows[0],
    [selectedId, workflows],
  );

  const { data: workflowDetail } = useQuery({
    queryKey: ["workflow", selectedWorkflow?.id],
    queryFn: () => workflowsApi.get(selectedWorkflow!.id),
    enabled: !!selectedWorkflow?.id,
  });

  const activeWorkflow = workflowDetail || selectedWorkflow;

  const seedMutation = useMutation({
    mutationFn: () => workflowsApi.seedRegistered(),
    onSuccess: (seededWorkflows) => {
      setSelectedId(seededWorkflows[0]?.id || null);
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["workflow-registry"] });
      toast({ title: "Workflows seeded", description: `${seededWorkflows.length} module workflow(s) are ready to manage.` });
    },
    onError: () => {
      toast({ title: "Seed failed", description: "Unable to seed registered workflows.", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: () => workflowsApi.create({
      ...draft,
      is_active: true,
      is_default: false,
      version: 1,
    }),
    onSuccess: (workflow) => {
      setSelectedId(workflow.id);
      setDraft({ name: "", code: "", model_path: registry[0]?.model_path || "workorders.WorkOrder", description: "" });
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast({ title: "Workflow created", description: `${workflow.name} is ready for states and transitions.` });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (workflow: WorkflowDefinition) => workflowsApi.update(workflow.id, { is_active: !workflow.is_active }),
    onSuccess: (workflow) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["workflow", workflow.id] });
    },
  });

  const addStateMutation = useMutation({
    mutationFn: () => workflowsApi.createState({
      workflow: activeWorkflow!.id,
      key: `state-${(activeWorkflow?.states?.length || 0) + 1}`,
      label: "New State",
      order: (activeWorkflow?.states?.length || 0) + 1,
      is_active: true,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow", activeWorkflow?.id] });
    },
  });

  const states = activeWorkflow?.states || [];
  const transitions = activeWorkflow?.transitions || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Workflow Builder</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage business states, transitions, validation guards, and automation actions.
          </p>
        </div>
        <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
          <DatabaseZap className="mr-2 h-4 w-4" />
          Seed Registered Flows
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs font-medium text-muted-foreground">Registered Models</p>
          <p className="mt-1 text-2xl font-bold">{registry.length}</p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs font-medium text-muted-foreground">Definitions</p>
          <p className="mt-1 text-2xl font-bold">{data?.count || 0}</p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs font-medium text-muted-foreground">Runtime Instances</p>
          <p className="mt-1 text-2xl font-bold">{instances?.count || 0}</p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs font-medium text-muted-foreground">Audit Events</p>
          <p className="mt-1 text-2xl font-bold">{logs?.count || 0}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Create Workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Select value={draft.model_path} onValueChange={(value) => setDraft({ ...draft, model_path: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(modelOptions.length ? modelOptions : [{ value: "workorders.WorkOrder", label: "Work Orders" }]).map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!draft.name || createMutation.isPending}>
                <Plus className="mr-2 h-4 w-4" />
                Create
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading workflows...</p>
            ) : workflows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workflows yet. Seed or create one to begin.</p>
            ) : (
              workflows.map((workflow) => (
                <button
                  key={workflow.id}
                  onClick={() => setSelectedId(workflow.id)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    activeWorkflow?.id === workflow.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{workflow.name}</span>
                    {workflow.is_default && <Badge>Default</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{workflow.model_path}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {workflow.states_count || workflow.states?.length || 0} states · {workflow.transitions_count || workflow.transitions?.length || 0} transitions
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          {activeWorkflow ? (
            <>
              <Card>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold">{activeWorkflow.name}</h2>
                      <Badge variant={activeWorkflow.is_active ? "default" : "secondary"}>
                        {activeWorkflow.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {activeWorkflow.is_default && <Badge variant="outline">Default</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{activeWorkflow.description || activeWorkflow.model_path}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => addStateMutation.mutate()} disabled={addStateMutation.isPending}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add State
                    </Button>
                    <Button variant="outline" onClick={() => toggleActiveMutation.mutate(activeWorkflow)}>
                      <Save className="mr-2 h-4 w-4" />
                      {activeWorkflow.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <GitBranch className="h-4 w-4" />
                      States
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {states.map((state: WorkflowState) => (
                      <div key={state.id} className="flex items-center justify-between rounded-md border p-3">
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: state.color || "#64748b" }} />
                          <div>
                            <p className="font-medium">{state.label}</p>
                            <p className="text-xs text-muted-foreground">{state.key}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {state.is_initial && <Badge variant="outline">Initial</Badge>}
                          {state.is_terminal && <Badge variant="outline">Terminal</Badge>}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Zap className="h-4 w-4" />
                      Transitions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {transitions.map((transition) => (
                      <div key={transition.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{transition.label}</p>
                          <Badge variant={transition.is_active ? "default" : "secondary"}>
                            {transition.is_active ? "Active" : "Off"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {transition.from_state_label} → {transition.to_state_label}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 rounded border px-2 py-1">
                            <ShieldCheck className="h-3 w-3" />
                            {transition.guards?.length || 0} guards
                          </span>
                          <span className="inline-flex items-center gap-1 rounded border px-2 py-1">
                            <Zap className="h-3 w-3" />
                            {transition.actions?.length || 0} actions
                          </span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity className="h-4 w-4" />
                      Runtime Instances
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(instances?.results || []).slice(0, 6).map((instance) => (
                      <div key={instance.id} className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <p className="font-medium">{instance.workflow_name}</p>
                          <p className="text-xs text-muted-foreground">Object #{instance.object_id}</p>
                        </div>
                        <Badge variant="outline">{instance.current_state_label}</Badge>
                      </div>
                    ))}
                    {!instances?.results?.length && (
                      <p className="text-sm text-muted-foreground">Runtime instances appear after workflow-managed records move through a transition.</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheck className="h-4 w-4" />
                      Audit Trail
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(logs?.results || []).slice(0, 6).map((log) => (
                      <div key={log.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{log.from_state} → {log.to_state}</p>
                          <Badge variant={log.result === "success" ? "default" : "secondary"}>{log.result}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {log.actor_name || "System"} · {new Date(log.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                    {!logs?.results?.length && (
                      <p className="text-sm text-muted-foreground">No workflow audit events have been recorded yet.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Select or create a workflow to manage its states and transitions.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
