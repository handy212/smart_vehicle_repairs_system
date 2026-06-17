import type { LucideIcon } from "lucide-react";
import type { ElementType } from "react";

export type NavIcon = LucideIcon | ElementType;

export interface NavGroupItem {
  name: string;
  href: string;
  permission?: string;
  permissions?: string[];
  superAdminOnly?: boolean;
  icon?: NavIcon;
  module?: string;
  description?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: NavIcon;
  items: NavGroupItem[];
  /** Render as a top-level link instead of inside the accordion (e.g. module overview). */
  pinned?: boolean;
}
