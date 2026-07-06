"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MobileInspectionPerformRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/mobile/dashboard");
  }, [router]);
  return null;
}
