"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PremiumIcons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface AdvancedWidgetProps {
    title: string;
    icon?: keyof typeof PremiumIcons;
    children: React.ReactNode;
    className?: string;
    headerAction?: React.ReactNode;
    footer?: React.ReactNode;
    collapsible?: boolean;
    defaultExpanded?: boolean;
}

export function AdvancedWidget({
    title,
    icon,
    children,
    className,
    headerAction,
    footer,
    collapsible = false,
    defaultExpanded = true,
}: AdvancedWidgetProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const containerRef = useRef<HTMLDivElement>(null);
    const Icon = icon ? PremiumIcons[icon] : null;

    // Mouse move effect for interactive glow
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        containerRef.current.style.setProperty("--mouse-x", `${x}px`);
        containerRef.current.style.setProperty("--mouse-y", `${y}px`);
    };

    return (
        <motion.div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={cn(
                "glass-card interactive-glow rounded-3xl group/widget",
                className
            )}
        >
            <div className="relative z-10 p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        {Icon && (
                            <div className="p-2 rounded-xl bg-primary/10 group-hover/widget:bg-primary/20 transition-colors duration-300">
                                <Icon className="w-5 h-5 text-primary group-hover/widget:scale-110 transition-transform duration-300" />
                            </div>
                        )}
                        <h3 className="text-sm font-bold text-foreground tracking-tight uppercase opacity-80 group-hover/widget:opacity-100 transition-opacity">
                            {title}
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {headerAction}
                        {collapsible && (
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <motion.div
                                    animate={{ rotate: isExpanded ? 0 : 180 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <PremiumIcons.ChevronDown className="w-4 h-4 text-muted-foreground" />
                                </motion.div>
                            </button>
                        )}
                    </div>
                </div>

                <AnimatePresence initial={false}>
                    {isExpanded && (
                        <motion.div
                            initial="collapsed"
                            animate="open"
                            exit="collapsed"
                            variants={{
                                open: { opacity: 1, height: "auto" },
                                collapsed: { opacity: 0, height: 0 },
                            }}
                            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                            className="overflow-hidden"
                        >
                            <div className="relative">{children}</div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {footer && (
                    <div className="mt-4 pt-4 border-t border-white/5 opacity-80">
                        {footer}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
