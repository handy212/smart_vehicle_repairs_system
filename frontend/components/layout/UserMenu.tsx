"use client";

import { useAuthStore } from "@/store/authStore";
import { User, LogOut, Settings } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { cn } from "@/lib/utils/cn";

export function UserMenu() {
    const { user, logout } = useAuthStore();
    const router = useRouter();

    const handleLogout = () => {
        authApi.logout();
        logout();
        router.push("/login");
    };

    if (!user) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    className="flex items-center space-x-2 h-auto px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white font-semibold shadow-sm">
                        {user?.first_name?.[0] || user?.email?.[0] || "U"}
                    </div>
                    <div className="hidden md:block text-left">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {user?.first_name} {user?.last_name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
                    </div>
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                    <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {user?.first_name} {user?.last_name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{user?.email}</p>
                        <span className="inline-block mt-1.5 text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full font-medium capitalize">
                            {user?.role}
                        </span>
                    </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <DropdownMenuItem asChild>
                    <Link href="/admin/profile" className="cursor-pointer">
                        <User className="w-4 h-4 mr-2" />
                        Profile Settings
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                    <Link href="/admin" className="cursor-pointer">
                        <Settings className="w-4 h-4 mr-2" />
                        Administration
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                    <Link href="/notifications/preferences" className="cursor-pointer">
                        <Settings className="w-4 h-4 mr-2" />
                        Notification Preferences
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                    onClick={handleLogout}
                    className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20 cursor-pointer"
                >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
