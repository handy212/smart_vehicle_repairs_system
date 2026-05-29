"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Inspections are not part of the technician field workflow — redirect to dashboard. */
export default function MobileInspectionsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/mobile/dashboard");
  }, [router]);
  return null;
}
