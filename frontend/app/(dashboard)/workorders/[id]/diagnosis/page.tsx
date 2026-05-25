"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Legacy route — redirects to embedded diagnosis on the work order detail page. */
export default function DiagnosisRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const workOrderId = params.id as string;

  useEffect(() => {
    router.replace(`/workorders/${workOrderId}?tab=diagnosis&panel=full`);
  }, [router, workOrderId]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}
