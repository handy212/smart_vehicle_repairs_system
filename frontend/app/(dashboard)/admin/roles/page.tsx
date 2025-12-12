"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, rolesApi, permissionsApi, Role, Permission, AuditLog } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Edit, Trash2, Users, Shield, Search, MoreVertical, CheckSquare, Square, ChevronDown } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { Checkbox } from "@/components/ui/checkbox";

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Roles & Permissions</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage user roles and assign permissions
          </p>
        </div>
        <PermissionGuard permission="manage_roles">
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Role
          </Button>
        </PermissionGuard>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Roles</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalRoles}</p>
              </div>
              <Shield className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Roles</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.activeRoles}</p>
              </div>
              <Shield className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">System Roles</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.systemRoles}</p>
              </div>
              <Shield className="w-8 h-8 text-gray-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Users</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalUsers}</p>
              </div>
              <Users className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Permissions</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalPermissions}</p>
              </div>
              <Shield className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search roles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-[150px]"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-[150px]"
            >
              <option value="all">All Types</option>
              <option value="system">System</option>
              <option value="custom">Custom</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Roles Table */}
      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          </CardContent>
        </Card>
      ) : filteredRoles.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No roles found.</p>
              {search && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setSearch("")}
                >
                  Clear Search
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Roles ({filteredRoles.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100">{role.name}</div>
                          {role.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {role.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono">
                          {role.code}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Users className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">{role.user_count || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Shield className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">{role.permission_ids?.length || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{role.priority}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={role.is_active ? "default" : "secondary"}>
                            {role.is_active ? "Active" : "Inactive"}
                          </Badge>
                          {role.is_system && (
                            <Badge variant="secondary" className="text-xs">
                              System
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="relative flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setActionMenuOpen(actionMenuOpen === role.id ? null : role.id)}
                            className="h-8 w-8 p-0"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                          {actionMenuOpen === role.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setActionMenuOpen(null)}
                              />
                              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20">
                                <div className="py-1">
                                  <PermissionGuard permission="manage_permissions">
                                    <button
                                      onClick={() => {
                                        setSelectedRole(role);
                                        setIsPermissionsDialogOpen(true);
                                        setActionMenuOpen(null);
                                      }}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    >
                                      <Shield className="w-4 h-4" />
                                      Manage Permissions
                                    </button>
                                  </PermissionGuard>
                                  <PermissionGuard permission="manage_roles">
                                    <button
                                      onClick={() => {
                                        setEditingRole(role);
                                        setActionMenuOpen(null);
                                      }}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    >
                                      <Edit className="w-4 h-4" />
                                      Edit Role
                                    </button>
                                  </PermissionGuard>
                                  {!role.is_system && (
                                    <PermissionGuard permission="manage_roles">
                                      <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                                      <button
                                        onClick={() => {
                                          handleDelete(role);
                                          setActionMenuOpen(null);
                                        }}
                                        disabled={deleteMutation.isPending}
                                        className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                        Delete Role
                                      </button>
                                    </PermissionGuard>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Audit Logs */}
      {canViewAudit && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Role Audit Logs</CardTitle>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Latest changes to roles (showing last {recentAuditLogs.length || 0})
                </p>
              </div>
              <PermissionGuard permission="view_audit_logs">
                <a
                  href="/admin/audit-log"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View full audit log
                </a>
              </PermissionGuard>
            </div>
          </CardHeader>
          <CardContent>
            {recentAuditLogs.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No recent changes.</p>
            ) : (
              <div className="space-y-3">
                {recentAuditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{log.action}</Badge>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {log.object_repr}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {log.user_name || log.user_email || "System"} • {new Date(log.timestamp).toLocaleString()}
                        </div>
                        {log.changes_display && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap">
                            {log.changes_display}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? "Edit Role" : "Create New Role"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g., Senior Manager"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="code">
              Code <span className="text-red-500">*</span>
            </Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
              required
              disabled={!!role}
              placeholder="e.g., SENIOR_MANAGER"
              className="mt-1 font-mono"
            />
            {!role && (
              <p className="text-xs text-gray-500 mt-1">Code cannot be changed after creation</p>
            )}
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the role's responsibilities and permissions..."
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1"
                min="0"
                max="100"
              />
              <p className="text-xs text-gray-500 mt-1">Higher priority roles have more access</p>
            </div>
            <div className="flex items-end">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_active"
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(checked === true)}
                />
                <Label htmlFor="is_active" className="cursor-pointer">
                  Active
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
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
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Permissions - {role.name}</DialogTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Select the permissions for this role ({selectedCount} of {totalCount} selected)
          </p>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Search and Filter Bar */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search permissions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-[200px]"
            >
              <option value="all">All Categories</option>
              {Object.keys(permissionsByCategory).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleAll}
            >
              {selectedCount === totalCount ? (
                <>
                  <Square className="w-4 h-4 mr-2" />
                  Deselect All
                </>
              ) : (
                <>
                  <CheckSquare className="w-4 h-4 mr-2" />
                  Select All
                </>
              )}
            </Button>
          </div>

          {/* Permissions List */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {Object.keys(filteredCategories).length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Shield className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No permissions found</p>
                {permissions.length === 0 && (
                  <p className="text-sm mt-2">Loading permissions...</p>
                )}
              </div>
            ) : (
              Object.entries(filteredCategories).map(([category, perms]) => {
              const categoryPermIds = perms.map(p => p.id);
              const selectedInCategory = categoryPermIds.filter(id => selectedPermissions.includes(id)).length;
              const allSelected = categoryPermIds.length > 0 && selectedInCategory === categoryPermIds.length;
              const isExpanded = expandedCategories.has(category);

              return (
                <Card key={category} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleCategory(category, perms)}
                          className="h-8 px-2"
                        >
                          {allSelected ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </Button>
                        <div>
                          <CardTitle className="text-base">{category}</CardTitle>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {selectedInCategory} of {perms.length} selected
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpanded(category)}
                      >
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                        />
                      </Button>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {perms.map((perm) => (
                          <label
                            key={perm.id}
                            className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                          >
                            <Checkbox
                              checked={selectedPermissions.includes(perm.id)}
                              onCheckedChange={() => togglePermission(perm.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {perm.name}
                              </div>
                              {perm.description && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {perm.description}
                                </div>
                              )}
                              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">
                                {perm.code}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })
            )}
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {selectedCount} of {totalCount} permissions selected
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save Permissions"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
