"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useTheme } from "@/lib/hooks/useTheme";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { SubNav, getSubNavConfig } from "./SubNav";
import { AccountingSubNav } from "./AccountingSubNav";
import { useKeyboardShortcut } from "@/lib/hooks/useKeyboardShortcut";
import { KeyboardShortcutsDialog } from "@/components/ui/keyboard-shortcuts-dialog";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Suspense } from "react";
import { ErrorBoundary } from "@/components/error-boundary";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const subNavConfig = getSubNavConfig(pathname);
  const isAccountingRoute = pathname?.startsWith("/accounting") ?? false;
  const hasSubNav = !!subNavConfig;
  const [isSubNavCollapsed, setIsSubNavCollapsed] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);

  // Handle hydration - only access localStorage after mount
  useEffect(() => {
    const initializeLayout = () => {
      setMounted(true);
      const subNavCollapsed = localStorage.getItem("subNavCollapsed") === "true";
      setIsSubNavCollapsed(subNavCollapsed);

      const sidebarCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
      setIsSidebarCollapsed(sidebarCollapsed);

      checkDesktop();
    };

    // Check if desktop (debounced)
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(true);
      }
    };

    let resizeTimer: ReturnType<typeof setTimeout>;
    const debouncedCheckDesktop = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(checkDesktop, 150);
    };

    const initFrame = window.requestAnimationFrame(initializeLayout);
    window.addEventListener("resize", debouncedCheckDesktop);
    return () => {
      window.cancelAnimationFrame(initFrame);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", debouncedCheckDesktop);
    };
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

  // Calculate margin: sidebar + sub-nav
  const { theme: activeTheme } = useTheme();
  const [sidebarWidthExpanded, setSidebarWidthExpanded] = useState(256);
  const [headerHeight, setHeaderHeight] = useState(64);

  useEffect(() => {
    if (mounted) {
      const frameId = window.requestAnimationFrame(() => {
        const style = getComputedStyle(document.documentElement);
        const width = parseInt(style.getPropertyValue('--sidebar-width'));
        const height = parseInt(style.getPropertyValue('--header-height'));
        if (!isNaN(width)) setSidebarWidthExpanded(width);
        if (!isNaN(height)) setHeaderHeight(height);
      });

      return () => window.cancelAnimationFrame(frameId);
    }
  }, [mounted, activeTheme]);

  const sidebarWidthCollapsed = 64; // w-16 = 4rem = 64px
  const sidebarCollapsed = mounted ? isSidebarCollapsed : false; // Default to expanded during SSR
  const sidebarWidth = sidebarCollapsed ? sidebarWidthCollapsed : sidebarWidthExpanded;

  const subNavWidthExpanded = 208; // w-52 = 13rem = 208px
  const subNavWidthCollapsed = 48; // w-12 = 3rem = 48px
  const subNavCollapsed = mounted ? isSubNavCollapsed : false; // Default to expanded during SSR
  const subNavWidth = hasSubNav && !subNavCollapsed ? subNavWidthExpanded : hasSubNav && subNavCollapsed ? subNavWidthCollapsed : 0;

  // On mobile, sidebar is hidden by default (overlay), on desktop it's always visible
  const totalMargin = isDesktop ? sidebarWidth + subNavWidth : 0;

  return (
    <div className="dashboard-shell">
      <div className="print:hidden">
        <Navbar
          onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          isSidebarOpen={isSidebarOpen}
          onToggleCollapse={() => {
            const newCollapsed = !isSidebarCollapsed;
            setIsSidebarCollapsed(newCollapsed);
            if (mounted) {
              localStorage.setItem("sidebarCollapsed", newCollapsed.toString());
            }
          }}
          isSidebarCollapsed={mounted ? isSidebarCollapsed : false}
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
        {hasSubNav && isAccountingRoute ? (
          <AccountingSubNav
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
        ) : (
          hasSubNav &&
          subNavConfig && (
            <SubNav
              items={subNavConfig.items}
              title={subNavConfig.title}
              module={subNavConfig.module}
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
          )
        )}
      </div>
      <main
        className="dashboard-content min-h-screen px-2 py-0 pb-2 transition-all duration-300 sm:px-3 sm:pb-3 lg:px-3 lg:pb-4 print:!m-0 print:!p-0"
        style={{
          marginLeft: isDesktop ? `${totalMargin}px` : '0',
          paddingTop: !isDesktop && hasSubNav ? `${headerHeight + 56}px` : `${headerHeight + 16}px`
        }}
      >
        <Suspense fallback={null}>
          <ProgressBar />
        </Suspense>

        <ErrorBoundary>
          <div key={pathname} className="animate-in fade-in slide-in-from-bottom-1 duration-500 ease-out fill-mode-both">
            {children}
          </div>
        </ErrorBoundary>
      </main>

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        open={showShortcutsDialog}
        onOpenChange={setShowShortcutsDialog}
      />

      <CommandPalette />
    </div>
  );
}
