"use client";

import React from "react";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils/cn";
import { format } from "date-fns";
import { ChatMessage } from "@/lib/api/chat";
import { Check, CheckCheck, Reply, Info, FileDown, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

interface MessageBubbleProps {
  message: ChatMessage;
  showAvatar?: boolean;
  onReply?: (message: ChatMessage) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, showAvatar = true, onReply }) => {
  const { user } = useAuthStore();
  const isOwnMessage = user?.id === message.sender_id;
  const isSystem = message.message_type === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center w-full my-4">
        <span className="px-4 py-1.5 rounded-2xl bg-slate-100/70 dark:bg-slate-800/70 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border border-border/50 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-primary/60 shrink-0" />
          {message.message}
        </span>
      </div>
    );
  }

  const hasAttachment = !!message.attachment;
  const isImage = hasAttachment && (
    message.message_type === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(message.attachment ?? '')
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: isOwnMessage ? 10 : -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "flex w-full gap-3 group px-4 md:px-8 my-0.5 relative",
        isOwnMessage ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div className={cn(
        "flex-shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-xs shadow-sm mt-1 transition-all border border-border/20 overflow-hidden",
        isOwnMessage ? "bg-primary text-white" : "bg-white dark:bg-slate-800 text-slate-500",
        !showAvatar && "opacity-0 pointer-events-none"
      )}>
        {message.sender_name?.charAt(0) || "?"}
      </div>

      <div className={cn("flex flex-col max-w-[75%] md:max-w-[65%]", isOwnMessage ? "items-end" : "items-start")}>
        {/* Sender name */}
        {!isOwnMessage && showAvatar && (
          <span className="text-[10px] font-black text-muted-foreground/40 ml-1 mb-1 uppercase tracking-widest">
            {message.sender_name}
          </span>
        )}

        {/* Reply context */}
        {message.parent_message_detail && (
          <div className={cn(
            "mb-1 px-3 py-1.5 rounded-xl border-l-2 border-primary/40 bg-primary/5 text-xs text-muted-foreground max-w-full",
            isOwnMessage ? "text-right" : "text-left"
          )}>
            <span className="font-bold text-primary/60 block text-[10px] uppercase tracking-widest mb-0.5">
              {message.parent_message_detail.sender_name}
            </span>
            <p className="truncate">{message.parent_message_detail.message}</p>
          </div>
        )}

        {/* Message Bubble */}
        <div className="relative group/bubble overflow-visible">
          <div className={cn(
            "px-4 py-2.5 rounded-[1.25rem] text-[14px] leading-relaxed transition-all duration-300 border shadow-sm",
            isOwnMessage
              ? "bg-primary border-primary text-white rounded-tr-none"
              : "bg-white dark:bg-slate-800 border-border text-foreground rounded-tl-none group-hover:shadow-md"
          )}>
            {/* Attachment rendering */}
            {hasAttachment && (
              <div className="mb-2">
                {isImage ? (
                  <a href={message.attachment} target="_blank" rel="noreferrer">
                    <img
                      src={message.attachment}
                      alt="attachment"
                      className="max-w-full max-h-48 rounded-xl object-cover border border-white/20 hover:opacity-90 transition-opacity"
                    />
                  </a>
                ) : (
                  <a
                    href={message.attachment}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-sm font-medium",
                      isOwnMessage
                        ? "bg-white/15 hover:bg-white/25 text-white"
                        : "bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-foreground"
                    )}
                  >
                    <FileDown className="w-4 h-4 shrink-0" />
                    <span className="truncate max-w-[160px]">
                      {String(message.metadata?.filename ?? 'Download file')}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  </a>
                )}
              </div>
            )}
            {message.message && (
              <p className="whitespace-pre-wrap font-medium tracking-tight">{message.message}</p>
            )}
          </div>

          {/* Hover quick actions */}
          <div className={cn(
            "absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/bubble:opacity-100 transition-all duration-200 z-10",
            isOwnMessage ? "right-full mr-3" : "left-full ml-3"
          )}>
            {onReply && (
              <ActionButton
                icon={<Reply className="w-3.5 h-3.5" />}
                onClick={() => onReply(message)}
                title="Reply"
              />
            )}
          </div>
        </div>

        {/* Footer: time + read status */}
        <div className={cn(
          "flex items-center gap-2 mt-1 px-1",
          isOwnMessage ? "flex-row" : "flex-row-reverse"
        )}>
          <span className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-tighter">
            {format(new Date(message.timestamp), "HH:mm")}
          </span>
          {isOwnMessage && (
            <div className="flex items-center">
              {message.is_read
                ? <CheckCheck className="w-3.5 h-3.5 text-primary" />
                : <Check className="w-3.5 h-3.5 text-muted-foreground/20" />
              }
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const ActionButton = ({
  icon,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) => (
  <button
    onClick={onClick}
    title={title}
    className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-border shadow-soft flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-all active:scale-90"
  >
    {icon}
  </button>
);
