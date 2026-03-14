"use client";

import React, { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils/cn";
import { format } from "date-fns";
import { chatApi, Conversation } from "@/lib/api/chat";

interface ChatSidebarProps {
  onSelectConversation: (conversation: Conversation) => void;
  selectedId?: number;
}
export const ChatSidebar: React.FC<ChatSidebarProps> = ({ onSelectConversation, selectedId }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const { user } = useAuthStore();

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const data = await chatApi.conversations.list();
        setConversations(Array.isArray(data) ? data : (data as any).results || []);
      } catch (error) {
        console.error("Failed to fetch conversations", error);
      }
    };
    if (user) {
      fetchConversations();
    }
  }, [user]);

  return (
    <div className="flex flex-col h-full border rounded-xl bg-card shadow-sm overflow-hidden">
      <div className="p-4 border-b">
        <h3 className="font-bold text-lg">Chats</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv)}
              className={cn(
                "w-full p-4 text-left transition-colors hover:bg-muted/50 flex flex-col gap-1",
                selectedId === conv.id ? "bg-muted shadow-inner" : ""
              )}
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm truncate">{conv.title || `Chat #${conv.id}`}</span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {format(new Date(conv.updated_at), "MMM d")}
                </span>
              </div>
              {conv.last_message && (
                <p className="text-xs text-muted-foreground truncate line-clamp-1">
                  {conv.last_message.message}
                </p>
              )}
            </button>
          ))}
          {conversations.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground italic">
              No active conversations
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
