/** Soft tinted tiles for category icons — workshop semantic accents */

export interface NavCategoryStyle {
  bg: string;
  icon: string;
  ring: string;
}

export const NAV_CATEGORY_STYLES: Record<string, NavCategoryStyle> = {
  main: {
    bg: "bg-primary/10",
    icon: "text-primary",
    ring: "ring-primary/25",
  },
  operations: {
    bg: "bg-info/15",
    icon: "text-info",
    ring: "ring-info/25",
  },
  finance: {
    bg: "bg-success/15",
    icon: "text-success",
    ring: "ring-success/25",
  },
  "tools-reports": {
    bg: "bg-warning/15",
    icon: "text-warning",
    ring: "ring-warning/25",
  },
  communications: {
    bg: "bg-info/15",
    icon: "text-info",
    ring: "ring-info/25",
  },
  system: {
    bg: "bg-muted",
    icon: "text-muted-foreground",
    ring: "ring-border",
  },
  catalog: {
    bg: "bg-warning/15",
    icon: "text-warning",
    ring: "ring-warning/25",
  },
  procurement: {
    bg: "bg-info/15",
    icon: "text-info",
    ring: "ring-info/25",
  },
  receivables: {
    bg: "bg-success/15",
    icon: "text-success",
    ring: "ring-success/25",
  },
  payables: {
    bg: "bg-destructive/10",
    icon: "text-destructive",
    ring: "ring-destructive/25",
  },
  organization: {
    bg: "bg-primary/10",
    icon: "text-primary",
    ring: "ring-primary/25",
  },
  configuration: {
    bg: "bg-muted",
    icon: "text-muted-foreground",
    ring: "ring-border",
  },
  "data-audit": {
    bg: "bg-info/15",
    icon: "text-info",
    ring: "ring-info/25",
  },
  overview: {
    bg: "bg-primary/10",
    icon: "text-primary",
    ring: "ring-primary/25",
  },
  people: {
    bg: "bg-warning/15",
    icon: "text-warning",
    ring: "ring-warning/25",
  },
  workforce: {
    bg: "bg-info/15",
    icon: "text-info",
    ring: "ring-info/25",
  },
  development: {
    bg: "bg-warning/15",
    icon: "text-warning",
    ring: "ring-warning/25",
  },
  assets: {
    bg: "bg-success/15",
    icon: "text-success",
    ring: "ring-success/25",
  },
  hub: {
    bg: "bg-primary/10",
    icon: "text-primary",
    ring: "ring-primary/25",
  },
  analytics: {
    bg: "bg-info/15",
    icon: "text-info",
    ring: "ring-info/25",
  },
  ledger: {
    bg: "bg-success/15",
    icon: "text-success",
    ring: "ring-success/25",
  },
  banking: {
    bg: "bg-info/15",
    icon: "text-info",
    ring: "ring-info/25",
  },
  planning: {
    bg: "bg-warning/15",
    icon: "text-warning",
    ring: "ring-warning/25",
  },
  reports: {
    bg: "bg-warning/15",
    icon: "text-warning",
    ring: "ring-warning/25",
  },
  governance: {
    bg: "bg-muted",
    icon: "text-muted-foreground",
    ring: "ring-border",
  },
  services: {
    bg: "bg-info/15",
    icon: "text-info",
    ring: "ring-info/25",
  },
  billing: {
    bg: "bg-success/15",
    icon: "text-success",
    ring: "ring-success/25",
  },
};

export const DEFAULT_NAV_CATEGORY_STYLE: NavCategoryStyle = {
  bg: "bg-primary/10",
  icon: "text-primary",
  ring: "ring-primary/25",
};

export function getNavCategoryStyle(groupId: string): NavCategoryStyle {
  return NAV_CATEGORY_STYLES[groupId] ?? DEFAULT_NAV_CATEGORY_STYLE;
}
