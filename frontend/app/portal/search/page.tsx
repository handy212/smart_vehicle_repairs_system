"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchApi } from "@/lib/api/search";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Car, Calendar, FileText, CreditCard, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useSearchParams, useRouter } from "next/navigation";

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(searchQuery, 500);

  const { data: searchResults, isLoading } = useQuery({
    queryKey: ["portal", "search", debouncedQuery],
    queryFn: () => searchApi.global(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/portal/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const results = searchResults?.results || [];
  
  // Group results by type
  const groupedResults = {
    vehicles: results.filter((r: any) => r.type === "vehicle"),
    appointments: results.filter((r: any) => r.type === "appointment"),
    invoices: results.filter((r: any) => r.type === "invoice"),
    estimates: results.filter((r: any) => r.type === "estimate"),
    payments: results.filter((r: any) => r.type === "payment"),
  };

  const totalResults = results.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Search</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search across your vehicles, appointments, invoices, and more
        </p>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search vehicles, appointments, invoices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-6 text-lg"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter at least 2 characters to search
            </p>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading && debouncedQuery.length >= 2 ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-48 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : debouncedQuery.length >= 2 && totalResults > 0 ? (
        <div className="space-y-6">
          {/* Results Summary */}
          <div className="text-sm text-muted-foreground">
            Found {totalResults} result{totalResults !== 1 ? "s" : ""} for "{debouncedQuery}"
          </div>

          {/* Vehicles */}
          {groupedResults.vehicles.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center">
                <Car className="w-5 h-5 mr-2" />
                Vehicles ({groupedResults.vehicles.length})
              </h2>
              <div className="space-y-3">
                {groupedResults.vehicles.map((result: any) => (
                  <Link key={result.id} href={result.url?.replace("/dashboard", "/portal") || `/portal/vehicles/${result.id}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-foreground">
                              {result.title}
                            </h3>
                            {result.subtitle && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {result.subtitle}
                              </p>
                            )}
                          </div>
                          <Car className="w-6 h-6 text-primary" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Appointments */}
          {groupedResults.appointments.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center">
                <Calendar className="w-5 h-5 mr-2" />
                Appointments ({groupedResults.appointments.length})
              </h2>
              <div className="space-y-3">
                {groupedResults.appointments.map((result: any) => (
                  <Link key={result.id} href={result.url?.replace("/dashboard", "/portal") || `/portal/appointments/${result.id}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-foreground">
                              {result.title}
                            </h3>
                            {result.subtitle && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {result.subtitle}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            {result.status && (
                              <Badge variant={result.status === "completed" ? "success" : "warning"}>
                                {result.status}
                              </Badge>
                            )}
                            <Calendar className="w-6 h-6 text-primary" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Invoices */}
          {groupedResults.invoices.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Invoices ({groupedResults.invoices.length})
              </h2>
              <div className="space-y-3">
                {groupedResults.invoices.map((result: any) => (
                  <Link key={result.id} href={result.url?.replace("/dashboard", "/portal") || `/portal/invoices/${result.id}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-foreground">
                              {result.title}
                            </h3>
                            {result.subtitle && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {result.subtitle}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            {result.status && (
                              <Badge
                                variant={
                                  result.status === "paid"
                                    ? "success"
                                    : result.status === "pending"
                                    ? "warning"
                                    : "secondary"
                                }
                              >
                                {result.status}
                              </Badge>
                            )}
                            <FileText className="w-6 h-6 text-primary" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Estimates */}
          {groupedResults.estimates.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Estimates ({groupedResults.estimates.length})
              </h2>
              <div className="space-y-3">
                {groupedResults.estimates.map((result: any) => (
                  <Link key={result.id} href={result.url?.replace("/dashboard", "/portal") || `/portal/estimates/${result.id}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-foreground">
                              {result.title}
                            </h3>
                            {result.subtitle && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {result.subtitle}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            {result.status && (
                              <Badge
                                variant={
                                  result.status === "approved"
                                    ? "success"
                                    : result.status === "pending"
                                    ? "warning"
                                    : "secondary"
                                }
                              >
                                {result.status}
                              </Badge>
                            )}
                            <FileText className="w-6 h-6 text-primary" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Payments */}
          {groupedResults.payments.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center">
                <CreditCard className="w-5 h-5 mr-2" />
                Payments ({groupedResults.payments.length})
              </h2>
              <div className="space-y-3">
                {groupedResults.payments.map((result: any) => (
                  <Link key={result.id} href={result.url?.replace("/dashboard", "/portal") || `/portal/payments`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-foreground">
                              {result.title}
                            </h3>
                            {result.subtitle && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {result.subtitle}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            {result.status && (
                              <Badge variant={result.status === "completed" ? "success" : "warning"}>
                                {result.status}
                              </Badge>
                            )}
                            <CreditCard className="w-6 h-6 text-primary" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : debouncedQuery.length >= 2 && totalResults === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">No results found</p>
            <p className="text-sm text-muted-foreground">
              Try searching with different keywords
            </p>
          </CardContent>
        </Card>
      ) : debouncedQuery.length < 2 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">Start searching</p>
            <p className="text-sm text-muted-foreground">
              Enter at least 2 characters to search across your vehicles, appointments, invoices,
              and more
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

