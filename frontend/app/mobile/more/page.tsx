"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Clock,
  Bell,
  KeyRound,
  LogOut,
  User,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Link href="/mobile/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <h2 className="text-xl font-bold">More</h2>
      </div>

      <Card>
        <CardContent className="flex items-center gap-3 p-4">
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
        </CardContent>
      </Card>

      <div className="space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3 p-4">
                  <Icon className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Button variant="destructive" className="w-full" onClick={handleLogout}>
        <LogOut className="mr-2 h-4 w-4" />
        Sign Out
      </Button>
    </div>
  );
}
