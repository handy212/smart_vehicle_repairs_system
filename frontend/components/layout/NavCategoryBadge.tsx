"use client";

import type { NavIcon } from "@/components/layout/nav-group-types";
import { cn } from "@/lib/utils/cn";
import {
  DEFAULT_NAV_CATEGORY_STYLE,
  getNavCategoryStyle,
  type NavCategoryStyle,
} from "./nav-category-styles";

type NavCategoryBadgeSize = "xs" | "sm" | "md";

const SIZE_CLASSES: Record<
  NavCategoryBadgeSize,
  { box: string; rounded: string; iconPx: number }
> = {
  xs: { box: "h-6 w-6", rounded: "rounded-md", iconPx: 14 },
  sm: { box: "h-7 w-7", rounded: "rounded-md", iconPx: 16 },
  md: { box: "h-8 w-8", rounded: "rounded-lg", iconPx: 16 },
};

interface NavCategoryBadgeProps {
  icon: NavIcon;
  groupId?: string;
  style?: NavCategoryStyle;
  size?: NavCategoryBadgeSize;
  active?: boolean;
  className?: string;
}

export function NavCategoryBadge({
  icon: Icon,
  groupId,
  style,
  size = "sm",
  active = false,
  className,
}: NavCategoryBadgeProps) {
  const palette = style ?? (groupId ? getNavCategoryStyle(groupId) : DEFAULT_NAV_CATEGORY_STYLE);
  const sizes = SIZE_CLASSES[size];

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden ring-1 ring-inset",
        sizes.box,
        sizes.rounded,
        palette.bg,
        palette.ring,
        active && "ring-2",
        className
      )}
      aria-hidden
    >
      <Icon
        className={cn("block shrink-0", palette.icon)}
        style={{ width: sizes.iconPx, height: sizes.iconPx }}
        strokeWidth={1.75}
        aria-hidden
      />
    </span>
  );
}
