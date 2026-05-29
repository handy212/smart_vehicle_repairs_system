"use client";

import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";

interface QuickBooksConnectedGateProps {
  children: React.ReactNode;
}

export function QuickBooksConnectedGate({ children }: QuickBooksConnectedGateProps) {
  const { isConnected, isLoading } = useQuickBooksConnection();

  if (isLoading || !isConnected) {
    return null;
  }

  return <>{children}</>;
}
