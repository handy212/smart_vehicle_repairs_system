"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, User } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ArrowLeft, Plus, Search, Edit, Trash2, UserCheck, UserX, Building2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";

export default function UsersManagementPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ["admin", "users", roleFilter, statusFilter, searchTerm, page],
    queryFn: () =>
      adminApi.users.list({
        page,
        role: roleFilter !== "all" ? roleFilter : undefined,
        is_active: statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined,
        search: searchTerm || undefined,
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
            <Button variant="outline" className="dark:border-gray-700 dark:text-gray-200">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage user accounts, roles, branches, and permissions
            </p>
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
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                <Input
                  placeholder="Search users by name, email, or username..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>
            <Select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="service_coordinator">Service Coordinator</option>
              <option value="receptionist">Receptionist</option>
              <option value="technician">Technician</option>
              <option value="parts_manager">Parts Manager</option>
              <option value="accountant">Accountant</option>
              <option value="customer">Customer</option>
            </Select>
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">
            Users ({usersData?.count || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {users.length > 0 ? (
            <div className="space-y-4">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="h-12 w-12 rounded-full bg-blue-600 dark:bg-blue-700 flex items-center justify-center text-white font-medium text-lg">
                      {user.first_name?.[0] || user.email[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {user.full_name || `${user.first_name} ${user.last_name}`.trim() || user.username}
                        </h3>
                        <Badge variant={getRoleVariant(user.role) as any} className="text-xs">
                          {getRoleLabel(user.role)}
                        </Badge>
                        {user.is_active ? (
                          <Badge variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="danger" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{user.email}</p>
                      {user.phone && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{user.phone}</p>
                      )}
                      
                      {/* Branch Information */}
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        {user.role === "manager" && user.managed_branches_names && user.managed_branches_names.length > 0 ? (
                          <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                            <Building2 className="w-3 h-3" />
                            <span>Branches: {user.managed_branches_names.join(", ")}</span>
                          </div>
                        ) : user.branch_name ? (
                          <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                            <Building2 className="w-3 h-3" />
                            <span>{user.branch_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500 italic">No branch assigned</span>
                        )}
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          Created: {format(new Date(user.created_at), "MMM dd, yyyy")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(user)}
                      disabled={toggleActiveMutation.isPending}
                      className="dark:hover:bg-gray-700"
                      title={user.is_active ? "Deactivate user" : "Activate user"}
                    >
                      {user.is_active ? (
                        <UserX className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      ) : (
                        <UserCheck className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      )}
                    </Button>
                    <Link href={`/admin/users/${user.id}`}>
                      <Button variant="ghost" size="sm" className="dark:hover:bg-gray-700" title="Edit user">
                        <Edit className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(user)}
                      disabled={deleteMutation.isPending}
                      className="dark:hover:bg-gray-700"
                      title="Delete user"
                    >
                      <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
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
                  variant="outline"
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
                  variant="outline"
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
