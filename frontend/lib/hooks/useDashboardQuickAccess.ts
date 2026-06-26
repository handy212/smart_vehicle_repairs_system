"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "dashboardQuickAccessHidden";
const CHANGE_EVENT = "dashboard-quick-access-changed";

function readHiddenPreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return localStorage.getItem(STORAGE_KEY) === "true";
}

function writeHiddenPreference(hidden: boolean) {
  localStorage.setItem(STORAGE_KEY, hidden ? "true" : "false");
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useDashboardQuickAccess() {
  const [isHidden, setIsHidden] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const sync = () => setIsHidden(readHiddenPreference());
    sync();
    setMounted(true);
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const hide = useCallback(() => {
    writeHiddenPreference(true);
    setIsHidden(true);
  }, []);

  const show = useCallback(() => {
    writeHiddenPreference(false);
    setIsHidden(false);
  }, []);

  return {
    isHidden: mounted ? isHidden : false,
    hide,
    show,
  };
}
