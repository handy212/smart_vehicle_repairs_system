import type { LucideIcon } from "lucide-react";

export interface NavGroupItem {
  name: string;
  href: string;
  permission?: string;
  permissions?: string[];
  superAdminOnly?: boolean;
  icon?: LucideIcon;
  module?: string;
  description?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavGroupItem[];
  /** Render as a top-level link instead of inside the accordion (e.g. module overview). */
  pinned?: boolean;
}
