"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MobileInspectionDetailRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/mobile/dashboard");
  }, [router]);
  return null;
}
