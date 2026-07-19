"use client";

import { Calendar, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WORKSHOP_PANEL_CLASS } from "@/lib/constants/table-typography";
import { cn } from "@/lib/utils/cn";
import type { SMSTemplate } from "@/services/sms";
import { smsCharInfo } from "./sms-status";

interface SmsComposerProps {
  message: string;
  onMessageChange: (value: string) => void;
  scheduledFor: string;
  onScheduledForChange: (value: string) => void;
  templates?: SMSTemplate[];
  selectedTemplateId: string;
  onTemplateChange: (templateId: string, body: string) => void;
  recipientCount: number;
  isSending: boolean;
  onSend: () => void;
  onOpenAI: () => void;
}

export function SmsComposer({
  message,
  onMessageChange,
  scheduledFor,
  onScheduledForChange,
  templates,
  selectedTemplateId,
  onTemplateChange,
  recipientCount,
  isSending,
  onSend,
  onOpenAI,
}: SmsComposerProps) {
  const { len, segments } = smsCharInfo(message);

  return (
    <div className={cn(WORKSHOP_PANEL_CLASS, "overflow-hidden xl:col-span-2")}>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Send className="h-4 w-4 text-primary" />
            <span>Message</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-primary hover:bg-primary/10"
            onClick={onOpenAI}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            AI Assist
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5 text-xs text-muted-foreground">
            <span className="font-medium">Content</span>
            <span className="tabular-nums">
              {len} / 160 · {segments} message{segments !== 1 ? "s" : ""}
            </span>
          </div>
          <Textarea
            id="message"
            placeholder="Type your message…"
            className="min-h-[120px] resize-none rounded-md bg-muted/20 text-sm"
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            maxLength={612}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Template
            </Label>
            <Select
              value={selectedTemplateId || undefined}
              onValueChange={(id) => {
                const tpl = templates?.find((t) => String(t.id) === id);
                if (tpl) onTemplateChange(id, tpl.sms_body);
              }}
            >
              <SelectTrigger className="h-9 rounded-md bg-muted/20">
                <SelectValue placeholder="Select a template…" />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Schedule (optional)
            </Label>
            <div className="relative">
              <Input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => onScheduledForChange(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="h-9 rounded-md bg-muted/20 pr-10"
              />
              <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            onClick={onSend}
            disabled={isSending || recipientCount === 0 || !message.trim()}
            className="h-9 w-full px-5 font-semibold sm:w-auto"
          >
            {isSending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {scheduledFor ? "Schedule" : "Send"}
            {recipientCount > 0 ? ` (${recipientCount})` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
