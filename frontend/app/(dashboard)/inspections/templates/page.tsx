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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function InspectionTemplatesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["inspection-templates", "list"],
    queryFn: () => inspectionsApi.templates.list({ page: 1 }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const templates = data?.results || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
            <span>/</span>
            <Link href="/inspections" className="hover:text-primary transition-colors">Inspections</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Templates</span>
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Inspection Templates</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inspections">
            <Button variant="outline" size="sm" className="h-9">
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              Back
            </Button>
          </Link>
          <Link href="/inspections/templates/new">
            <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-white shadow-sm">
              <Plus className="w-3.5 h-3.5 mr-2" />
              New Template
            </Button>
          </Link>
        </div>
      </div>

      <Card className="border-none shadow-sm bg-muted/50">
        <CardContent className="p-0">
          {templates.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-2 text-sm font-medium text-foreground">No templates</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Get started by creating a new inspection template.
              </p>
              <div className="mt-6">
                <Link href="/inspections/templates/new">
                  <Button size="sm">
                    <Plus className="w-3.5 h-3.5 mr-2" />
                    New Template
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Name</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Description</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Categories</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Created By</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Created</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id} className="hover:bg-muted/50 hover:bg-muted/50">
                      <TableCell className="font-medium text-sm text-foreground py-2.5">
                        {template.name}
                        {template.is_default && (
                          <Badge variant="outline" className="ml-2 bg-primary/10 text-primary border-orange-200 text-[10px] px-1.5 py-0">Default</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs py-2.5 max-w-[200px] truncate">
                        {template.description || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-card-foreground py-2.5">{template.category_count || 0}</TableCell>
                      <TableCell className="py-2.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-2 py-0.5 font-medium border shadow-none ${template.is_active
                            ? "bg-success/10 text-green-700 border-green-200"
                            : "bg-muted text-muted-foreground border-border"
                            }`}
                        >
                          {template.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-2.5">{template.created_by_name || "N/A"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground py-2.5">
                        {format(new Date(template.created_at), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="text-right py-2.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-7 w-7 p-0 hover:bg-muted">
                              <span className="sr-only">Open menu</span>
                              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[160px]">
                            <DropdownMenuItem asChild>
                              <Link href={`/inspections/templates/${template.id}`} className="cursor-pointer">
                                <Eye className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                                View
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/inspections/templates/${template.id}/edit`} className="cursor-pointer">
                                <Edit className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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

