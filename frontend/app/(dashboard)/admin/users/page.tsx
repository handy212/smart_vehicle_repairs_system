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

export default function UsersManagementPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);

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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 dark:bg-gray-900 min-h-screen p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin">
            <Button variant="secondary" className="dark:border-gray-700 dark:text-gray-200">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
          </div>
        </div>
        <Link href="/admin/users/new">
          <Button className="dark:bg-blue-600 dark:hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Filter className="w-4 h-4" />
              <span>Filters:</span>
            </div>
            <Select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white flex-1"
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
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white flex-1"
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
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white flex-1"
            >
              <option value="all">All Branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">
            Users ({usersData?.count || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Branch
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-blue-600 dark:bg-blue-700 flex items-center justify-center text-white font-medium text-sm flex-shrink-0">
                            {user.first_name?.[0] || user.email[0].toUpperCase()}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {user.full_name || `${user.first_name} ${user.last_name}`.trim() || user.username}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                            {user.phone && (
                              <div className="text-xs text-gray-400 dark:text-gray-500">{user.phone}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={getRoleVariant(user.role) as any} className="text-xs">
                          {getRoleLabel(user.role)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.role === "manager" && user.managed_branches_names && user.managed_branches_names.length > 0 ? (
                          <div className="flex items-center gap-1 text-sm text-gray-900 dark:text-gray-100">
                            <Building2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            <span>{user.managed_branches_names.join(", ")}</span>
                          </div>
                        ) : user.branch_name ? (
                          <div className="flex items-center gap-1 text-sm text-gray-900 dark:text-gray-100">
                            <Building2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            <span>{user.branch_name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500 italic">No branch</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.is_active ? (
                          <Badge variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="danger" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {format(new Date(user.created_at), "MMM dd, yyyy")}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="relative flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setActionMenuOpen(actionMenuOpen === user.id ? null : user.id)}
                            className="h-8 w-8 p-0 dark:hover:bg-gray-700"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                          {actionMenuOpen === user.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setActionMenuOpen(null)}
                              />
                              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20">
                                <div className="py-1">
                                  <Link
                                    href={`/admin/users/${user.id}`}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    onClick={() => setActionMenuOpen(null)}
                                  >
                                    <Eye className="w-4 h-4" />
                                    View Details
                                  </Link>
                                  <Link
                                    href={`/admin/users/${user.id}`}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    onClick={() => setActionMenuOpen(null)}
                                  >
                                    <Edit className="w-4 h-4" />
                                    Edit User
                                  </Link>
                                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                                  <button
                                    onClick={() => {
                                      handleToggleActive(user);
                                      setActionMenuOpen(null);
                                    }}
                                    disabled={toggleActiveMutation.isPending}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                  >
                                    {user.is_active ? (
                                      <>
                                        <UserX className="w-4 h-4" />
                                        Deactivate User
                                      </>
                                    ) : (
                                      <>
                                        <UserCheck className="w-4 h-4" />
                                        Activate User
                                      </>
                                    )}
                                  </button>
                                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                                  <PermissionGuard permission="delete_users">
                                    <button
                                      onClick={() => {
                                        if (window.confirm(`Are you sure you want to delete user "${user.full_name || user.email}"? This action cannot be undone.`)) {
                                          handleDelete(user);
                                        }
                                        setActionMenuOpen(null);
                                      }}
                                      disabled={deleteMutation.isPending}
                                      className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      Delete User
                                    </button>
                                  </PermissionGuard>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No users found</p>
            </div>
          )}

          {/* Pagination */}
          {usersData && (usersData.next || usersData.previous) && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Showing {users.length} of {usersData.count} users
              </div>
              <div className="flex items-center space-x-2">
                <Button
                 variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!usersData.previous || isLoading}
                  className="dark:border-gray-700 dark:text-gray-200"
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Page {page}
                </span>
                <Button
                 variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!usersData.next || isLoading}
                  className="dark:border-gray-700 dark:text-gray-200"
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
