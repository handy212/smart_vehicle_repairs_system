"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { searchApi, SearchResult } from "@/lib/api/search";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, Car, Wrench, Calendar, Receipt, Package } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

const typeIcons: Record<string, React.ReactNode> = {
  customer: <Users className="w-5 h-5" />,
  vehicle: <Car className="w-5 h-5" />,
  workorder: <Wrench className="w-5 h-5" />,
  appointment: <Calendar className="w-5 h-5" />,
  invoice: <Receipt className="w-5 h-5" />,
  part: <Package className="w-5 h-5" />,
};

const typeLabels: Record<string, string> = {
  customer: "Customer",
  vehicle: "Vehicle",
  workorder: "Work Order",
  appointment: "Appointment",
  invoice: "Invoice",
  part: "Part",
};

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");

  const { data: searchData, isLoading } = useQuery({
    queryKey: ["search", query],
    queryFn: () => searchApi.global(query),
    enabled: query.length >= 2,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.length >= 2) {
      setQuery(searchInput);
      router.push(`/search?q=${encodeURIComponent(searchInput)}`);
    }
  };

  const groupedResults = searchData?.results.reduce((acc, result) => {
    if (!acc[result.type]) {
      acc[result.type] = [];
    }
    acc[result.type].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>) || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Search</h1>
        <p className="text-sm text-gray-500 mt-1">Search across all records</p>
      </div>

      {/* Search Form */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                type="text"
                placeholder="Search customers, vehicles, work orders, appointments..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={searchInput.length < 2}>
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Search Results */}
      {query.length < 2 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Enter at least 2 characters to search</p>
            </div>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          </CardContent>
        </Card>
      ) : searchData && searchData.results.length > 0 ? (
        <div className="space-y-6">
          <div className="text-sm text-gray-600">
            Found {searchData.total} result{searchData.total !== 1 ? "s" : ""} for &quot;{query}&quot;
          </div>

          {Object.entries(groupedResults).map(([type, results]) => (
            <Card key={type}>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  {typeIcons[type]}
                  <span>{typeLabels[type] || type} ({results.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {results.map((result) => (
                    <Link
                      key={`${result.type}-${result.id}`}
                      href={result.url}
                      className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{result.title}</h3>
                          {result.subtitle && (
                            <p className="text-sm text-gray-600 mt-1">{result.subtitle}</p>
                          )}
                        </div>
                        <div className="ml-4 flex items-center space-x-2">
                          {result.status && (
                            <Badge variant="secondary" className="text-xs">
                              {result.status}
                            </Badge>
                          )}
                          <Badge variant="default" className="text-xs capitalize">
                            {typeLabels[result.type] || result.type}
                          </Badge>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-900 font-medium mb-2">No results found</p>
              <p className="text-gray-500 text-sm">
                Try different keywords or check your spelling
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

