"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { branchesApi, Branch } from "@/lib/api/branches";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Edit,
  Building2,
  MapPin,
  Phone,
  Mail,
  Clock,
  Users,
  TrendingUp,
  FileText,
  Calendar,
  Package,
  DollarSign,
} from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/lib/hooks/useToast";
import Link from "next/link";
import { format } from "date-fns";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function BranchDetailPage() {
  const router = useRouter();
  const params = useParams();
  const branchId = parseInt(params.id as string);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: branch, isLoading: isLoadingBranch } = useQuery({
    queryKey: ["branch", branchId],
    queryFn: () => branchesApi.get(branchId),
    enabled: !!branchId,
  });

  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["branch-stats", branchId],
    queryFn: () => branchesApi.getStats(branchId),
    enabled: !!branchId,
  });

  const { data: staff, isLoading: isLoadingStaff } = useQuery({
    queryKey: ["branch-staff", branchId],
    queryFn: () => branchesApi.getStaff(branchId),
    enabled: !!branchId,
  });

  const { data: managers, isLoading: isLoadingManagers } = useQuery({
    queryKey: ["branch-managers", branchId],
    queryFn: () => branchesApi.getManagers(branchId),
    enabled: !!branchId,
  });

  if (isLoadingBranch) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-9 w-48 bg-border rounded animate-pulse"></div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <TableSkeleton rows={5} columns={3} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-muted-foreground">Branch not found</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">{branch.name}</h1>
              {branch.is_headquarters && (
                <Badge variant="default" className="bg-primary">
                  Headquarters
                </Badge>
              )}
              <Badge variant={branch.is_active ? "default" : "secondary"}>
                {branch.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Branch Code: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs font-mono">{branch.code}</code>
            </p>
          </div>
        </div>
        <PermissionGuard permission="manage_branches">
          <Link href={`/admin/branches/${branchId}/edit`}>
            <Button>
              <Edit className="w-4 h-4 mr-2" />
              Edit Branch
            </Button>
          </Link>
        </PermissionGuard>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Work Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {stats.work_orders.total}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {stats.work_orders.active} active, {stats.work_orders.completed} completed
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                ${stats.work_orders.total_revenue.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                From completed work orders
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Appointments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {stats.appointments.total}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {stats.appointments.upcoming} upcoming
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" />
                Staff
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {stats.staff.total_staff}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {stats.staff.total_managers} managers
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Branch Information */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Branch Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {branch.description && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Description</label>
                  <p className="mt-1 text-foreground">{branch.description}</p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Address
                  </label>
                  <p className="mt-1 text-foreground">
                    {branch.address}
                    <br />
                    {branch.city}, {branch.state} {branch.zip_code}
                    <br />
                    {branch.country}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Contact
                  </label>
                  <p className="mt-1 text-foreground">
                    {branch.phone}
                    {branch.fax && (
                      <>
                        <br />
                        Fax: {branch.fax}
                      </>
                    )}
                    {branch.email && (
                      <>
                        <br />
                        <a
                          href={`mailto:${branch.email}`}
                          className="text-primary dark:text-primary hover:underline flex items-center gap-1"
                        >
                          <Mail className="w-3 h-3" />
                          {branch.email}
                        </a>
                      </>
                    )}
                  </p>
                </div>
              </div>
              {(branch.opening_time || branch.closing_time) && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Operating Hours
                  </label>
                  <p className="mt-1 text-foreground">
                    {branch.opening_time && branch.closing_time
                      ? `${branch.opening_time} - ${branch.closing_time}`
                      : branch.opening_time || branch.closing_time}
                    {branch.timezone && ` (${branch.timezone})`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Staff */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Staff Members</span>
                <Badge variant="secondary">{staff?.length || 0} staff</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingStaff ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                </div>
              ) : staff && staff.length > 0 ? (
                <div className="space-y-2">
                  {staff.map((member: any) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <div>
                        <p className="font-medium text-foreground">
                          {member.full_name || `${member.first_name} ${member.last_name}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {member.role?.replace("_", " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                        </p>
                      </div>
                      <Link href={`/admin/users/${member.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">No staff assigned</p>
              )}
            </CardContent>
          </Card>

          {/* Managers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Managers</span>
                <Badge variant="secondary">{managers?.length || 0} managers</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingManagers ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                </div>
              ) : managers && managers.length > 0 ? (
                <div className="space-y-2">
                  {managers.map((manager: any) => (
                    <div
                      key={manager.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <div>
                        <p className="font-medium text-foreground">
                          {manager.full_name || `${manager.first_name} ${manager.last_name}`}
                        </p>
                        <p className="text-sm text-muted-foreground">Manager</p>
                      </div>
                      <Link href={`/admin/users/${manager.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">No managers assigned</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/*  Statistics */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Branch Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats && (
                <>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Inventory
                    </label>
                    <p className="mt-1 text-foreground">
                      {stats.inventory.total_parts} parts
                      {stats.inventory.low_stock_parts > 0 && (
                        <Badge variant="danger" className="ml-2">
                          {stats.inventory.low_stock_parts} low stock
                        </Badge>
                      )}
                    </p>
                  </div>
                </>
              )}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Created</label>
                <p className="mt-1 text-sm text-foreground">
                  {branch.created_at
                    ? format(new Date(branch.created_at), "MMMM d, yyyy")
                    : "Unknown"}
                </p>
              </div>
              {branch.updated_at && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
                  <p className="mt-1 text-sm text-foreground">
                    {format(new Date(branch.updated_at), "MMMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

