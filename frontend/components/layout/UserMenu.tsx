"use client";

import { PremiumIcons } from "@/components/ui/icons";
import { useAuthStore } from "@/store/authStore";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { User, LogOut, Settings } from "lucide-react"; // Keep for now if needed (though we're replacing usage below)
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cn } from "@/lib/utils/cn";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { branchesApi, type Branch } from "@/lib/api/admin";
import { useBranchStore } from "@/store/branchStore";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ChevronDown } from "lucide-react";
import {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Select,
} from "@/components/ui/select";

export function UserMenu() {
    const { user, logout } = useAuthStore();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { activeBranchId, activeBranch, setBranch } = useBranchStore();
    const router = useRouter();
    const queryClient = useQueryClient();

    const {
        data: accessibleBranchesData,
        isLoading: isBranchesLoading,
    } = useQuery<Branch[]>({
        queryKey: ["branches", "accessible"],
        queryFn: () => branchesApi.accessible(),
        enabled: !!user,
    });

    const branchOptions = accessibleBranchesData ?? [];
    const sortedBranches = [...branchOptions].sort((a, b) =>
        a.name.localeCompare(b.name)
    );
    const hasMultipleBranches = sortedBranches.length > 1;

    const currentBranchId = activeBranchId ?? (sortedBranches.length ? sortedBranches[0].id : null);

    const handleBranchChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedId = parseInt(event.target.value, 10);
        const selectedBranch = sortedBranches.find(
            (branch) => branch.id === selectedId
        );
        if (selectedBranch) {
            setBranch(selectedBranch);
            // The Navbar has a logic to reload on branch change, 
            // but we should probably centralize it or ensure it's handled.
            // For now, let's trigger the reload if needed.
            queryClient.clear();
            if (typeof window !== "undefined") {
                window.location.reload();
            }
        }
    };

    const handleLogout = async () => {
        try {
            await authApi.logout();
        } finally {
            logout();
            router.push("/login");
        }
    };

    if (!user) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    className="flex items-center space-x-2 h-auto px-3 py-2 hover:bg-muted hover:bg-muted"
                >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/90 flex items-center justify-center text-white font-semibold shadow-sm">
                        {user?.first_name?.[0] || user?.email?.[0] || "U"}
                    </div>
                    <div className="hidden md:block text-left">
                        <p className="text-sm font-medium text-foreground">
                            {user?.first_name} {user?.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                    </div>
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                    <div>
                        <p className="text-sm font-semibold text-foreground truncate">
                            {user?.first_name} {user?.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{user?.email}</p>
                        <span className="inline-block mt-1.5 rounded-full border border-primary/15 bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize text-primary">
                            {user?.role}
                        </span>
                    </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                {hasMultipleBranches && (
                    <>
                        <DropdownMenuLabel className="pb-1">
                            <div className="flex items-center gap-2">
                                <PremiumIcons.Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Switch Branch</span>
                            </div>
                        </DropdownMenuLabel>
                        <div className="px-2 pb-2">
                            <select
                                value={currentBranchId ? currentBranchId.toString() : ""}
                                onChange={handleBranchChange}
                                disabled={isBranchesLoading || sortedBranches.length === 0}
                                className="w-full h-8 bg-muted border-border rounded-lg text-xs px-2 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                            >
                                {sortedBranches.map((branch) => (
                                    <option key={branch.id} value={branch.id}>
                                        {branch.name}
                                        {branch.is_headquarters ? " (HQ)" : ""}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <DropdownMenuSeparator />
                    </>
                )}

                <DropdownMenuItem asChild>
                    <Link href="/admin/profile" className="cursor-pointer">
                        <PremiumIcons.UserCog className="w-4 h-4 mr-2" />
                        Profile Settings
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                    <Link href="/notifications/preferences" className="cursor-pointer">
                        <PremiumIcons.Settings className="w-4 h-4 mr-2" />
                        Notification Preferences
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                    onClick={handleLogout}
                    className="text-destructive dark:text-red-400 focus:text-destructive dark:focus:text-red-400 focus:bg-destructive/10 dark:focus:bg-red-900/20 cursor-pointer"
                >
                    <PremiumIcons.LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
