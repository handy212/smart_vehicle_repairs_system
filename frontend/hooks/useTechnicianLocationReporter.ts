"use client";

import { useEffect, useRef } from "react";
import { techniciansApi } from "@/lib/api/technicians";
import { useAuthStore } from "@/store/authStore";

const REPORT_INTERVAL_MS = 60_000;

/**
 * Periodically report the signed-in technician's GPS to the backend while enabled
 * (e.g. while viewing an active roadside job on mobile).
 */
export function useTechnicianLocationReporter(enabled: boolean) {
  const user = useAuthStore((s) => s.user);
  const technicianIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !user) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const resolveTechnicianId = async (): Promise<number | null> => {
      if (technicianIdRef.current) {
        return technicianIdRef.current;
      }
      try {
        const profile = await techniciansApi.getMyProfile();
        technicianIdRef.current = profile.id;
        return profile.id;
      } catch {
        return null;
      }
    };

    const report = async () => {
      const technicianId = await resolveTechnicianId();
      if (!technicianId || cancelled) return;

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (cancelled) return;
          try {
            await techniciansApi.updateLocation(
              technicianId,
              Number(position.coords.latitude.toFixed(6)),
              Number(position.coords.longitude.toFixed(6)),
            );
          } catch {
            // Best-effort; ignore transient network/auth errors.
          }
        },
        () => {
          // Permission denied or unavailable — stop retrying this session.
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
      );
    };

    void report();
    timer = setInterval(() => {
      void report();
    }, REPORT_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [enabled, user?.id]);
}
