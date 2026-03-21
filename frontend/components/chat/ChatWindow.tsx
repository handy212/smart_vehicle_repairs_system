"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/hooks/useChat";
import { chatApi, Conversation, ChatMessage } from "@/lib/api/chat";
import { useAuthStore } from "@/store/authStore";
import { MoreVertical, Phone, Video, ShieldCheck, Zap, ChevronDown, Calendar, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { isToday, isYesterday, format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

interface ChatWindowProps {
  conversationId: number;
  conversationTitle?: string;
  conversation?: Conversation;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ conversationId, conversationTitle, conversation }) => {
  const {
    messages,
    sendMessage,
    isConnected,
    setMessages,
    typingUsers,
    sendTyping,
    sendReadReceipt,
  } = useChat(conversationId);

  const { user } = useAuthStore();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

  // Attach scroll listener to Radix ScrollArea viewport
  const scrollAreaRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const viewport = node.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    viewportRef.current = viewport;

    const onScroll = () => {
      const { scrollHeight, scrollTop, clientHeight } = viewport;
      const nearBottom = scrollHeight - scrollTop - clientHeight < 120;
      isNearBottomRef.current = nearBottom;
      setShowScrollBottom(!nearBottom);
    };

    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', onScroll);
  }, []);

  // Fetch history on conversation change
  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      setMessages([]);
      try {
        const data = await chatApi.conversations.messages(conversationId);
        const msgs = Array.isArray(data) ? data : (data as any).results ?? [];
        setMessages(msgs);
      } catch (error) {
        console.error("Failed to fetch chat history", error);
      } finally {
        setIsLoading(false);
      }
    };
    if (conversationId) {
      fetchHistory();
    }
  }, [conversationId, setMessages]);

  // Auto-scroll and batch read receipts
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    // Batch-mark all visible unread messages as read
    const unreadIds = messages
      .filter((m) => !m.is_read && m.sender_id !== user?.id)
      .map((m) => m.id);

    if (unreadIds.length > 0) {
      // Send read receipt for the last unread (server marks all as read via mark_all_read)
      sendReadReceipt(unreadIds[unreadIds.length - 1]);
      // Also call REST endpoint to ensure DB is updated
      chatApi.conversations.markAllRead(conversationId).catch(() => {});
    }
  }, [messages, conversationId, user, sendReadReceipt]);

  const scrollToBottom = () => {
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" });
  };

  const handleSendMessage = useCallback((
    message: string,
    type: 'text' | 'image' | 'file' = 'text',
    metadata: Record<string, unknown> = {}
  ) => {
    sendMessage(message, type, metadata, replyTo?.id);
    setReplyTo(null);
  }, [sendMessage, replyTo]);

  const groupedMessages = useMemo(() => {
    const groups: { [key: string]: ChatMessage[] } = {};
    messages.forEach((msg) => {
      const date = format(new Date(msg.timestamp), 'yyyy-MM-dd');
      if (!groups[date]) groups[date] = [];
      groups[date].push(msg);
    });
    return groups;
  }, [messages]);

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM do, yyyy");
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border border-border rounded-2xl overflow-hidden shadow-sm relative">

      {/* Header */}
      <div className="px-6 py-5 border-b bg-white/80 dark:bg-slate-800/80 backdrop-blur-md flex justify-between items-center z-10 sticky top-0">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl border border-primary/20 shadow-sm overflow-hidden">
              {conversation?.title?.charAt(0) || conversationTitle?.charAt(0) || "C"}
            </div>
            {isConnected && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-success rounded-full border-2 border-white dark:border-slate-800 shadow-sm" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-base text-foreground tracking-tight flex items-center gap-2">
              {conversationTitle}
              {conversation?.type === 'system' && <ShieldCheck className="w-4 h-4 text-primary" />}
            </h3>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
                <span className={cn("w-1.5 h-1.5 rounded-full", isConnected ? "bg-success animate-pulse" : "bg-destructive")} />
                {isConnected ? "Active Now" : "Reconnecting..."}
                <span className="text-slate-300 dark:text-slate-700 mx-1 font-normal opacity-50">/</span>
                <Zap className="w-3 h-3 text-warning fill-warning" />
                SVR Optimized
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <HeaderButton icon={<Search className="w-4 h-4" />} />
          <div className="w-px h-6 bg-border mx-1" />
          <HeaderButton icon={<Phone className="w-4 h-4" />} />
          <HeaderButton icon={<Video className="w-4 h-4" />} />
          <div className="w-px h-6 bg-border mx-1" />
          <HeaderButton icon={<MoreVertical className="w-4 h-4" />} />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden relative" ref={scrollAreaRef}>
        <ScrollArea className="h-full">
          <div className="py-6 min-h-full flex flex-col justify-end">
            {isLoading ? (
              <MessageSkeleton />
            ) : messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 opacity-20">
                <p className="font-black text-[10px] uppercase tracking-[0.5em]">No conversation history</p>
              </div>
            ) : (
              Object.entries(groupedMessages).map(([date, msgs]) => (
                <div key={date} className="space-y-1">
                  <div className="flex justify-center my-8 sticky top-4 z-10">
                    <span className="px-4 py-1.5 rounded-full bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-sm text-[10px] font-black text-slate-400 uppercase tracking-widest border border-border flex items-center gap-2 shadow-sm">
                      <Calendar className="w-3 h-3" />
                      {getDateLabel(date)}
                    </span>
                  </div>
                  {msgs.map((msg, index) => {
                    const nextMsg = msgs[index + 1];
                    const isLastInSequence = !nextMsg || nextMsg.sender_id !== msg.sender_id;
                    return (
                      <MessageBubble
                        key={msg.id || `temp-${index}`}
                        message={msg}
                        showAvatar={isLastInSequence}
                        onReply={() => setReplyTo(msg)}
                      />
                    );
                  })}
                </div>
              ))
            )}

            <AnimatePresence>
              {typingUsers.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex items-center gap-3 px-10 py-4"
                >
                  <div className="flex gap-1 bg-primary/5 dark:bg-primary/10 p-2.5 rounded-2xl border border-primary/20">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                  <span className="text-[10px] font-black text-primary/60 uppercase tracking-widest leading-none">
                    {typingUsers.map(u => u.name).join(', ')} typing...
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={scrollEndRef} className="h-4" />
          </div>
        </ScrollArea>

        <AnimatePresence>
          {showScrollBottom && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={scrollToBottom}
              className="absolute bottom-6 right-8 w-10 h-10 rounded-full bg-primary text-white shadow-xl flex items-center justify-center hover:scale-110 active:scale-90 transition-all z-20"
            >
              <ChevronDown className="w-5 h-5" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Input — with reply context */}
      <div className="px-6 py-5 bg-white dark:bg-slate-900 border-t border-border">
        <ChatInput
          onSendMessage={handleSendMessage}
          onTyping={sendTyping}
          disabled={!isConnected}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>
    </div>
  );
};

const HeaderButton = ({ icon }: { icon: React.ReactNode }) => (
  <button className="w-10 h-10 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-muted-foreground/60 hover:text-primary transition-all active:scale-90 active:bg-primary/5">
    {icon}
  </button>
);

const MessageSkeleton = () => (
  <div className="px-8 py-4 space-y-4 animate-pulse">
    {[...Array(5)].map((_, i) => (
      <div key={i} className={cn("flex gap-3", i % 2 === 0 ? "flex-row" : "flex-row-reverse")}>
        <div className="w-9 h-9 rounded-2xl bg-slate-100 dark:bg-slate-800 shrink-0" />
        <div className={cn("space-y-2", i % 2 === 0 ? "items-start" : "items-end", "flex flex-col")}>
          <div className="h-10 rounded-2xl bg-slate-100 dark:bg-slate-800" style={{ width: `${120 + (i * 30) % 100}px` }} />
        </div>
      </div>
    ))}
  </div>
);
