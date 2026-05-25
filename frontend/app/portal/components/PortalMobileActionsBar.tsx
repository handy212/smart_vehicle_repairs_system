"use client";

import Link from "next/link";
import { Calendar, CreditCard, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const MOBILE_ACTIONS = [
  { label: "Book", href: "/portal/book", icon: Calendar },
  { label: "Pay", href: "/portal/invoices", icon: CreditCard },
  { label: "Add vehicle", href: "/portal/vehicles/new", icon: Plus },
] as const;

/** Sticky bottom shortcuts for portal on small screens. */
export function PortalMobileActionsBar() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md lg:hidden"
      aria-label="Portal quick navigation"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {MOBILE_ACTIONS.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex min-h-[44px] min-w-[72px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg",
              "text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
