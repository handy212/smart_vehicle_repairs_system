"use client";

import { useCallback, useState } from "react";
import { useQueryClient, QueryKey } from "@tanstack/react-query";
import { quickbooksApi } from "@/lib/api/quickbooks";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

export type QboOutboundEntityType =
  | "customer"
  | "invoice"
  | "payment"
  | "supplier"
  | "purchase_order"
  | "branch"
  | "estimate"
  | "credit_note"
  | "vendor_bill"
  | "vendor_credit"
  | "bill_payment"
  | "vendor_expense"
  | "part";

export interface UseQboEntitySyncOptions {
  entityType: QboOutboundEntityType;
  objectId: number;
  queryKey: QueryKey;
  extraQueryKeys?: QueryKey[];
  inline?: boolean;
  syncSuccessMessage?: string;
  clearSuccessMessage?: string;
  syncErrorMessage?: string;
  clearErrorMessage?: string;
}

export function useQboEntitySync({
  entityType,
  objectId,
  queryKey,
  extraQueryKeys = [],
  inline = false,
  syncSuccessMessage = "QuickBooks sync triggered. Status should update shortly.",
  clearSuccessMessage = "QuickBooks link cleared. You can push again to re-link.",
  syncErrorMessage = "Failed to trigger QuickBooks synchronization.",
  clearErrorMessage = "Could not clear the QuickBooks link.",
}: UseQboEntitySyncOptions) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
    for (const key of extraQueryKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  }, [queryClient, queryKey, extraQueryKeys]);

  const handleSync = useCallback(async () => {
    if (!objectId || objectId <= 0) return;
    try {
      setIsSyncing(true);
      const result = await quickbooksApi.syncOutbound({
        entity_type: entityType,
        object_id: objectId,
        ...(inline ? { inline: true } : {}),
      });
      if (
        inline &&
        result &&
        typeof result === "object" &&
        "status" in result &&
        (result as { status?: string }).status === "failed"
      ) {
        const failed = result as { detail?: string; qbo_sync_error?: string };
        toast({
          title: "Sync Failed",
          description:
            failed.detail || failed.qbo_sync_error || syncErrorMessage,
          variant: "destructive",
        });
        invalidate();
        return;
      }
      toast({ title: "QuickBooks Sync", description: syncSuccessMessage });
      invalidate();
    } catch (error: unknown) {
      toast({
        title: "Sync Failed",
        description: getUserFacingError(error, syncErrorMessage),
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  }, [
    objectId,
    entityType,
    toast,
    syncSuccessMessage,
    syncErrorMessage,
    invalidate,
    inline,
  ]);

  const handleClearMapping = useCallback(async () => {
    if (!objectId || objectId <= 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Clear the QuickBooks link for this record? The next sync will match or create a new QBO record."
      )
    ) {
      return;
    }
    try {
      setIsClearing(true);
      await quickbooksApi.clearMapping({ entity_type: entityType, object_id: objectId });
      toast({ title: "QuickBooks Link Cleared", description: clearSuccessMessage });
      invalidate();
    } catch (error: unknown) {
      toast({
        title: "Clear Failed",
        description: getUserFacingError(error, clearErrorMessage),
        variant: "destructive",
      });
    } finally {
      setIsClearing(false);
    }
  }, [
    objectId,
    entityType,
    toast,
    clearSuccessMessage,
    clearErrorMessage,
    invalidate,
  ]);

  return {
    isSyncing,
    isClearing,
    handleSync,
    handleClearMapping,
  };
}
