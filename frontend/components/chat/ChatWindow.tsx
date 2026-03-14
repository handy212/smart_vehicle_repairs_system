"use client";

import React, { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/hooks/useChat";
import { chatApi } from "@/lib/api/chat";

interface ChatWindowProps {
  conversationId: number;
  conversationTitle?: string;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ conversationId, conversationTitle }) => {
  const { messages, sendMessage, isConnected, setMessages } = useChat(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch history using chatApi
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await chatApi.conversations.messages(conversationId);
        setMessages(Array.isArray(data) ? data : (data as any).results || []);
      } catch (error) {
        console.error("Failed to fetch chat history", error);
      }
    };
    if (conversationId) {
      fetchHistory();
    }
  }, [conversationId, setMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-background border rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b bg-card flex justify-between items-center">
        <h3 className="font-bold text-lg">{conversationTitle}</h3>
        <div className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-muted-foreground">{isConnected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-card">
        <ChatInput onSendMessage={sendMessage} disabled={!isConnected} />
      </div>
    </div>
  );
};
