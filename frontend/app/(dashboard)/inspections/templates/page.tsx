"use client";

import { useQuery } from "@tanstack/react-query";
import { inspectionsApi, InspectionTemplate } from "@/lib/api/inspections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, ArrowLeft, MoreVertical, Eye, Edit, Trash2 } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function InspectionTemplatesPage() {
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);
  
  const { data, isLoading } = useQuery({
    queryKey: ["inspection-templates", "list"],
    queryFn: () => inspectionsApi.templates.list({ page: 1 }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const templates = data?.results || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/inspections">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Inspection Templates</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage inspection templates and categories
            </p>
          </div>
        </div>
        <Link href="/inspections/templates/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Template
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Templates ({data?.count || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No templates</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating a new inspection template.
              </p>
              <div className="mt-6">
                <Link href="/inspections/templates/new">
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    New Template
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">
                        {template.name}
                        {template.is_default && (
                          <Badge className="ml-2 bg-blue-100 text-blue-800">Default</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {template.description || "-"}
                      </TableCell>
                      <TableCell>{template.category_count || 0}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            template.is_active
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }
                        >
                          {template.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>{template.created_by_name || "N/A"}</TableCell>
                      <TableCell>
                        {format(new Date(template.created_at), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="relative flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setActionMenuOpen(actionMenuOpen === template.id ? null : template.id)}
                            className="h-8 w-8 p-0 dark:hover:bg-gray-700"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                          {actionMenuOpen === template.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setActionMenuOpen(null)}
                              />
                              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20">
                                <div className="py-1">
                                  <Link
                                    href={`/inspections/templates/${template.id}`}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    onClick={() => setActionMenuOpen(null)}
                                  >
                                    <Eye className="w-4 h-4" />
                                    View Template
                                  </Link>
                                  <Link
                                    href={`/inspections/templates/${template.id}/edit`}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    onClick={() => setActionMenuOpen(null)}
                                  >
                                    <Edit className="w-4 h-4" />
                                    Edit Template
                                  </Link>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

