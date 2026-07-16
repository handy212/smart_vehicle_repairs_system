"use client";

import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff } from "lucide-react";
import { SystemSetting } from "@/lib/api/admin";
import { fieldPrefixForKey, integrationFieldLabel } from "@/lib/integrations/fieldLabels";
import { cn } from "@/lib/utils/cn";

interface IntegrationFieldProps {
  setting: SystemSetting;
  value: string;
  isSecret: boolean;
  showSecret: boolean;
  onToggleSecret: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  onToggleActive: (active: boolean) => void;
  canManage: boolean;
  isPending: boolean;
  error?: string | null;
  prefix?: string;
  showKey?: boolean;
  deferSave?: boolean;
}

export function IntegrationField({
  setting,
  value,
  isSecret,
  showSecret,
  onToggleSecret,
  onChange,
  onSave,
  onDiscard,
  onToggleActive,
  canManage,
  isPending,
  error,
  prefix = "",
  showKey = false,
  deferSave = false,
}: IntegrationFieldProps) {
  const pendingChanges = value !== (setting.value ?? "");
  const fieldPrefix = prefix || fieldPrefixForKey(setting.key);
  const label = integrationFieldLabel(setting.key, fieldPrefix);
  const isEnabledToggle = setting.key.match(/(enabled)$/i);

  const isTruthy = (val: string) => {
    const str = val.toLowerCase().trim();
    return str === "true" || str === "1" || str === "yes" || str === "on";
  };

  return (
    <div className="group py-3 first:pt-0 last:pb-0 border-b last:border-0 border-border/50 hover:bg-muted/5 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Label & Description Column */}
        <div className="sm:w-[40%] flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="font-bold text-[11px] text-foreground uppercase tracking-wider">{label}</div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[9px] text-muted-foreground font-bold uppercase">Active</span>
                <Checkbox
                    checked={setting.is_active}
                    onCheckedChange={(checked) => onToggleActive(Boolean(checked))}
                    disabled={isPending || !canManage}
                    className="h-3 w-3"
                />
            </div>
          </div>
          {showKey ? (
            <div className="text-[9px] text-muted-foreground/50 font-mono mt-0.5">
              {setting.key}
            </div>
          ) : null}
        </div>

        {/* Input & Actions Column */}
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            {isEnabledToggle ? (
              <Select value={isTruthy(value) ? "true" : "false"} onValueChange={onChange} disabled={!canManage}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="relative group/input">
                <Input
                  type={isSecret && !showSecret ? "password" : "text"}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder={isSecret ? "Enter secret value" : "Enter value"}
                  className={cn(
                    "h-8 text-xs bg-muted/20 border-border/50 focus:bg-card transition-all",
                    isSecret && "pr-8",
                    pendingChanges && "border-primary/50 ring-1 ring-primary/10"
                  )}
                  disabled={!canManage}
                />
                {isSecret && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1/2 right-0.5 -translate-y-1/2 h-7 w-7 hover:bg-transparent"
                    onClick={onToggleSecret}
                  >
                    {showSecret ? (
                      <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </Button>
                )}
              </div>
            )}

            {error && (
              <p className="text-[10px] text-destructive dark:text-destructive mt-1">{error}</p>
            )}
          </div>

          {pendingChanges ? (
            <div className="flex items-center justify-end gap-1.5 shrink-0">
              <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2 duration-200">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDiscard}
                  disabled={isPending}
                  className="h-7 text-[10px] px-2 font-bold uppercase tracking-tight hover:bg-muted"
                >
                  Discard
                </Button>
                {deferSave ? (
                  <div className="h-7 px-2 text-[10px] font-bold uppercase tracking-tight text-primary flex items-center">
                    Edited
                  </div>
                ) : (
                  <Button
                    size="sm"
                    disabled={isPending || !!error}
                    onClick={onSave}
                    className="bg-primary hover:bg-primary/90 text-white h-7 text-[10px] px-2 font-bold uppercase tracking-tight shadow-sm"
                  >
                    Save
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
