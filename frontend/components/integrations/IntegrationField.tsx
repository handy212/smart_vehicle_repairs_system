"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff } from "lucide-react";
import { SystemSetting } from "@/lib/api/admin";
import {
  fieldPrefixForKey,
  integrationFieldHint,
  integrationFieldLabel,
  isBooleanIntegrationSetting,
} from "@/lib/integrations/fieldLabels";
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
  /** Denser toggle row (label only, no hint). */
  compact?: boolean;
}

const SELECT_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  sms_provider: [
    { value: "hubtel", label: "Hubtel" },
    { value: "twilio", label: "Twilio" },
    { value: "infobip", label: "Infobip" },
  ],
  ai_gemini_model: [
    { value: "gemini-flash-lite-latest", label: "Flash-Lite (latest alias)" },
    { value: "gemini-2.5-flash-lite", label: "2.5 Flash-Lite — fastest / cheapest" },
    { value: "gemini-2.5-flash", label: "2.5 Flash — balanced" },
    { value: "gemini-2.5-pro", label: "2.5 Pro — highest quality" },
    { value: "gemini-3.1-flash-lite", label: "3.1 Flash-Lite" },
    { value: "gemini-3.5-flash", label: "3.5 Flash" },
  ],
};

function isTruthy(val: string) {
  const str = val.toLowerCase().trim();
  return str === "true" || str === "1" || str === "yes" || str === "on";
}

export function IntegrationField({
  setting,
  value,
  isSecret,
  showSecret,
  onToggleSecret,
  onChange,
  onDiscard,
  canManage,
  error,
  prefix = "",
  showKey = false,
  deferSave = false,
  compact = false,
}: IntegrationFieldProps) {
  const pendingChanges = value !== (setting.value ?? "");
  const fieldPrefix = prefix || fieldPrefixForKey(setting.key);
  const label = integrationFieldLabel(setting.key, fieldPrefix);
  const hint = compact ? "" : integrationFieldHint(setting.key, setting.description);
  const isToggle = isBooleanIntegrationSetting(setting.key);
  const baseSelectOptions = SELECT_OPTIONS[setting.key];
  const selectOptions = baseSelectOptions
    ? value && !baseSelectOptions.some((option) => option.value === value)
      ? [{ value, label: `${value} (current)` }, ...baseSelectOptions]
      : baseSelectOptions
    : undefined;
  const controlId = `integration-${setting.id}`;

  if (isToggle) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg bg-muted/25 transition-colors",
          compact ? "px-3 py-2" : "rounded-xl px-3.5 py-3",
          pendingChanges && "bg-primary/[0.06] ring-1 ring-primary/25"
        )}
      >
        <div className="min-w-0 pr-2">
          <Label
            htmlFor={controlId}
            className={cn(
              "font-medium text-foreground",
              compact ? "text-[13px] leading-snug" : "text-sm"
            )}
          >
            {label}
          </Label>
          {hint ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
          ) : null}
          {showKey ? (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground/60">{setting.key}</p>
          ) : null}
        </div>
        <Switch
          id={controlId}
          checked={isTruthy(value)}
          onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
          disabled={!canManage}
          aria-label={label}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Label htmlFor={controlId} className="text-sm font-medium text-foreground">
            {label}
          </Label>
          {hint ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
          ) : null}
          {showKey ? (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground/60">{setting.key}</p>
          ) : null}
        </div>
        {pendingChanges ? (
          <button
            type="button"
            onClick={onDiscard}
            className="shrink-0 text-[11px] font-medium text-primary hover:underline"
          >
            Undo
          </button>
        ) : null}
      </div>

      {selectOptions ? (
        <Select value={value || selectOptions[0]?.value} onValueChange={onChange} disabled={!canManage}>
          <SelectTrigger
            id={controlId}
            className={cn("h-10", pendingChanges && "border-primary/40 ring-1 ring-primary/15")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selectOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="relative">
          <Input
            id={controlId}
            type={isSecret && !showSecret ? "password" : "text"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={isSecret ? "Enter secret value" : "Enter value"}
            autoComplete={isSecret ? "new-password" : "off"}
            className={cn(
              "h-10",
              isSecret && "pr-10",
              pendingChanges && "border-primary/40 ring-1 ring-primary/15"
            )}
            disabled={!canManage}
          />
          {isSecret ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
              onClick={onToggleSecret}
              aria-label={showSecret ? "Hide value" : "Show value"}
            >
              {showSecret ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          ) : null}
        </div>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {deferSave && pendingChanges ? (
        <p className="text-[11px] text-muted-foreground">Saved when you click Save above.</p>
      ) : null}
    </div>
  );
}
