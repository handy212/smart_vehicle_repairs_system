"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Users, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useToast } from "@/lib/hooks/useToast";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import { format, parseISO } from "date-fns";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortOrderingParam, toggleSortConfig } from "@/lib/utils/table-sort";

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const debouncedSearch = useDebounce(search, 400);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSort = (field: string) => {
    setSortConfig((current) => toggleSortConfig(current, field));
    setPage(1);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["all-contacts", debouncedSearch, page, sortConfig],
    queryFn: () =>
      customersApi.contacts.listAll({
        search: debouncedSearch || undefined,
        page,
        ordering: sortOrderingParam(sortConfig) || "last_name",
      }),
  });

  const contacts: any[] = data?.results ?? (Array.isArray(data) ? data : []);
  const totalCount: number = data?.count ?? contacts.length;
  const pageSize = 25;
  const totalPages = Math.ceil(totalCount / pageSize);

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      customersApi.contacts.patch(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-contacts"] });
      toast({ title: "Updated", description: "Contact status updated." });
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to update contact.", variant: "destructive" }),
  });

  const handleToggle = useCallback(
    (contact: any) => {
      toggleMutation.mutate({ id: contact.id, is_active: !contact.is_active });
    },
    [toggleMutation]
  );

  return (
    <div className="space-y-6 w-full pb-10">
      <DynamicPageTitle title="Contacts" />

      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Link
            href="/customers"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-xl font-bold tracking-tighter text-foreground">Contacts</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          All contacts across all customers
        </p>
      </div>

      {/* Search + count */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name, email, company..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <Users className="w-3.5 h-3.5" />
          <span>{isLoading ? "—" : totalCount} contact{totalCount !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <SortableHeader field="first_name" sortConfig={sortConfig} onSort={handleSort} className="w-[140px] font-semibold text-xs uppercase tracking-wider">
                First Name
              </SortableHeader>
              <SortableHeader field="last_name" sortConfig={sortConfig} onSort={handleSort} className="w-[140px] font-semibold text-xs uppercase tracking-wider">
                Last Name
              </SortableHeader>
              <SortableHeader field="email" sortConfig={sortConfig} onSort={handleSort} className="font-semibold text-xs uppercase tracking-wider">
                Email
              </SortableHeader>
              <SortableHeader field="customer__company_name" sortConfig={sortConfig} onSort={handleSort} className="font-semibold text-xs uppercase tracking-wider">
                Company
              </SortableHeader>
              <SortableHeader field="phone" sortConfig={sortConfig} onSort={handleSort} className="w-[140px] font-semibold text-xs uppercase tracking-wider">
                Phone Number
              </SortableHeader>
              <SortableHeader field="last_login" sortConfig={sortConfig} onSort={handleSort} className="w-[130px] font-semibold text-xs uppercase tracking-wider">
                Last Login
              </SortableHeader>
              <TableHead className="w-[90px] text-center font-semibold text-xs uppercase tracking-wider">Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-muted rounded animate-pulse" style={{ width: `${60 + (j * 13) % 30}%` }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">
                    {debouncedSearch ? "No contacts match your search." : "No contacts found."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact: any) => {
                const customerName =
                  contact.customer_name ||
                  contact.customer?.company_name ||
                  contact.customer?.full_name ||
                  null;
                const customerId =
                  typeof contact.customer === "number"
                    ? contact.customer
                    : contact.customer?.id ?? null;

                return (
                  <TableRow key={contact.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium text-foreground">
                      {contact.first_name || "—"}
                    </TableCell>
                    <TableCell className="text-foreground">
                      {contact.last_name || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {contact.email ? (
                        <a
                          href={`mailto:${contact.email}`}
                          className="hover:text-primary hover:underline transition-colors"
                        >
                          {contact.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {customerName && customerId ? (
                        <Link
                          href={`/customers/${customerId}`}
                          className="text-primary hover:underline text-sm font-medium"
                        >
                          {customerName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {contact.phone || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(contact.last_login)}
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() => handleToggle(contact)}
                        disabled={toggleMutation.isPending}
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
                          contact.is_active !== false
                            ? "bg-primary"
                            : "bg-input"
                        )}
                        role="switch"
                        aria-checked={contact.is_active !== false}
                        title={contact.is_active !== false ? "Deactivate contact" : "Activate contact"}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-card shadow-lg ring-0 transition duration-200 ease-in-out",
                            contact.is_active !== false ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} &mdash; {totalCount} total
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
