"use client";

import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { GroupedNavPanel } from "./GroupedNavPanel";
import { SIDEBAR_NAV_GROUPS } from "./sidebar-nav-groups";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({
  isOpen = true,
  onClose,
  isCollapsed = false,
}: SidebarProps) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed bottom-0 left-0 z-40 flex flex-col transition-all duration-200 ease-out",
          "lg:translate-x-0",
          "border-r border-[color:var(--sidebar-border)] bg-[var(--sidebar)]",
          isOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "w-16" : ""
        )}
        style={{
          top: "var(--header-height)",
          width: isCollapsed ? "64px" : "var(--sidebar-width)",
        }}
      >
        <div
          className={cn(
            "flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-muted",
            isCollapsed && "px-1.5 py-3"
          )}
        >
          <GroupedNavPanel
            groups={SIDEBAR_NAV_GROUPS}
            layout="sidebar"
            isCollapsed={isCollapsed}
            onItemClick={() => {
              if (
                onClose &&
                typeof window !== "undefined" &&
                window.innerWidth < 1024
              ) {
                onClose();
              }
            }}
          />
        </div>

        {!isCollapsed && (
          <div className="flex-shrink-0 border-t border-[color:var(--sidebar-border)] p-3">
            <Link
              href="/help"
              className="flex items-center rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <HelpCircle className="mr-2.5 h-4 w-4" />
              Help & Support
            </Link>
          </div>
        )}

        {isCollapsed && (
          <div className="flex-shrink-0 border-t border-[color:var(--sidebar-border)] p-2">
            <Link
              href="/help"
              title="Help & Support"
              className="flex w-full items-center justify-center rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <HelpCircle className="h-5 w-5" />
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
