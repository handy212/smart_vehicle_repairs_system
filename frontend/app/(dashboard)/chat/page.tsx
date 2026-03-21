"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { MessageSquare, Zap, ArrowLeft } from "lucide-react";
import { chatApi, Conversation } from "@/lib/api/chat";

function ChatContent() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showChat, setShowChat] = useState(false); // mobile: true = show chat pane
  const searchParams = useSearchParams();
  const workOrderId = searchParams.get("work_order_id");

  useEffect(() => {
    if (workOrderId) {
      const initChat = async () => {
        try {
          const data = await chatApi.conversations.getOrCreateByObject("workorder", workOrderId);
          setSelectedConversation(data);
          setShowChat(true);
        } catch (error) {
          console.error("Failed to initialize object-based chat", error);
        }
      };
      initChat();
    }
  }, [workOrderId]);

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setShowChat(true);
  };

  const handleBack = () => {
    setShowChat(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] p-0 md:p-6 bg-slate-50 dark:bg-slate-950 overflow-hidden">

      {/* Page Header — hidden on mobile when chat is open */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 md:px-0 mb-6 ${showChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-[10px]">
            <Zap className="h-3 w-3 fill-primary" />
            <span>Smart Communication Service</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Service Chat
          </h1>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-0 md:gap-6 overflow-hidden border-t md:border-none">

        {/* Sidebar — visible on desktop always; on mobile only when chat is not shown */}
        <aside className={`w-full md:w-[350px] shrink-0 md:h-full z-20 ${showChat ? 'hidden md:block' : 'block'}`}
          style={{ height: showChat ? undefined : 'calc(100dvh - 180px)' }}
        >
          <ChatSidebar
            selectedId={selectedConversation?.id}
            onSelectConversation={handleSelectConversation}
          />
        </aside>

        {/* Chat Main Area — visible on desktop always; on mobile only when chat is shown */}
        <main className={`flex-1 flex flex-col h-full overflow-hidden border-t md:border-none z-10 ${showChat ? 'flex' : 'hidden md:flex'}`}>
          {/* Mobile back button */}
          {showChat && selectedConversation && (
            <div className="flex items-center gap-3 px-4 py-3 md:hidden border-b bg-white dark:bg-slate-900">
              <button
                onClick={handleBack}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-muted-foreground hover:text-primary transition-all"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <span className="font-bold text-sm truncate">
                {selectedConversation.title || `Chat #${selectedConversation.id}`}
              </span>
            </div>
          )}

          {selectedConversation ? (
            <ChatWindow
              conversationId={selectedConversation.id}
              conversationTitle={selectedConversation.title || `Chat #${selectedConversation.id}`}
              conversation={selectedConversation}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 border border-border rounded-xl text-center shadow-sm">
              <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 flex items-center justify-center mb-6">
                <MessageSquare className="h-10 w-10" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Select a Person or Group</h3>
              <p className="text-muted-foreground text-sm max-w-sm font-medium">
                Choose a conversation from the sidebar to communicate with technicians or clients in real-time.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-white dark:bg-slate-950 text-slate-500 font-bold uppercase tracking-widest text-xs">
        Loading Live Chat...
      </div>
    }>
      <ChatContent />
    </Suspense>
  );
}
