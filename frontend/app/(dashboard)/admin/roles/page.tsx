"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, rolesApi, permissionsApi, Role, Permission, AuditLog } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Plus, Edit, Trash2, Users, Shield, Search, MoreVertical, CheckSquare, Square, ChevronDown } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ArrowLeft } from "lucide-react";

// Category display names mapping
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  users: "User Management",
  customers: "Customer Management",
  vehicles: "Vehicle Management",
  appointments: "Appointments",
  workorders: "Work Orders",
  inventory: "Inventory",
  billing: "Billing & Payments",
  reports: "Reports",
  settings: "Settings",
  system: "System Administration",
  documents: "Document Management",
  diagnosis: "Diagnosis",
  inspections: "Inspections",
  notifications: "Notifications",
};

export default function RolesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const canViewAudit = hasPermission("view_audit_logs");

  const { data: rolesData, isLoading } = useQuery({
    queryKey: ["roles", debouncedSearch, statusFilter, typeFilter],
    queryFn: () => rolesApi.list({
      search: debouncedSearch || undefined,
      is_active: statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined,
      is_system: typeFilter === "system" ? true : typeFilter === "custom" ? false : undefined,
    }),
  });

  const roles = rolesData || [];

  const { data: permissionsData = [] } = useQuery({
    queryKey: ["permissions"],
    queryFn: () => permissionsApi.list(),
    enabled: isPermissionsDialogOpen,
  });

  const permissions = permissionsData || [];

  const { data: auditLogsData } = useQuery({
    queryKey: ["auditLogs", "roles"],
    queryFn: () =>
      adminApi.auditLogs.list({
        model_name: "Role",
        page: 1,
      }),
    enabled: canViewAudit,
  });

  const recentAuditLogs: AuditLog[] = auditLogsData?.results?.slice(0, 5) || [];

  // Calculate stats
  const stats = useMemo(() => {
    const totalRoles = roles.length;
    const activeRoles = roles.filter(r => r.is_active).length;
    const systemRoles = roles.filter(r => r.is_system).length;
    const totalUsers = roles.reduce((sum, r) => sum + (r.user_count || 0), 0);
    const totalPermissions = permissions.length;

    return { totalRoles, activeRoles, systemRoles, totalUsers, totalPermissions };
  }, [roles, permissions]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => rolesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast({ title: "Success", description: "Role deleted successfully" });
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete role",
        variant: "destructive",
      });
    },
  });

  const permissionsByCategory = useMemo(() => {
    return permissions.reduce((acc, perm) => {
      const categoryName = CATEGORY_DISPLAY_NAMES[perm.category] || perm.category;
      if (!acc[categoryName]) {
        acc[categoryName] = [];
      }
      acc[categoryName].push(perm);
      return acc;
    }, {} as Record<string, Permission[]>);
  }, [permissions]);

  const handleDelete = (role: Role) => {
    if (role.is_system) {
      toast({
        title: "Error",
        description: "Cannot delete system roles",
        variant: "destructive",
      });
      return;
    }
    if (role.user_count && role.user_count > 0) {
      toast({
        title: "Error",
        description: `Cannot delete role with ${role.user_count} assigned user${role.user_count > 1 ? 's' : ''}. Please reassign users first.`,
        variant: "destructive",
      });
      return;
    }
    if (confirm(`Are you sure you want to delete role "${role.name}"? This action cannot be undone.`)) {
      deleteMutation.mutate(role.id);
    }
  };

  const filteredRoles = useMemo(() => {
    return roles.filter(role => {
      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase();
        return (
          role.name.toLowerCase().includes(searchLower) ||
          role.code.toLowerCase().includes(searchLower) ||
          role.description?.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });
  }, [roles, debouncedSearch]);

  return (
    <div className="space-y-4 bg-background min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/admin" className="hover:text-primary transition-colors">Admin</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Roles</span>
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Roles & Permissions</h1>
        </div>
        <PermissionGuard permission="manage_roles">
          <Button onClick={() => setIsCreateDialogOpen(true)} size="sm" className="h-8 dark:bg-primary dark:hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Role
          </Button>
        </PermissionGuard>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mx-4">
        <Card className="shadow-sm">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Roles</p>
              <p className="text-xl font-bold text-foreground">{stats.totalRoles}</p>
            </div>
            <Shield className="w-5 h-5 text-primary opacity-80" />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Active</p>
              <p className="text-xl font-bold text-success">{stats.activeRoles}</p>
            </div>
            <Shield className="w-5 h-5 text-green-500 opacity-80" />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">System</p>
              <p className="text-xl font-bold text-foreground">{stats.systemRoles}</p>
            </div>
            <Shield className="w-5 h-5 text-muted-foreground opacity-80" />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Users</p>
              <p className="text-xl font-bold text-foreground">{stats.totalUsers}</p>
            </div>
            <Users className="w-5 h-5 text-purple-500 opacity-80" />
          </CardContent>
        </Card>
        <Card className="hidden md:block shadow-sm">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Perms</p>
              <p className="text-xl font-bold text-foreground">{stats.totalPermissions}</p>
            </div>
            <Shield className="w-5 h-5 text-orange-500 opacity-80" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mx-4 border-none shadow-sm bg-muted/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
              <Input
                type="text"
                placeholder="Search roles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm bg-card"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(val) => setStatusFilter(val)}
            >
              <SelectTrigger className="w-[140px] h-8 text-sm bg-card">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(val) => setTypeFilter(val)}
            >
              <SelectTrigger className="w-[140px] h-8 text-sm bg-card">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Roles Table */}
      <Card className="mx-4 border-t shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/30">
          <CardTitle className="text-sm font-semibold text-card-foreground">
            Roles Directory <span className="text-muted-foreground font-normal ml-1">({filteredRoles.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : filteredRoles.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No roles found.</p>
              {search && (
                <Button variant="link" size="sm" onClick={() => setSearch("")} className="mt-1 h-auto p-0">
                  Clear Search
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Code</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Users</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Perms</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-gray-100">
                  {filteredRoles.map((role) => (
                    <tr key={role.id} className="hover:bg-muted/80 transition-colors group">
                      <TableCell className="px-4 py-2.5">
                        <div>
                          <div className="text-sm font-medium text-foreground">{role.name}</div>
                          {role.description && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[200px]">
                              {role.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <code className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono border border-border">
                          {role.code}
                        </code>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <div className="flex items-center space-x-1.5 text-xs text-muted-foreground">
                          <Users className="w-3 h-3 text-muted-foreground" />
                          <span>{role.user_count || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <div className="flex items-center space-x-1.5 text-xs text-muted-foreground">
                          <Shield className="w-3 h-3 text-muted-foreground" />
                          <span>{role.permission_ids?.length || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <span className="text-xs font-mono text-muted-foreground">{role.priority}</span>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {role.is_active ? (
                            <div className="flex items-center space-x-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-success/100"></span>
                              <span className="text-xs text-green-700 font-medium">Active</span>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                              <span className="text-xs text-red-600">Inactive</span>
                            </div>
                          )}
                          {role.is_system && (
                            <Badge variant="secondary" className="text-[9px] px-1 h-4 font-normal bg-muted text-muted-foreground border-border">
                              System
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end space-x-1 transition-opacity">
                          <PermissionGuard permission="manage_permissions">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setSelectedRole(role); setIsPermissionsDialogOpen(true); }}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                              title="Manage Permissions"
                            >
                              <Shield className="w-3.5 h-3.5" />
                            </Button>
                          </PermissionGuard>
                          <PermissionGuard permission="manage_roles">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingRole(role)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-success"
                              title="Edit Role"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                          </PermissionGuard>
                          {!role.is_system && (
                            <PermissionGuard permission="manage_roles">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(role)}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                                title="Delete Role"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </PermissionGuard>
                          )}
                        </div>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Audit Logs - Compact */}
      {canViewAudit && recentAuditLogs.length > 0 && (
        <Card className="mx-4 border-t shadow-sm">
          <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between bg-muted/30">
            <CardTitle className="text-sm font-semibold text-foreground">Recent Role Changes</CardTitle>
            <PermissionGuard permission="view_audit_logs">
              <Link href="/admin/audit-log" className="text-xs text-primary hover:underline">View All</Link>
            </PermissionGuard>
          </CardHeader>
          <div className="divide-y divide-gray-100">
            {recentAuditLogs.map((log) => (
              <div key={log.id} className="px-4 py-2 hover:bg-muted transition-colors flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-1.5 h-1.5 rounded-full ${log.action === 'create' ? 'bg-success/100' :
                    log.action === 'update' ? 'bg-primary' :
                      log.action === 'delete' ? 'bg-red-500' : 'bg-gray-500'
                    }`}></span>
                  <span className="text-xs font-medium text-foreground">{log.object_repr}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide px-1.5 bg-muted rounded-sm">{log.action}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  <span className="font-medium text-muted-foreground mr-2">{log.user_name || "System"}</span>
                  {new Date(log.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Create/Edit Role Dialog */}
      {(isCreateDialogOpen || editingRole) && (
        <RoleDialog
          role={editingRole}
          open={isCreateDialogOpen || !!editingRole}
          onClose={() => {
            setIsCreateDialogOpen(false);
            setEditingRole(null);
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["roles"] });
            setIsCreateDialogOpen(false);
            setEditingRole(null);
          }}
        />
      )}

      {/* Permissions Dialog */}
      {selectedRole && isPermissionsDialogOpen && (
        <PermissionsDialog
          role={selectedRole}
          permissions={permissions}
          permissionsByCategory={permissionsByCategory}
          open={isPermissionsDialogOpen}
          onClose={() => {
            setIsPermissionsDialogOpen(false);
            setSelectedRole(null);
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["roles"] });
          }}
        />
      )}
    </div>
  );
}

function RoleDialog({
  role,
  open,
  onClose,
  onSuccess,
}: {
  role: Role | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(role?.name || "");
  const [code, setCode] = useState(role?.code || "");
  const [description, setDescription] = useState(role?.description || "");
  const [priority, setPriority] = useState(role?.priority?.toString() || "50");
  const [isActive, setIsActive] = useState(role?.is_active ?? true);

  const createMutation = useMutation({

    mutationFn: (data: any) => rolesApi.create(data),
    onSuccess: () => {
      toast({ title: "Success", description: "Role created successfully" });
      onSuccess();
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to create role",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({

    mutationFn: (data: any) => rolesApi.update(role!.id, data),
    onSuccess: () => {
      toast({ title: "Success", description: "Role updated successfully" });
      onSuccess();
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update role",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name,
      code: code.toUpperCase(),
      description,
      priority: parseInt(priority) || 50,
      is_active: isActive,
    };
    if (role) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{role ? "Edit Role" : "Create New Role"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name" className="text-xs">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g., Senior Manager"
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="code" className="text-xs">
              Code <span className="text-red-500">*</span>
            </Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
              required
              disabled={!!role}
              placeholder="e.g., SENIOR_MANAGER"
              className="mt-1 font-mono h-8 text-sm"
            />
            {!role && (
              <p className="text-[10px] text-muted-foreground mt-1">Code cannot be changed after creation</p>
            )}
          </div>
          <div>
            <Label htmlFor="description" className="text-xs">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the role's responsibilities..."
              className="mt-1 text-sm bg-muted border-border"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="priority" className="text-xs">Priority</Label>
              <Input
                id="priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 h-8 text-sm"
                min="0"
                max="100"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">0-100 scale</p>
            </div>
            <div className="flex items-end h-10 pb-1">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_active"
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(checked === true)}
                />
                <Label htmlFor="is_active" className="cursor-pointer text-sm">
                  Active Status
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8">
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="h-8 py-0"
            >
              {role ? "Update Role" : "Create Role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({
  role,
  permissions,
  permissionsByCategory,
  open,
  onClose,
  onSuccess,
}: {
  role: Role;
  permissions: Permission[];
  permissionsByCategory: Record<string, Permission[]>;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [selectedPermissions, setSelectedPermissions] = useState<number[]>(
    role.permission_ids || []
  );
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(Object.keys(permissionsByCategory))
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Keep expanded categories in sync when permissions change
  useEffect(() => {
    setExpandedCategories(new Set(Object.keys(permissionsByCategory)));
  }, [permissionsByCategory]);

  const updateMutation = useMutation({
    mutationFn: (permissionIds: number[]) => rolesApi.assignPermissions(role.id, permissionIds),
    onSuccess: () => {
      toast({ title: "Success", description: "Permissions updated successfully" });
      onSuccess();
      onClose();
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update permissions",
        variant: "destructive",
      });
    },
  });

  // Filter permissions by search
  const filteredCategories = useMemo(() => {
    if (!search && selectedCategory === "all") {
      return permissionsByCategory;
    }

    const filtered: Record<string, Permission[]> = {};
    Object.entries(permissionsByCategory).forEach(([category, perms]) => {
      if (selectedCategory !== "all" && category !== selectedCategory) {
        return;
      }

      const filteredPerms = perms.filter(perm =>
        perm.name.toLowerCase().includes(search.toLowerCase()) ||
        perm.code.toLowerCase().includes(search.toLowerCase()) ||
        perm.description?.toLowerCase().includes(search.toLowerCase())
      );

      if (filteredPerms.length > 0) {
        filtered[category] = filteredPerms;
      }
    });

    return filtered;
  }, [permissionsByCategory, search, selectedCategory]);

  const togglePermission = (permissionId: number) => {
    setSelectedPermissions((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId]
    );
  };

  const toggleCategory = (category: string, permissions: Permission[]) => {
    const categoryPermIds = permissions.map(p => p.id);
    const allSelected = categoryPermIds.every(id => selectedPermissions.includes(id));

    if (allSelected) {
      // Deselect all in category
      setSelectedPermissions(prev => prev.filter(id => !categoryPermIds.includes(id)));
    } else {
      // Select all in category
      setSelectedPermissions(prev => {
        const newSet = new Set(prev);
        categoryPermIds.forEach(id => newSet.add(id));
        return Array.from(newSet);
      });
    }
  };

  const toggleAll = () => {
    if (selectedPermissions.length === permissions.length) {
      setSelectedPermissions([]);
    } else {
      setSelectedPermissions(permissions.map(p => p.id));
    }
  };

  const toggleExpanded = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const handleSave = () => {
    updateMutation.mutate(selectedPermissions);
  };

  const selectedCount = selectedPermissions.length;
  const totalCount = permissions.length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center justify-between">
            <span>Manage Permissions <span className="text-muted-foreground font-normal mx-2">|</span> {role.name}</span>
            <span className="text-xs font-normal bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-orange-100">
              {selectedCount} Selected
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col bg-muted/50">
          {/* Search and Filter Bar */}
          <div className="flex items-center gap-3 px-6 py-3 border-b bg-card">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
              <Input
                type="text"
                placeholder="Search permissions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
            <Select
              value={selectedCategory}
              onValueChange={(val) => setSelectedCategory(val)}
            >
              <SelectTrigger className="w-[180px] h-8 text-sm">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.keys(permissionsByCategory).map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleAll}
              className="h-8 text-xs"
            >
              {selectedCount === totalCount ? (
                <>
                  <Square className="w-3.5 h-3.5 mr-1.5" />
                  Deselect All
                </>
              ) : (
                <>
                  <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                  Select All
                </>
              )}
            </Button>
          </div>

          {/* Permissions List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {Object.keys(filteredCategories).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Shield className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No permissions found</p>
              </div>
            ) : (
              Object.entries(filteredCategories).map(([category, perms]) => {
                const categoryPermIds = perms.map(p => p.id);
                const selectedInCategory = categoryPermIds.filter(id => selectedPermissions.includes(id)).length;
                const allSelected = categoryPermIds.length > 0 && selectedInCategory === categoryPermIds.length;
                const isExpanded = expandedCategories.has(category);

                return (
                  <Card key={category} className="overflow-hidden border shadow-sm group">
                    <div className="flex items-center justify-between p-3 bg-card hover:bg-muted transition-colors cursor-pointer border-b border-border" onClick={() => toggleExpanded(category)}>
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); toggleCategory(category, perms); }}
                          className="h-6 w-6 p-0 hover:bg-muted"
                        >
                          {allSelected ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : selectedInCategory > 0 ? (
                            <div className="w-4 h-4 bg-orange-100 border border-orange-400 rounded flex items-center justify-center">
                              <span className="block w-2 h-2 bg-primary rounded-sm"></span>
                            </div>
                          ) : (
                            <Square className="w-4 h-4 text-muted-foreground" />
                          )}
                        </Button>
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">{category}</h4>
                          <p className="text-[10px] text-muted-foreground mt-0">
                            {selectedInCategory} / {perms.length} selected
                          </p>
                        </div>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                      />
                    </div>
                    {isExpanded && (
                      <div className="p-3 bg-muted/30">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {perms.map((perm) => (
                            <label
                              key={perm.id}
                              className={`flex items-start space-x-2.5 p-2 rounded border cursor-pointer transition-all ${selectedPermissions.includes(perm.id) ? 'bg-primary/10 border-orange-200 shadow-sm' : 'bg-card border-border hover:border-orange-200'}`}
                            >
                              <Checkbox
                                checked={selectedPermissions.includes(perm.id)}
                                onCheckedChange={() => togglePermission(perm.id)}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-medium text-foreground leading-tight">
                                  {perm.name}
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-0.5 truncate" title={perm.description}>
                                  {perm.description || perm.code}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t bg-card">
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold">{selectedCount}</span> permissions to be saved
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8">
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="h-8"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
