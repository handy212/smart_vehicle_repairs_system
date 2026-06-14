"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, User, branchesApi } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ArrowLeft, Plus, Edit, Trash2, UserCheck, UserX, Building2, Users, Filter, MoreVertical, Eye, ShieldCheck, ShieldAlert, ShieldOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cn } from "@/lib/utils/cn";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortOrderingParam, toggleSortConfig } from "@/lib/utils/table-sort";

function getErrorDetail(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { detail?: string } } })?.response?.data;
  return data?.detail || fallback;
}

function getUserInitial(user: Pick<User, "first_name" | "last_name" | "email" | "username">): string {
  const char =
    user.first_name?.[0] ||
    user.last_name?.[0] ||
    user.email?.[0] ||
    user.username?.[0];
  return char ? char.toUpperCase() : "?";
}

export default function UsersManagementPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const handleSort = (field: string) => {
    setSortConfig((current) => toggleSortConfig(current, field));
    setPage(1);
  };

  // Fetch branches for filter
  const { data: branchesData } = useQuery({
    queryKey: ["branches", "list"],
    queryFn: () => branchesApi.list({ is_active: true }),
  });

  const branches = branchesData ?? [];

  const { data: usersData, isLoading } = useQuery({
    queryKey: ["admin", "users", roleFilter, statusFilter, branchFilter, page, sortConfig],
    queryFn: () =>
      adminApi.users.list({
        page,
        role: roleFilter !== "all" ? roleFilter : undefined,
        is_active: statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined,
        branch: branchFilter !== "all" ? parseInt(branchFilter) : undefined,
        ordering: sortOrderingParam(sortConfig) || "-created_at",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.users.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getErrorDetail(error, "Failed to delete user"),
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      adminApi.users.update(id, { is_active: isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({
        title: "Success",
        description: "User status updated successfully",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getErrorDetail(error, "Failed to update user"),
        variant: "destructive",
      });
    },
  });

  const reset2FAMutation = useMutation({
    mutationFn: (id: number) => adminApi.users.reset2FA(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({
        title: "Success",
        description: "2FA has been disabled for the user",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getErrorDetail(error, "Failed to reset 2FA"),
        variant: "destructive",
      });
    },
  });

  const users = usersData?.results || [];

  const getRoleVariant = (role: string): BadgeProps["variant"] => {
    const roleMap: Record<string, BadgeProps["variant"]> = {
      admin: "danger",
      manager: "default",
      service_coordinator: "secondary",
      technician: "outline",
      receptionist: "secondary",
      parts_manager: "outline",
      accountant: "outline",
      hr_manager: "outline",
      customer: "outline",
    };
    return roleMap[role] || "outline";
  };

  const getRoleLabel = (role: string) => {
    const roleMap: Record<string, string> = {
      admin: "Admin",
      manager: "Manager",
      service_coordinator: "Service Coordinator",
      technician: "Technician",
      receptionist: "Receptionist",
      parts_manager: "Parts Manager",
      accountant: "Accountant",
      hr_manager: "HR Manager",
      customer: "Customer",
    };
    return roleMap[role] || role;
  };

  const handleDelete = (user: User) => {
    if (confirm(`Are you sure you want to delete user ${user.email}? This action cannot be undone.`)) {
      deleteMutation.mutate(user.id);
    }
  };

  const handleToggleActive = (user: User) => {
    toggleActiveMutation.mutate({
      id: user.id,
      isActive: !user.is_active,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-background min-h-screen">
      <DynamicPageTitle title="User Management" />
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0" aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
              <Link href="/admin" className="hover:text-primary transition-colors">Admin</Link>
              <span>/</span>
              <span className="text-foreground font-medium">Users</span>
            </div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">User Management</h1>
          </div>
        </div>
        <PermissionGuard permission="create_users">
          <Link href="/hr/staff/new">
            <Button size="sm" className="h-8 dark:bg-primary dark:hover:bg-primary/90">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add via HR
            </Button>
          </Link>
        </PermissionGuard>
      </div>



      {/* Filters */}
      <Card className="mx-4 border-none shadow-sm bg-muted/50">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[60px]">
              <Filter className="w-3.5 h-3.5" />
              <span>Filters</span>
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
              <Select
                value={roleFilter}
                onValueChange={(val) => {
                  setRoleFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 text-sm bg-card">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="service_coordinator">Service Coordinator</SelectItem>
                  <SelectItem value="receptionist">Receptionist</SelectItem>
                  <SelectItem value="technician">Technician</SelectItem>
                  <SelectItem value="parts_manager">Parts Manager</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                  <SelectItem value="hr_manager">HR Manager</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 text-sm bg-card">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={branchFilter}
                onValueChange={(val) => {
                  setBranchFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 text-sm bg-card">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id.toString()}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="mx-4 border-t shadow-sm bg-muted border-border">
        <CardHeader className="py-3 px-4 border-b bg-muted/30">
          <CardTitle className="text-sm font-semibold text-card-foreground">
            Users Directory <span className="text-muted-foreground font-normal ml-1">({usersData?.count || 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {users.length > 0 ? (
            <div className="rounded-md">
              <Table>
                <TableHeader className="bg-muted/50 hover:bg-muted/50">
                  <TableRow>
                    <SortableHeader field="last_name" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      User
                    </SortableHeader>
                    <SortableHeader field="role" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      Role
                    </SortableHeader>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Branch</TableHead>
                    <SortableHeader field="is_active" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      Status
                    </SortableHeader>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">2FA</TableHead>
                    <SortableHeader field="created_at" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      Created
                    </SortableHeader>
                    <TableHead className="px-4 h-10 text-right text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} className="group hover:bg-muted/80 hover:bg-muted/50 cursor-pointer transition-colors" onDoubleClick={() => router.push(`/admin/users/${user.id}`)}>
                      <TableCell className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-xs flex-shrink-0 border border-border bg-muted text-muted-foreground border-border">
                            {getUserInitial(user)}
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-foreground">
                              {user.full_name || `${user.first_name} ${user.last_name}`.trim() || user.username}
                            </div>
                            <div className="text-xs text-muted-foreground">{user.email || user.username || "—"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2 whitespace-nowrap">

                        <Badge variant={getRoleVariant(user.role)} className="text-[10px] px-2 py-0.5 font-medium border shadow-none bg-transparent">
                          {getRoleLabel(user.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center text-xs text-muted-foreground">
                          {user.role === "manager" && user.managed_branches_names && user.managed_branches_names.length > 0 ? (
                            <span className="truncate max-w-[150px]" title={user.managed_branches_names.join(", ")}>
                              {user.managed_branches_names.length > 1 ? `${user.managed_branches_names.length} Branches` : user.managed_branches_names[0]}
                            </span>
                          ) : user.branch_name ? (
                            <span>{user.branch_name}</span>
                          ) : (
                            <span className="text-gray-300 text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2 whitespace-nowrap">
                        {user.is_active ? (
                          <div className="flex items-center space-x-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-success/100"></span>
                            <span className="text-xs text-green-700 dark:text-green-400 font-medium">Active</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                            <span className="text-xs text-destructive dark:text-red-400">Inactive</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-2 whitespace-nowrap">
                        {user.two_factor_enabled ? (
                          <div className="flex items-center space-x-1.5" title="2FA is enabled">
                            <ShieldCheck className="w-3.5 h-3.5 text-success dark:text-green-400" />
                            <span className="text-xs text-green-700 dark:text-green-400 font-medium">Enabled</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1.5" title="2FA is disabled">
                            <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Disabled</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(user.created_at), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="px-4 py-2 whitespace-nowrap text-right">
                        <div className="flex justify-end transition-opacity">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-muted hover:bg-muted">
                                <div className="flex gap-0.5">
                                  <div className="h-0.5 w-0.5 rounded-full bg-gray-500" />
                                  <div className="h-0.5 w-0.5 rounded-full bg-gray-500" />
                                  <div className="h-0.5 w-0.5 rounded-full bg-gray-500" />
                                </div>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => router.push(`/admin/users/${user.id}`)}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <PermissionGuard permission="edit_users">
                                <DropdownMenuItem onClick={() => router.push(`/admin/users/${user.id}`)}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit User
                                </DropdownMenuItem>
                              </PermissionGuard>
                              <PermissionGuard permission="edit_users">
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleToggleActive(user)}>
                                  {user.is_active ? <UserX className="w-4 h-4 mr-2" /> : <UserCheck className="w-4 h-4 mr-2" />}
                                  {user.is_active ? 'Deactivate' : 'Activate'}
                                </DropdownMenuItem>
                              </PermissionGuard>
                              <PermissionGuard permission="edit_users">
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (window.confirm(`Are you sure you want to reset and disable 2FA for "${user.full_name || user.email}"?`)) {
                                      reset2FAMutation.mutate(user.id);
                                    }
                                  }}
                                  disabled={!user.two_factor_enabled}
                                >
                                  <ShieldOff className="w-4 h-4 mr-2" />
                                  Reset 2FA
                                </DropdownMenuItem>
                              </PermissionGuard>
                              <PermissionGuard permission="delete_users">
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (window.confirm(`Are you sure you want to delete user "${user.full_name || user.email}"? This action cannot be undone.`)) {
                                      handleDelete(user);
                                    }
                                  }}
                                  className="text-destructive dark:text-red-400"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete User
                                </DropdownMenuItem>
                              </PermissionGuard>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No users found matching your filters.</p>
            </div>
          )}

          {/* Pagination */}
          {usersData && (usersData.next || usersData.previous || usersData.count > 0) && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
              <div className="text-xs text-muted-foreground">
                {((page - 1) * 20) + 1}-{Math.min(page * 20, usersData.count)} of {usersData.count}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!usersData.previous || isLoading}
                  className="h-7 text-xs px-2"
                >
                  Prev
                </Button>
                <div className="text-xs font-medium px-2">Page {page}</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!usersData.next || isLoading}
                  className="h-7 text-xs px-2"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div >
  );
}
