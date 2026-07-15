"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Calendar,
  Clock,
  Bell,
  KeyRound,
  LogOut,
  User,
  ChevronRight,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { WORKSHOP_PANEL_CLASS } from "@/lib/constants/layout";
import { cn } from "@/lib/utils";

const menuItems = [
  { href: "/mobile/time-tracking", label: "Time Tracking", icon: Clock, description: "Clock in and out" },
  { href: "/mobile/schedule", label: "My Schedule", icon: Calendar, description: "Today's appointments" },
  { href: "/mobile/notifications", label: "Notifications", icon: Bell, description: "Alerts and updates" },
  { href: "/mobile/help", label: "Help", icon: BookOpen, description: "Mobile technician guide" },
  { href: "/mobile/more/password", label: "Change Password", icon: KeyRound, description: "Update your login password" },
];

export default function MobileMorePage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <MobilePageShell title="More" className="space-y-4">
      <div className={cn(WORKSHOP_PANEL_CLASS, "flex items-center gap-3 p-4")}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <User className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-foreground">
            {user?.first_name} {user?.last_name}
          </p>
          <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
          <p className="text-xs capitalize text-muted-foreground">{user?.role}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50",
                index > 0 && "border-t border-border"
              )}
            >
              <Icon className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </div>

      <Button variant="destructive" className="w-full" onClick={handleLogout}>
        <LogOut className="mr-2 h-4 w-4" />
        Sign Out
      </Button>
    </MobilePageShell>
  );
}
