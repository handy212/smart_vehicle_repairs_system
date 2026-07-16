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
        runAction(lastAction);
    };

    const runAction = (action: "send" | "save" | "payment") => {
        setLastAction(action);
        switch (action) {
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
                className="rounded-r-none focus:z-10 bg-primary hover:bg-primary/90 w-full md:w-auto"
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
                        className="rounded-l-none border-l border-primary/40 bg-primary hover:bg-primary/90 px-2 focus:z-10"
                        disabled={isSubmitting}
                    >
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[200px]">
                    <DropdownMenuItem onClick={() => runAction("send")}>
                        <Send className="mr-2 h-4 w-4 text-primary" />
                        <span>{getLabel("send")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => runAction("save")}>
                        <Save className="mr-2 h-4 w-4 text-muted-foreground" />
                        <span>{getLabel("save")}</span>
                    </DropdownMenuItem>
                    {onRecordPayment && resourceType === "invoice" && (
                        <DropdownMenuItem onClick={() => runAction("payment")}>
                            <CreditCard className="mr-2 h-4 w-4 text-success" />
                            <span>{getLabel("payment")}</span>
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
