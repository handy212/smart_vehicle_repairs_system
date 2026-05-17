"use client";

import { Button } from "@/components/ui/button";
import { Wrench } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

const DEFAULT_MESSAGE = "System is under maintenance. Please check back later.";

function subscribeToMaintenanceMessage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getMaintenanceMessageSnapshot() {
  return sessionStorage.getItem("maintenance_message") || DEFAULT_MESSAGE;
}

export default function MaintenancePage() {
  const message = useSyncExternalStore(
    subscribeToMaintenanceMessage,
    getMaintenanceMessageSnapshot,
    () => DEFAULT_MESSAGE
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-xl text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Wrench className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">Maintenance Mode</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{message}</p>
        <div className="mt-8 flex justify-center">
          <Button asChild variant="outline">
            <Link href="/login">Back to login</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
