/** Soft tinted tiles for category icons — reads like app tiles, not bare glyphs */

export interface NavCategoryStyle {
  bg: string;
  icon: string;
  ring: string;
}

export const NAV_CATEGORY_STYLES: Record<string, NavCategoryStyle> = {
  main: {
    bg: "bg-violet-500/15 dark:bg-violet-500/20",
    icon: "text-violet-600 dark:text-violet-400",
    ring: "ring-violet-500/25",
  },
  operations: {
    bg: "bg-blue-500/15 dark:bg-blue-500/20",
    icon: "text-blue-600 dark:text-blue-400",
    ring: "ring-blue-500/25",
  },
  finance: {
    bg: "bg-emerald-500/15 dark:bg-emerald-500/20",
    icon: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/25",
  },
  "tools-reports": {
    bg: "bg-amber-500/15 dark:bg-amber-500/20",
    icon: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/25",
  },
  communications: {
    bg: "bg-sky-500/15 dark:bg-sky-500/20",
    icon: "text-sky-600 dark:text-sky-400",
    ring: "ring-sky-500/25",
  },
  system: {
    bg: "bg-slate-500/15 dark:bg-slate-500/20",
    icon: "text-slate-600 dark:text-slate-400",
    ring: "ring-slate-500/25",
  },
  catalog: {
    bg: "bg-orange-500/15 dark:bg-orange-500/20",
    icon: "text-orange-600 dark:text-orange-400",
    ring: "ring-orange-500/25",
  },
  procurement: {
    bg: "bg-teal-500/15 dark:bg-teal-500/20",
    icon: "text-teal-600 dark:text-teal-400",
    ring: "ring-teal-500/25",
  },
  receivables: {
    bg: "bg-green-500/15 dark:bg-green-500/20",
    icon: "text-green-600 dark:text-green-400",
    ring: "ring-green-500/25",
  },
  payables: {
    bg: "bg-red-500/15 dark:bg-red-500/20",
    icon: "text-red-600 dark:text-red-400",
    ring: "ring-red-500/25",
  },
  organization: {
    bg: "bg-indigo-500/15 dark:bg-indigo-500/20",
    icon: "text-indigo-600 dark:text-indigo-400",
    ring: "ring-indigo-500/25",
  },
  configuration: {
    bg: "bg-slate-500/15 dark:bg-slate-500/20",
    icon: "text-slate-600 dark:text-slate-400",
    ring: "ring-slate-500/25",
  },
  "data-audit": {
    bg: "bg-cyan-500/15 dark:bg-cyan-500/20",
    icon: "text-cyan-600 dark:text-cyan-400",
    ring: "ring-cyan-500/25",
  },
  overview: {
    bg: "bg-violet-500/15 dark:bg-violet-500/20",
    icon: "text-violet-600 dark:text-violet-400",
    ring: "ring-violet-500/25",
  },
  people: {
    bg: "bg-pink-500/15 dark:bg-pink-500/20",
    icon: "text-pink-600 dark:text-pink-400",
    ring: "ring-pink-500/25",
  },
  workforce: {
    bg: "bg-blue-500/15 dark:bg-blue-500/20",
    icon: "text-blue-600 dark:text-blue-400",
    ring: "ring-blue-500/25",
  },
  development: {
    bg: "bg-amber-500/15 dark:bg-amber-500/20",
    icon: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/25",
  },
  assets: {
    bg: "bg-emerald-500/15 dark:bg-emerald-500/20",
    icon: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/25",
  },
  hub: {
    bg: "bg-indigo-500/15 dark:bg-indigo-500/20",
    icon: "text-indigo-600 dark:text-indigo-400",
    ring: "ring-indigo-500/25",
  },
  analytics: {
    bg: "bg-purple-500/15 dark:bg-purple-500/20",
    icon: "text-purple-600 dark:text-purple-400",
    ring: "ring-purple-500/25",
  },
  ledger: {
    bg: "bg-emerald-500/15 dark:bg-emerald-500/20",
    icon: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/25",
  },
  banking: {
    bg: "bg-sky-500/15 dark:bg-sky-500/20",
    icon: "text-sky-600 dark:text-sky-400",
    ring: "ring-sky-500/25",
  },
  planning: {
    bg: "bg-amber-500/15 dark:bg-amber-500/20",
    icon: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/25",
  },
  reports: {
    bg: "bg-orange-500/15 dark:bg-orange-500/20",
    icon: "text-orange-600 dark:text-orange-400",
    ring: "ring-orange-500/25",
  },
  governance: {
    bg: "bg-slate-500/15 dark:bg-slate-500/20",
    icon: "text-slate-600 dark:text-slate-400",
    ring: "ring-slate-500/25",
  },
  services: {
    bg: "bg-blue-500/15 dark:bg-blue-500/20",
    icon: "text-blue-600 dark:text-blue-400",
    ring: "ring-blue-500/25",
  },
  billing: {
    bg: "bg-emerald-500/15 dark:bg-emerald-500/20",
    icon: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/25",
  },
};

export const DEFAULT_NAV_CATEGORY_STYLE: NavCategoryStyle = {
  bg: "bg-primary/12 dark:bg-primary/20",
  icon: "text-primary",
  ring: "ring-primary/25",
};

export function getNavCategoryStyle(groupId: string): NavCategoryStyle {
  return NAV_CATEGORY_STYLES[groupId] ?? DEFAULT_NAV_CATEGORY_STYLE;
}
