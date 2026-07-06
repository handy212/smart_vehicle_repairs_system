"use client";

import React, { useState, useRef } from "react";
import { SendHorizontal, Paperclip, Smile, X, CornerDownLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { ChatMessage } from "@/lib/api/chat";

const MAX_CHARS = 2000;

interface ChatInputProps {
  onSendMessage: (message: string, type?: 'text' | 'image' | 'file', metadata?: Record<string, unknown>) => void;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onTyping,
  disabled,
  replyTo,
  onCancelReply,
}) => {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const charCount = message.length;
  const isOverLimit = charCount > MAX_CHARS;

  const handleSend = () => {
    if (message.trim() && !disabled && !isOverLimit) {
      onSendMessage(message.trim());
      setMessage("");
      onTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (inputRef.current) inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;

    // Typing notification
    onTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onTyping(false), 2000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // For now, inject the filename as a message placeholder; full upload handled separately
    const type = file.type.startsWith('image/') ? 'image' : 'file';
    onSendMessage(`[${type === 'image' ? '📷' : '📎'} ${file.name}]`, type, { filename: file.name, size: file.size });
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      {/* Reply-to context banner */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-xl text-sm"
          >
            <CornerDownLeft className="w-3.5 h-3.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                Replying to {replyTo.sender_name}
              </span>
              <p className="text-xs text-muted-foreground truncate">{replyTo.message}</p>
            </div>
            <button
              onClick={onCancelReply}
              className="p-1 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <div className={cn(
          "relative flex items-end gap-2 p-1.5 bg-slate-50 dark:bg-slate-950 border rounded-xl transition-all focus-within:border-primary/50 focus-within:shadow-sm",
          isOverLimit ? "border-destructive" : "border-border"
        )}>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={handleFileSelect}
            disabled={disabled}
          />

          {/* Actions Left */}
          <div className="flex gap-0.5">
            <InputActionButton
              icon={<Paperclip className="w-4 h-4" />}
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              title="Attach file"
            />
          </div>

          {/* Input Field */}
          <textarea
            ref={inputRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={disabled ? "Connecting..." : "Type your message... (Shift+Enter for new line)"}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none text-foreground text-sm py-2 px-1 placeholder:text-muted-foreground/50 scrollbar-hide min-h-[36px]"
          />

          {/* Actions Right */}
          <div className="flex items-center gap-1">
            <InputActionButton
              icon={<Smile className="w-4 h-4" />}
              disabled={disabled}
              title="Emoji (coming soon)"
            />
            <button
              onClick={handleSend}
              disabled={!message.trim() || disabled || isOverLimit}
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center transition-all active:scale-95 disabled:opacity-30",
                message.trim() && !isOverLimit ? "bg-primary text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-muted-foreground"
              )}
            >
              <SendHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Character counter — only show near limit */}
        {charCount > MAX_CHARS * 0.75 && (
          <div className={cn(
            "absolute -bottom-5 right-1 text-[10px] font-bold tabular-nums",
            isOverLimit ? "text-destructive" : "text-muted-foreground/60"
          )}>
            {charCount}/{MAX_CHARS}
          </div>
        )}
      </div>
    </div>
  );
};

const InputActionButton = ({
  icon,
  onClick,
  disabled,
  title,
}: {
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="p-2 rounded-lg text-muted-foreground hover:bg-white dark:hover:bg-slate-800 hover:text-primary transition-all active:scale-90 disabled:opacity-40"
  >
    {icon}
  </button>
);
