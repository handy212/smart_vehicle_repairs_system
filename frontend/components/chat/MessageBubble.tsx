"use client";

import React from "react";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils/cn";
import { format } from "date-fns";

interface Message {
  id: number;
  message: string;
  sender_email: string;
  sender_id: number;
  timestamp: string;
}

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const { user } = useAuthStore();
  const isOwnMessage = user?.id === message.sender_id;

  return (
    <div className={cn("flex flex-col max-w-[80%]", isOwnMessage ? "ml-auto items-end" : "mr-auto items-start")}>
      <div className={cn(
        "px-4 py-2 rounded-2xl text-sm shadow-sm",
        isOwnMessage 
          ? "bg-primary text-primary-foreground rounded-tr-none" 
          : "bg-muted text-foreground rounded-tl-none"
      )}>
        <p className="whitespace-pre-wrap">{message.message}</p>
      </div>
      <div className="flex items-center gap-2 mt-1 px-1">
        <span className="text-[10px] text-muted-foreground font-medium">
          {!isOwnMessage && message.sender_email} {format(new Date(message.timestamp), "HH:mm")}
        </span>
      </div>
    </div>
  );
};
