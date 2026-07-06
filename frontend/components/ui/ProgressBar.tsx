"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function ProgressBar() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [visible, setVisible] = useState(false);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // When route starts changing (or on mount), we simulate progress
        setVisible(true);
        setProgress(30);

        const timer = setTimeout(() => {
            setProgress(100);
            const hideTimer = setTimeout(() => {
                setVisible(false);
                setProgress(0);
            }, 300);
            return () => clearTimeout(hideTimer);
        }, 400);

        return () => clearTimeout(timer);
    }, [pathname, searchParams]);

    if (!visible) return null;

    return (
        <div
            className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-primary/20 pointer-events-none"
            aria-hidden="true"
        >
            <div
                className="h-full bg-primary transition-all duration-300 ease-out shadow-[0_0_8px_var(--primary)]"
                style={{ width: `${progress}%` }}
            />
        </div>
    );
}
