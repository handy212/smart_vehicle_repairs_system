"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, SystemBackup } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Download, RotateCcw, Trash2, Database, FileArchive, HardDrive } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export default function BackupsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [backupTypeFilter, setBackupTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: backupsData, isLoading } = useQuery({
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
      toast({ title: "Success", description: "Backup created successfully" });
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
      toast({
        title: "Download Ready",
        description: `Backup file: ${data.file_path}`,
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
        title: "Success",
        description: "Restore initiated. Please restart the server for changes to take effect.",
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
        return <HardDrive className="w-4 h-4" />;
      case "database":
        return <Database className="w-4 h-4" />;
      case "media":
        return <FileArchive className="w-4 h-4" />;
      default:
        return <FileArchive className="w-4 h-4" />;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "default";
      case "in_progress":
        return "warning";
      case "failed":
        return "danger";
      default:
        return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">System Backups</h1>
          <p className="text-sm text-gray-500 mt-1">Manage system backups and restore points</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Backup
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex space-x-4">
            <div>
              <Label htmlFor="backup_type">Backup Type</Label>
              <Select
                id="backup_type"
                value={backupTypeFilter}
                onChange={(e) => {
                  setBackupTypeFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All Types</option>
                <option value="full">Full Backup</option>
                <option value="database">Database Only</option>
                <option value="media">Media Files Only</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="in_progress">In Progress</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Backups ({totalBackups})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                      No backups found
                    </TableCell>
                  </TableRow>
                ) : (
                  backups.map((backup) => (
                    <TableRow key={backup.id}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getBackupTypeIcon(backup.backup_type)}
                          <span className="capitalize">{backup.backup_type}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(backup.status)}>
                          {backup.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {backup.file_size_display || backup.file_size
                          ? backup.file_size_display || `${(backup.file_size! / 1024 / 1024).toFixed(2)} MB`
                          : "N/A"}
                      </TableCell>
                      <TableCell>{backup.created_by_name || "System"}</TableCell>
                      <TableCell>
                        {format(new Date(backup.started_at), "MMM dd, yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        {backup.completed_at
                          ? format(new Date(backup.completed_at), "MMM dd, yyyy HH:mm")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {backup.status === "completed" && (
                            <>
                              <Button
                               variant="secondary"
                                size="sm"
                                onClick={() => downloadMutation.mutate(backup.id)}
                                disabled={downloadMutation.isPending}
                              >
                                <Download className="w-4 h-4 mr-1" />
                                Download
                              </Button>
                              <Button
                               variant="secondary"
                                size="sm"
                                onClick={() => handleRestore(backup)}
                                disabled={restoreMutation.isPending}
                              >
                                <RotateCcw className="w-4 h-4 mr-1" />
                                Restore
                              </Button>
                            </>
                          )}
                          <Button
                           variant="secondary"
                            size="sm"
                            onClick={() => handleDelete(backup)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {isCreateDialogOpen && (
        <CreateBackupDialog
          open={isCreateDialogOpen}
          onClose={() => setIsCreateDialogOpen(false)}
          onCreate={(data) => createMutation.mutate(data)}
          isCreating={createMutation.isPending}
        />
      )}
    </div>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create System Backup</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="backup_type" className="block mb-2">
                Backup Type *
              </Label>
              <Select
                id="backup_type"
                value={backupType}
                onChange={(e) => setBackupType(e.target.value)}
                className="w-full"
              >
                <option value="full">Full Backup (Database + Media)</option>
                <option value="database">Database Only</option>
                <option value="media">Media Files Only</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="notes" className="block mb-2">
                Notes (Optional)
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full"
                placeholder="Add any notes about this backup..."
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button"variant="secondary" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isCreating}>
            {isCreating ? "Creating..." : "Create Backup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

