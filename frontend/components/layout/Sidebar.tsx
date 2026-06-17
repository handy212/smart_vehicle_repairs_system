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
          "fixed left-0 bottom-0 z-40 flex flex-col transition-all duration-200 ease-out",
          "lg:translate-x-0",
          "border-r border-border bg-background shadow-sm",
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
            "flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800",
            isCollapsed && "px-2"
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
          <div className="flex-shrink-0 border-t border-border bg-background p-4">
            <Link
              href="/help"
              className="flex items-center px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <HelpCircle className="w-4 h-4 mr-2" />
              Help & Support
            </Link>
          </div>
        )}

        {isCollapsed && (
          <div className="flex-shrink-0 border-t border-border bg-background p-2">
            <Link
              href="/help"
              title="Help & Support"
              className="w-full flex items-center justify-center p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <HelpCircle className="w-5 h-5" />
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
