"use client";

import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";

interface QuickBooksConnectedGateProps {
  children: React.ReactNode;
}

export function QuickBooksConnectedGate({ children }: QuickBooksConnectedGateProps) {
  const { isOperational, isLoading } = useQuickBooksConnection();

  if (isLoading || !isOperational) {
    return null;
  }

  return <>{children}</>;
}
