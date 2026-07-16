"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

/** Sticky banner shown in the customer portal while staff are impersonating. */
export function ImpersonationBanner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [exiting, setExiting] = useState(false);

  if (!user?.impersonating) {
    return null;
  }

  const customerName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
  const adminName = user.impersonator
    ? [user.impersonator.first_name, user.impersonator.last_name]
        .filter(Boolean)
        .join(" ") || user.impersonator.email
    : "Admin";

  const handleExit = async () => {
    setExiting(true);
    try {
      const data = await authApi.exitImpersonation();
      setUser(data.user);
      await queryClient.clear();
      toast({
        title: "Impersonation ended",
        description: "You are back to your staff account.",
      });
      router.push("/customers");
    } catch (error) {
      toast({
        title: "Could not exit impersonation",
        description: getUserFacingError(error, "Please try logging in again."),
        variant: "destructive",
      });
    } finally {
      setExiting(false);
    }
  };

  return (
    <div className="sticky top-0 z-[60] border-b border-warning/40 bg-warning text-warning-foreground">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm sm:px-6">
        <p>
          Viewing portal as <strong>{customerName}</strong>
          {adminName ? (
            <>
              {" "}
              (signed in as {adminName})
            </>
          ) : null}
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="bg-warning text-warning-foreground hover:bg-warning"
          onClick={handleExit}
          disabled={exiting}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {exiting ? "Exiting…" : "Exit impersonation"}
        </Button>
      </div>
    </div>
  );
}
