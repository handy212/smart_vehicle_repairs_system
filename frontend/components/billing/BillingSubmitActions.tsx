"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Send, Save, CreditCard } from "lucide-react";

interface BillingSubmitActionsProps {
    onSave: () => void;
    onSend: () => void;
    onRecordPayment?: () => void;
    isSubmitting?: boolean;
    resourceType: "invoice" | "estimate";
    mode?: "create" | "edit";
}

export function BillingSubmitActions({
    onSave,
    onSend,
    onRecordPayment,
    isSubmitting = false,
    resourceType,
    mode = "create",
}: BillingSubmitActionsProps) {
    const [lastAction, setLastAction] = React.useState<"send" | "save" | "payment">("send");

    const getVerb = () => (mode === "create" ? "Create" : "Save");

    const getLabel = (action: "send" | "save" | "payment") => {
        const verb = getVerb();
        switch (action) {
            case "send":
                return `${verb} & Send`;
            case "save":
                return `${verb} & Send Later`; // Implies Draft
            case "payment":
                return `${verb} & Pay`;
        }
    };

    const handleClick = () => {
        switch (lastAction) {
            case "send":
                onSend();
                break;
            case "save":
                onSave();
                break;
            case "payment":
                if (onRecordPayment) onRecordPayment();
                break;
        }
    };

    return (
        <div className="flex -space-x-px">
            <Button
                type="button"
                className="rounded-r-none focus:z-10 bg-blue-600 hover:bg-blue-700 w-full md:w-auto"
                onClick={handleClick}
                disabled={isSubmitting}
            >
                {isSubmitting ? (
                    "Processing..."
                ) : (
                    <>
                        {lastAction === "send" && <Send className="mr-2 h-4 w-4" />}
                        {lastAction === "save" && <Save className="mr-2 h-4 w-4" />}
                        {lastAction === "payment" && <CreditCard className="mr-2 h-4 w-4" />}
                        {getLabel(lastAction)}
                    </>
                )}
            </Button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        className="rounded-l-none border-l border-blue-700/50 bg-blue-600 hover:bg-blue-700 px-2 focus:z-10"
                        disabled={isSubmitting}
                    >
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[200px]">
                    <DropdownMenuItem onClick={() => setLastAction("send")}>
                        <Send className="mr-2 h-4 w-4 text-blue-600" />
                        <span>{getLabel("send")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLastAction("save")}>
                        <Save className="mr-2 h-4 w-4 text-gray-500" />
                        <span>{getLabel("save")}</span>
                    </DropdownMenuItem>
                    {onRecordPayment && resourceType === "invoice" && (
                        <DropdownMenuItem onClick={() => setLastAction("payment")}>
                            <CreditCard className="mr-2 h-4 w-4 text-green-600" />
                            <span>{getLabel("payment")}</span>
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
