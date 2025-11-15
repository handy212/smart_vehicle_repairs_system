"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { SubNav, getSubNavConfig } from "./SubNav";
import { useKeyboardShortcut } from "@/lib/hooks/useKeyboardShortcut";
import { KeyboardShortcutsDialog } from "@/components/ui/keyboard-shortcuts-dialog";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const subNavConfig = getSubNavConfig(pathname);
  const hasSubNav = !!subNavConfig;
  const [isSubNavCollapsed, setIsSubNavCollapsed] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);

  // Handle hydration - only access localStorage after mount
  useEffect(() => {
    setMounted(true);
    const subNavCollapsed = localStorage.getItem("subNavCollapsed") === "true";
    setIsSubNavCollapsed(subNavCollapsed);
    
    const sidebarCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
    setIsSidebarCollapsed(sidebarCollapsed);
    
    // Check if desktop
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
      // On desktop, sidebar should always be open
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(true);
      }
    };
    
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcut([
    {
      key: '?',
      shift: true,
      callback: () => setShowShortcutsDialog(true),
      description: 'Show keyboard shortcuts',
    },
    {
      key: 'b',
      ctrl: true,
      callback: () => {
        if (isDesktop) {
          setIsSidebarCollapsed(!isSidebarCollapsed);
        } else {
          setIsSidebarOpen(!isSidebarOpen);
        }
      },
      description: 'Toggle sidebar',
    },
  ]);

  // Listen for show keyboard shortcuts event
  useEffect(() => {
    const handleShowShortcuts = () => setShowShortcutsDialog(true);
    window.addEventListener('showKeyboardShortcuts', handleShowShortcuts);
    return () => window.removeEventListener('showKeyboardShortcuts', handleShowShortcuts);
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

  // Calculate margin: sidebar (256px = w-64 when expanded, 80px = w-20 when collapsed) + sub-nav (224px when expanded, 48px when collapsed)
  // Use default collapsed state during SSR to avoid hydration mismatch
  const sidebarWidthExpanded = 256; // w-64 = 16rem = 256px
  const sidebarWidthCollapsed = 80; // w-20 = 5rem = 80px
  const sidebarCollapsed = mounted ? isSidebarCollapsed : false; // Default to expanded during SSR
  const sidebarWidth = sidebarCollapsed ? sidebarWidthCollapsed : sidebarWidthExpanded;
  
  const subNavWidthExpanded = 224; // w-56 = 14rem = 224px
  const subNavWidthCollapsed = 48; // w-12 = 3rem = 48px
  const subNavCollapsed = mounted ? isSubNavCollapsed : false; // Default to expanded during SSR
  const subNavWidth = hasSubNav && !subNavCollapsed ? subNavWidthExpanded : hasSubNav && subNavCollapsed ? subNavWidthCollapsed : 0;
  
  // On mobile, sidebar is hidden by default (overlay), on desktop it's always visible
  const totalMargin = isDesktop ? sidebarWidth + subNavWidth : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar 
        onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
      />
      <Sidebar 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isCollapsed={mounted ? isSidebarCollapsed : false}
        onToggleCollapse={() => {
          const newCollapsed = !isSidebarCollapsed;
          setIsSidebarCollapsed(newCollapsed);
          if (mounted) {
            localStorage.setItem("sidebarCollapsed", newCollapsed.toString());
          }
        }}
      />
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
          sidebarCollapsed={mounted ? isSidebarCollapsed : false}
        />
      )}
      <main
        className="min-h-screen px-4 py-0 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 transition-all duration-300"
        style={{ 
          marginLeft: `${totalMargin}px`,
          paddingTop: '5rem' // 80px to account for header (64px) + extra space for mobile search
        }}
      >
        {children}
      </main>
      
      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        open={showShortcutsDialog}
        onOpenChange={setShowShortcutsDialog}
      />
    </div>
  );
}

