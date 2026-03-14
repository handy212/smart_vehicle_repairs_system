"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { MessageSquare, Puzzle } from "lucide-react";
import { chatApi } from "@/lib/api/chat";

function ChatContent() {
  const [selectedConversation, setSelectedConversation] = useState<{ id: number; title: string } | null>(null);
  const searchParams = useSearchParams();
  const workOrderId = searchParams.get("work_order_id");

  useEffect(() => {
    if (workOrderId) {
      const initChat = async () => {
        try {
          const data = await chatApi.conversations.getOrCreateByObject("workorder", workOrderId);
          setSelectedConversation({ id: data.id, title: data.title });
        } catch (error) {
          console.error("Failed to initialize object-based chat", error);
        }
      };
      initChat();
    }
  }, [workOrderId]);

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] p-4 md:p-8 gap-6 bg-background">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary font-bold mb-1">
            <MessageSquare className="h-4 w-4" />
            <span className="text-xs uppercase tracking-widest">Live Communication</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">Live Chat</h1>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
        <aside className="w-full md:w-80 shrink-0">
          <ChatSidebar 
            selectedId={selectedConversation?.id} 
            onSelectConversation={(conv) => setSelectedConversation({ id: conv.id, title: conv.title || `Chat #${conv.id}` })} 
          />
        </aside>

        <main className="flex-1 flex flex-col h-full overflow-hidden min-h-[500px]">
          {selectedConversation ? (
            <ChatWindow 
              conversationId={selectedConversation.id} 
              conversationTitle={selectedConversation.title} 
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-card/50 border-2 border-dashed rounded-[2rem] text-center">
              <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mb-6">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">Select a Conversation</h3>
              <p className="text-muted-foreground text-sm max-w-sm mb-6">
                Choose a chat from the sidebar to start messaging in real-time.
              </p>
              <div className="flex items-center gap-3 p-3 px-5 rounded-full bg-muted/50 border text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <Puzzle className="h-4 w-4" />
                Real-time WebSockets Enabled
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div>Loading chat...</div>}>
      <ChatContent />
    </Suspense>
  );
}
