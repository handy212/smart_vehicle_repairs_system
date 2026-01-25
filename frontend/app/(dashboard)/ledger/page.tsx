"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function LedgerRedirectPage() {
    useEffect(() => {
        // Redirect to the Django backend's ledger interface
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";
        const ledgerUrl = backendUrl.replace("/api", "/ledger");

        window.location.href = ledgerUrl;
    }, []);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                <div>
                    <h2 className="text-xl font-semibold mb-2">Redirecting to Accounting...</h2>
                    <p className="text-muted-foreground">
                        Taking you to the Django Ledger interface
                    </p>
                </div>
            </div>
        </div>
    );
}
