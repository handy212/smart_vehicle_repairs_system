"use client";

import { DashboardRequirementsPanel } from "./DashboardRequirementsPanel";
import { useDashboardQuickAccess } from "@/lib/hooks/useDashboardQuickAccess";

export function DashboardShortcutBar() {
  const { isHidden, hide } = useDashboardQuickAccess();

  if (isHidden) {
    return null;
  }

  return <DashboardRequirementsPanel onHide={hide} />;
}
