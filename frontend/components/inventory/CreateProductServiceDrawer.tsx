"use client";

import { useRouter } from "next/navigation";
import { ChevronRight, Info } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { PRODUCT_SERVICE_TYPES } from "./product-service-types";

interface CreateProductServiceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProductServiceDrawer({ open, onOpenChange }: CreateProductServiceDrawerProps) {
  const router = useRouter();

  const handleSelect = (urlSlug: string) => {
    onOpenChange(false);
    router.push(`/inventory/products/new/${urlSlug}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0">
        <SheetClose onOpenChange={onOpenChange} />
        <SheetHeader>
          <SheetTitle>Create product/service</SheetTitle>
          <SheetDescription>Choose a type to continue.</SheetDescription>
        </SheetHeader>

        <ul className="flex-1 overflow-y-auto px-2 pb-6">
          {PRODUCT_SERVICE_TYPES.map((option) => {
            const Icon = option.icon;
            return (
              <li key={option.id}>
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1",
                    "hover:bg-muted/80 transition-colors group"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSelect(option.urlSlug)}
                    className="flex flex-1 items-center gap-3 rounded-md px-2 py-2.5 text-left"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="flex-1 font-medium text-foreground group-hover:text-primary transition-colors">
                      {option.title}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
                  </button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label={`About ${option.title}`}
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="left"
                      align="center"
                      className="max-w-xs text-sm leading-relaxed"
                    >
                      {option.description}
                    </PopoverContent>
                  </Popover>
                </div>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
