"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, User, branchesApi } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { ArrowLeft, Plus, Edit, Trash2, UserCheck, UserX, Building2, Users, Filter, MoreVertical, Eye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
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
import { cn } from "@/lib/utils/cn";

export default function UsersManagementPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  // Fetch branches for filter
  const { data: branchesData } = useQuery({
    queryKey: ["branches", "list"],
    queryFn: () => branchesApi.list({ is_active: true }),
  });

  const branches = Array.isArray(branchesData) ? branchesData : branchesData?.results || [];

  const { data: usersData, isLoading } = useQuery({
    queryKey: ["admin", "users", roleFilter, statusFilter, branchFilter, page],
    queryFn: () =>
      adminApi.users.list({
        page,
        role: roleFilter !== "all" ? roleFilter : undefined,
        is_active: statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined,
        branch: branchFilter !== "all" ? parseInt(branchFilter) : undefined,
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete user",
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const users = usersData?.results || [];

  const getRoleVariant = (role: string) => {
    const roleMap: Record<string, "default" | "secondary" | "outline" | "danger"> = {
      admin: "danger",
      manager: "default",
      service_coordinator: "secondary",
      technician: "outline",
      receptionist: "secondary",
      parts_manager: "outline",
      accountant: "outline",
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
      <div className="flex items-center justify-center h-64 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/admin" className="hover:text-blue-600 transition-colors">Admin</Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">Users</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">User Management</h1>
        </div>
        <Link href="/admin/users/new">
          <Button size="sm" className="h-8 dark:bg-blue-600 dark:hover:bg-blue-700">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add User
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card className="mx-4 border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[60px]">
              <Filter className="w-3.5 h-3.5" />
              <span>Filters</span>
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
              <Select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
                className="h-8 text-sm bg-white dark:bg-gray-900"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="service_coordinator">Service Coordinator</option>
                <option value="receptionist">Receptionist</option>
                <option value="technician">Technician</option>
                <option value="parts_manager">Parts Manager</option>
                <option value="accountant">Accountant</option>
              </Select>
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="h-8 text-sm bg-white dark:bg-gray-900"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
              <Select
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setPage(1);
                }}
                className="h-8 text-sm bg-white dark:bg-gray-900"
              >
                <option value="all">All Branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="mx-4 border-t shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="py-3 px-4 border-b bg-gray-50/30 dark:bg-gray-800/30">
          <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Users Directory <span className="text-muted-foreground font-normal ml-1">({usersData?.count || 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {users.length > 0 ? (
            <div className="rounded-md">
              <Table>
                <TableHeader className="bg-gray-50/50 hover:bg-gray-50/50 dark:bg-gray-900/50">
                  <TableRow>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">User</TableHead>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Role</TableHead>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Branch</TableHead>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Status</TableHead>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Created</TableHead>
                    <TableHead className="px-4 h-10 text-right text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} className="group hover:bg-gray-50/80 dark:hover:bg-gray-800/50 cursor-pointer transition-colors" onDoubleClick={() => router.push(`/admin/users/${user.id}`)}>
                      <TableCell className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs flex-shrink-0 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                            {user.first_name?.[0] || user.email[0].toUpperCase()}
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {user.full_name || `${user.first_name} ${user.last_name}`.trim() || user.username}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2 whitespace-nowrap">
                        <Badge variant={getRoleVariant(user.role) as any} className="text-[10px] px-2 py-0.5 font-medium border shadow-none bg-transparent">
                          {getRoleLabel(user.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                          {user.role === "manager" && user.managed_branches_names && user.managed_branches_names.length > 0 ? (
                            <span className="truncate max-w-[150px]" title={user.managed_branches_names.join(", ")}>
                              {user.managed_branches_names.length > 1 ? `${user.managed_branches_names.length} Branches` : user.managed_branches_names[0]}
                            </span>
                          ) : user.branch_name ? (
                            <span>{user.branch_name}</span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2 whitespace-nowrap">
                        {user.is_active ? (
                          <div className="flex items-center space-x-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                            <span className="text-xs text-green-700 dark:text-green-400 font-medium">Active</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                            <span className="text-xs text-red-600 dark:text-red-400">Inactive</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        {format(new Date(user.created_at), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="px-4 py-2 whitespace-nowrap text-right">
                        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-gray-100 dark:hover:bg-gray-800">
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
                              <DropdownMenuItem onClick={() => router.push(`/admin/users/${user.id}`)}>
                                <Edit className="w-4 h-4 mr-2" />
                                Edit User
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleToggleActive(user)}>
                                {user.is_active ? <UserX className="w-4 h-4 mr-2" /> : <UserCheck className="w-4 h-4 mr-2" />}
                                {user.is_active ? 'Deactivate' : 'Activate'}
                              </DropdownMenuItem>
                              <PermissionGuard permission="delete_users">
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (window.confirm(`Are you sure you want to delete user "${user.full_name || user.email}"? This action cannot be undone.`)) {
                                      handleDelete(user);
                                    }
                                  }}
                                  className="text-red-600 dark:text-red-400"
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
              <p className="text-gray-500 text-sm">No users found matching your filters.</p>
            </div>
          )}

          {/* Pagination */}
          {usersData && (usersData.next || usersData.previous || usersData.count > 0) && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/30">
              <div className="text-xs text-gray-500">
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
    </div>
  );
}
