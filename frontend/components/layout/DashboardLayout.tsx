"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { SubNav, getSubNavConfig } from "./SubNav";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const subNavConfig = getSubNavConfig(pathname);
  const hasSubNav = !!subNavConfig;
  const [isSubNavCollapsed, setIsSubNavCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Handle hydration - only access localStorage after mount
  useEffect(() => {
    setMounted(true);
    const collapsed = localStorage.getItem("subNavCollapsed") === "true";
    setIsSubNavCollapsed(collapsed);
  }, []);

  // Listen for sub-nav collapse state changes
  useEffect(() => {
    if (!mounted) return;

    const handleStorageChange = () => {
      const collapsed = localStorage.getItem("subNavCollapsed") === "true";
      setIsSubNavCollapsed(collapsed);
    };

    // Listen for changes
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("subNavToggle", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("subNavToggle", handleStorageChange);
    };
  }, [mounted]);

  // Calculate margin: sidebar (256px = w-64) + sub-nav (224px when expanded, 48px when collapsed)
  // Use default collapsed state during SSR to avoid hydration mismatch
  const sidebarWidth = 256; // w-64 = 16rem = 256px
  const subNavWidthExpanded = 224; // w-56 = 14rem = 224px
  const subNavWidthCollapsed = 48; // w-12 = 3rem = 48px
  const collapsed = mounted ? isSubNavCollapsed : false; // Default to expanded during SSR
  const subNavWidth = hasSubNav && !collapsed ? subNavWidthExpanded : hasSubNav && collapsed ? subNavWidthCollapsed : 0;
  const totalMargin = sidebarWidth + subNavWidth;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <Sidebar />
      {hasSubNav && subNavConfig && (
        <SubNav 
          items={subNavConfig.items} 
          title={subNavConfig.title}
          onToggle={(collapsed) => {
            setIsSubNavCollapsed(collapsed);
            if (mounted) {
              localStorage.setItem("subNavCollapsed", collapsed.toString());
              window.dispatchEvent(new Event("subNavToggle"));
            }
          }}
          isCollapsed={mounted ? isSubNavCollapsed : false}
        />
      )}
      <main
        className="pt-16 p-8 transition-all duration-300"
        style={{ marginLeft: `${totalMargin}px` }}
      >
        {children}
      </main>
    </div>
  );
}

