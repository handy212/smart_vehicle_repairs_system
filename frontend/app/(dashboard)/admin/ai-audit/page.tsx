"use client";

import { useQuery } from "@tanstack/react-query";
import { aiAuditApi, type AIAuditLog } from "@/lib/api/ai-audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
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
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";

const FEATURE_LABELS: Record<string, string> = {
  comms_suggestion: "Comms suggestion",
  diagnosis_recommendations: "Diagnosis recommendations",
  diagnosis_report: "Diagnosis report",
  inspection_summary: "Inspection summary",
  photo_analysis: "Photo analysis",
  voice_transcription: "Voice transcription",
  sms_assist: "SMS assistant",
  ops_briefing: "Ops briefing",
  ops_exception_triage: "Exception triage",
  ops_return_jobs: "Return jobs",
  ops_capacity: "Capacity",
  ops_ap_cycle: "AP cycle",
  ops_traceability: "Traceability Q&A",
  ops_bottleneck: "Workflow bottleneck",
  ops_exception_draft: "Exception draft",
  other: "Other",
};

function featureLabel(feature: string) {
  return FEATURE_LABELS[feature] || feature.replace(/_/g, " ");
}

export default function AIAuditPage() {
  const [page, setPage] = useState(1);
  const [feature, setFeature] = useState<string>("all");
  const [successFilter, setSuccessFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AIAuditLog | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ai-audit-logs", page, feature, successFilter, search],
    queryFn: () =>
      aiAuditApi.list({
        page,
        feature: feature === "all" ? undefined : feature,
        success: successFilter === "all" ? undefined : successFilter === "true",
        search: search || undefined,
      }),
  });

  const logs = data?.results ?? [];
  const total = data?.count ?? 0;

  return (
    <PermissionPageGuard
      permissions={["view_audit_logs", "manage_settings"]}
      deniedTitle="AI audit access required"
      deniedDescription="You need audit log or settings permissions to view AI activity."
    >
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/integrations?category=ai">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              AI Audit Log
            </h1>
            <p className="text-sm text-muted-foreground">
              Read-only record of Gemini AI calls for compliance and debugging
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Input
              placeholder="Search prompts and outputs…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="max-w-xs"
            />
            <Select value={feature} onValueChange={(v) => { setFeature(v); setPage(1); }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Feature" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All features</SelectItem>
                {Object.keys(FEATURE_LABELS).map((f) => (
                  <SelectItem key={f} value={f}>{featureLabel(f)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={successFilter} onValueChange={(v) => { setSuccessFilter(v); setPage(1); }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Success</SelectItem>
                <SelectItem value="false">Failed</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Feature</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prompt</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(log.created_at), "MMM d, HH:mm")}
                      </TableCell>
                      <TableCell className="text-xs">{featureLabel(log.feature)}</TableCell>
                      <TableCell className="text-xs">{log.user_email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={log.success ? "default" : "destructive"}>
                          {log.success ? "OK" : "Failed"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[240px] truncate">{log.prompt_summary}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => setSelected(log)}>View</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!logs.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No AI audit entries yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {total > 25 && (
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="text-sm self-center">Page {page}</span>
            <Button variant="outline" size="sm" disabled={!data?.next} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}

        <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selected ? featureLabel(selected.feature) : "AI log"}</DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Prompt summary</p>
                  <pre className="whitespace-pre-wrap bg-muted p-3 rounded-md text-xs">{selected.prompt_summary}</pre>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Output summary</p>
                  <pre className="whitespace-pre-wrap bg-muted p-3 rounded-md text-xs">{selected.output_summary || "—"}</pre>
                </div>
                {selected.error_message && (
                  <div>
                    <p className="font-medium text-destructive mb-1">Error</p>
                    <pre className="whitespace-pre-wrap bg-destructive/10 p-3 rounded-md text-xs">{selected.error_message}</pre>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PermissionPageGuard>
  );
}
