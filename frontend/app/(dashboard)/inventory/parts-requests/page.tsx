"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Parts Requests is consolidated into Stores Workbench → Fulfillment.
 * Keep this route as a redirect so old bookmarks and deep links still work.
 */
function PartsRequestsRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const workOrder = searchParams.get("work_order");
    const qs = new URLSearchParams({ tab: "fulfillment" });
    if (workOrder) qs.set("work_order", workOrder);
    router.replace(`/inventory/quotation-requests?${qs.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
      Redirecting to Stores Workbench…
    </div>
  );
}

export default function PartsRequestsRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
          Redirecting to Stores Workbench…
        </div>
      }
    >
      <PartsRequestsRedirectInner />
    </Suspense>
  );
}
