"use client";

import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Search, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { searchCustomersForSms, type SmsCustomer } from "./sms-customers";

interface RecipientSelectorProps {
  onSelect: (recipient: {
    type: "user" | "phone";
    value: string;
    name: string;
  }) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function customerName(c: SmsCustomer) {
  return (
    c.company_name ||
    c.full_name ||
    `${c.first_name || ""} ${c.last_name || ""}`.trim() ||
    "Unknown"
  );
}

export function RecipientSelector({
  onSelect,
  placeholder,
  className,
  disabled,
}: RecipientSelectorProps) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isFetching } = useQuery({
    queryKey: ["sms-customer-typeahead", debounced],
    queryFn: () =>
      searchCustomersForSms({
        search: debounced,
        page_size: 20,
      }),
    enabled: isOpen && debounced.length >= 2,
    staleTime: 30_000,
  });

  const matches = (data?.results ?? []).filter((c) => c.phone);

  const isValidPhone = /^\+?[\d\s]+$/.test(search) && search.replace(/\D/g, "").length >= 10;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectCustomer = (customer: SmsCustomer) => {
    if (!customer.phone) return;
    const name = customerName(customer);
    onSelect({
      type: "user",
      value: (customer.user_id ?? customer.id).toString(),
      name: `${name} (${customer.phone})`,
    });
    setSearch("");
    setDebounced("");
    setIsOpen(false);
  };

  const handleAddRawPhone = () => {
    if (!isValidPhone) return;
    onSelect({
      type: "phone",
      value: search.trim(),
      name: search.trim(),
    });
    setSearch("");
    setDebounced("");
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (matches.length > 0) handleSelectCustomer(matches[0]);
    else if (isValidPhone) handleAddRawPhone();
  };

  const showDropdown = isOpen && search.length >= 2;

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Search customer or type phone…"}
          className="h-9 pl-9 text-sm"
          disabled={disabled}
        />
        {search && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0 hover:bg-transparent"
            onClick={() => {
              setSearch("");
              setDebounced("");
              setIsOpen(false);
            }}
          >
            <span className="sr-only">Clear</span>
            <X className="h-3 w-3 text-muted-foreground" />
          </Button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full animate-in fade-in-0 zoom-in-95 rounded-md border border-border bg-background text-foreground shadow-lg">
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-1 p-1">
              {isValidPhone && (
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-sm p-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={handleAddRawPhone}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-warning/15 text-primary">
                    <Plus className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">Add &quot;{search}&quot;</p>
                    <p className="text-xs text-muted-foreground">
                      as manual phone number
                    </p>
                  </div>
                </button>
              )}

              {isValidPhone && matches.length > 0 && (
                <div className="mx-2 my-1 h-px bg-border" />
              )}

              {isFetching && (
                <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching…
                </div>
              )}

              {!isFetching && matches.length > 0 && (
                <>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Customers
                  </div>
                  {matches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 rounded-sm p-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => handleSelectCustomer(c)}
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate font-medium">
                          {customerName(c)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.phone}
                        </p>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {!isFetching && !isValidPhone && matches.length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No customers found.
                  <br />
                  <span className="text-xs">
                    Type a valid phone number to add manually.
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
