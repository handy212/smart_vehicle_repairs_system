"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, SystemBackup } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Download, RotateCcw, Trash2, Database, FileArchive, HardDrive, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

import { useCurrency } from "@/lib/hooks/useCurrency";
export default function BackupsPage() {
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [backupTypeFilter, setBackupTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: backupsData, isLoading, refetch } = useQuery({
    queryKey: ["backups", backupTypeFilter, statusFilter, page],
    queryFn: () =>
      adminApi.backups.list({
        page,
        backup_type: backupTypeFilter !== "all" ? backupTypeFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      }),
  });

  const backups = backupsData?.results || [];
  const totalBackups = backupsData?.count || 0;

  const createMutation = useMutation({
    mutationFn: (data: { backup_type: string; notes?: string }) => adminApi.backups.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast({ title: "Success", description: "Backup process started successfully" });
      setIsCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to create backup",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.backups.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast({ title: "Success", description: "Backup deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete backup",
        variant: "destructive",
      });
    },
  });

  const downloadMutation = useMutation({
    mutationFn: (id: number) => adminApi.backups.download(id),
    onSuccess: (data) => {
      // In a real implementation, this would trigger a file download
      // Simulating download/toast
      if (data.file_path) {
        window.open(data.file_path, '_blank');
      }
      toast({
        title: "Download Started",
        description: `Backup file downloading...`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to download backup",
        variant: "destructive",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => adminApi.backups.restore(id),
    onSuccess: () => {
      toast({
        title: "Restore Initiated",
        description: "The system is being restored. You may be logged out.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to restore backup",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (backup: SystemBackup) => {
    if (confirm(`Are you sure you want to delete backup "${backup.backup_type}" from ${format(new Date(backup.started_at), "MMM dd, yyyy")}?`)) {
      deleteMutation.mutate(backup.id);
    }
  };

  const handleRestore = (backup: SystemBackup) => {
    if (
      confirm(
        `Are you sure you want to restore from this backup? This will overwrite current data. This action cannot be undone.`
      )
    ) {
      restoreMutation.mutate(backup.id);
    }
  };

  const getBackupTypeIcon = (type: string) => {
    switch (type) {
      case "full":
        return <HardDrive className="w-3.5 h-3.5 text-primary" />;
      case "database":
        return <Database className="w-3.5 h-3.5 text-purple-600" />;
      case "media":
        return <FileArchive className="w-3.5 h-3.5 text-primary" />;
      default:
        return <FileArchive className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "in_progress":
        return "secondary";
      case "failed":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-4 bg-background min-h-screen">
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">System Backups</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage database and file backups</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 w-8 p-0" title="Refresh">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </Button>
          <PermissionGuard permission="manage_settings">
            <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-primary hover:bg-primary/90 text-white h-8 text-xs">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Create Backup
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {/* Filters */}
      <Card className="mx-4 border-none shadow-sm bg-muted/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="backup_type" className="text-xs font-medium text-muted-foreground">Type:</Label>
              <Select
                value={backupTypeFilter}
                onValueChange={(val) => {
                  setBackupTypeFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[140px] text-xs bg-card">
                  <SelectValue placeholder="Filter Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="full">Full Backup</SelectItem>
                  <SelectItem value="database">Database Only</SelectItem>
                  <SelectItem value="media">Media Files Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="status" className="text-xs font-medium text-muted-foreground">Status:</Label>
              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[140px] text-xs bg-card">
                  <SelectValue placeholder="Filter Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="px-4 pb-8">
          <Card className="border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/80">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[140px]">Type</TableHead>
                    <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[100px]">Status</TableHead>
                    <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[100px]">Size</TableHead>
                    <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[140px]">Created By</TableHead>
                    <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Started</TableHead>
                    <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Completed</TableHead>
                    <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-xs text-muted-foreground">
                        <div className="flex flex-col items-center justify-center">
                          <Database className="w-6 h-6 text-gray-300 mb-2" />
                          No backups found matching your criteria
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    backups.map((backup) => (
                      <TableRow key={backup.id} className="hover:bg-muted/50 transition-colors group">
                        <TableCell className="px-4 py-2.5">
                          <div className="flex items-center space-x-2">
                            <div className="p-1.5 bg-border rounded-md">
                              {getBackupTypeIcon(backup.backup_type)}
                            </div>
                            <span className="text-xs font-medium text-card-foreground capitalize">{backup.backup_type}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <Badge variant={getStatusVariant(backup.status) as any} className="text-[10px] h-5 px-2 rounded-full font-medium">
                            {backup.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                          {backup.file_size_display || backup.file_size
                            ? backup.file_size_display || `{formatCurrency((backup.file_size! / 1024 / 1024))} MB`
                            : "-"}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-xs text-muted-foreground">
                          {backup.created_by_name || "System"}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-xs text-muted-foreground">
                          {format(new Date(backup.started_at), "MMM d, yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-xs text-muted-foreground">
                          {backup.completed_at
                            ? format(new Date(backup.completed_at), "MMM d, yyyy HH:mm")
                            : "-"}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1 transition-opacity">
                            {backup.status === "completed" && (
                              <>
                                <PermissionGuard permission="manage_settings">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => downloadMutation.mutate(backup.id)}
                                    disabled={downloadMutation.isPending}
                                    title="Download"
                                    className="h-7 w-7 p-0"
                                  >
                                    <Download className="w-3.5 h-3.5 text-primary" />
                                  </Button>
                                </PermissionGuard>
                                <PermissionGuard permission="manage_settings">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRestore(backup)}
                                    disabled={restoreMutation.isPending}
                                    title="Restore"
                                    className="h-7 w-7 p-0"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5 text-primary" />
                                  </Button>
                                </PermissionGuard>
                              </>
                            )}
                            <PermissionGuard permission="manage_settings">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(backup)}
                                disabled={deleteMutation.isPending}
                                title="Delete"
                                className="h-7 w-7 p-0 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </PermissionGuard>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div >
      )
      }

      {
        isCreateDialogOpen && (
          <CreateBackupDialog
            open={isCreateDialogOpen}
            onClose={() => setIsCreateDialogOpen(false)}
            onCreate={(data) => createMutation.mutate(data)}
            isCreating={createMutation.isPending}
          />
        )
      }
    </div >
  );
}

function CreateBackupDialog({
  open,
  onClose,
  onCreate,
  isCreating,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { backup_type: string; notes?: string }) => void;
  isCreating: boolean;
}) {
  const [backupType, setBackupType] = useState("full");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({ backup_type: backupType, notes: notes || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 dark:bg-orange-900/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Create System Backup</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Select backup type and options
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="backup_type" className="text-xs font-semibold text-foreground">
              Backup Type
            </Label>
            <Select
              value={backupType}
              onValueChange={(val) => setBackupType(val)}
            >
              <SelectTrigger id="backup_type" className="w-full h-9 text-sm">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full Backup (Database + Media)</SelectItem>
                <SelectItem value="database">Database Only (Faster)</SelectItem>
                <SelectItem value="media">Media Files Only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              {backupType === 'full' && "Recommended for complete system restoration."}
              {backupType === 'database' && "Includes all tables and records. Does not include uploaded files."}
              {backupType === 'media' && "Includes only uploaded images and documents."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs font-semibold text-foreground">
              Notes
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full resize-none text-sm"
              placeholder="e.g., Pre-deployment backup..."
            />
          </div>
        </form>
        <DialogFooter className="px-6 py-3 border-t border-border bg-muted/50">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isCreating} className="h-8">
            Cancel
          </Button>
          <Button type="submit" size="sm" onClick={handleSubmit} disabled={isCreating} className="h-8 bg-primary hover:bg-primary/90 text-white">
            {isCreating ? "Creating..." : "Start Backup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
