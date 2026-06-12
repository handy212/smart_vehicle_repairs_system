"use client";

import dynamic from "next/dynamic";

const DiagnosisWorkspace = dynamic(
  () => import("./DiagnosisWorkspace"),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    ),
  }
);

export default function DiagnosisPage() {
  return <DiagnosisWorkspace />;
}
