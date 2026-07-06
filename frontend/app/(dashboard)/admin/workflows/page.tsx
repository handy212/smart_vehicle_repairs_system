"use client";

import { GitBranch, Lock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WorkflowAdminPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Workflow Builder</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Parked while the repair workflow is stabilized through the existing work-order rules.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit gap-1">
          <Lock className="h-3.5 w-3.5" />
          Disabled
        </Badge>
      </div>

      <Alert>
        <GitBranch className="h-4 w-4" />
        <AlertTitle>Workflow app is not active</AlertTitle>
        <AlertDescription>
          The backend workflow builder remains in the codebase for a later phase, but the application currently enforces
          work-order stages through the existing hardcoded transition rules.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Operating Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Work orders continue to use the validated repair flow in the work-order, diagnosis, billing, and parts modules.</p>
          <p>Re-enable this screen only after the core flow is stable and the workflow engine is ready to become the source of truth.</p>
        </CardContent>
      </Card>
    </div>
  );
}
