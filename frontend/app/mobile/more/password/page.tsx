"use client";

import { useState } from "react";
import apiClient from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

export default function MobileChangePasswordPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.new_password !== form.confirm_password) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiClient.post("/auth/users/change_password/", {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      toast({ title: "Password updated successfully" });
      setForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (error) {
      toast({
        title: "Failed to change password",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <MobilePageShell
      title="Change Password"
      backHref="/mobile/more"
      backLabel="More"
      className="space-y-4"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Update login password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current_password">Current password</Label>
              <Input
                id="current_password"
                type="password"
                autoComplete="current-password"
                value={form.current_password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, current_password: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_password">New password</Label>
              <Input
                id="new_password"
                type="password"
                autoComplete="new-password"
                value={form.new_password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, new_password: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm new password</Label>
              <Input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                value={form.confirm_password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, confirm_password: e.target.value }))
                }
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </MobilePageShell>
  );
}
