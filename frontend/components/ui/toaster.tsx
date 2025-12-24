"use client";

import { useToastStore } from "@/store/useToastStore";
import { ToastContainer } from "./toast";

export function Toaster() {
    const { toasts, removeToast } = useToastStore();

    return <ToastContainer toasts={toasts} onClose={removeToast} />;
}
