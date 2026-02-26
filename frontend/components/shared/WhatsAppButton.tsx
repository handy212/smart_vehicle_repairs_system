"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import { notificationsApi } from "@/lib/api/notifications";
import { useToast } from "@/lib/hooks/useToast";
import { cn } from "@/lib/utils/cn";

interface WhatsAppButtonProps {
    templateType: string;
    objectId: number;
    label?: string;
    phoneNumber?: string;
    className?: string;
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    size?: "default" | "sm" | "lg" | "icon";
    channel?: string; // Default to 'whatsapp_manual'
}

export function WhatsAppButton({
    templateType,
    objectId,
    label = "WhatsApp",
    phoneNumber,
    className,
    variant = "outline",
    size = "default",
    channel = "whatsapp_manual"
}: WhatsAppButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        setIsLoading(true);

        try {
            // 1. Render Template
            const data = await notificationsApi.renderTemplate({
                template_type: templateType,
                object_id: objectId,
                channel: channel
            });

            // 2. Resolve Phone Number
            // eslint-disable-next-line prefer-const
            let targetPhone = phoneNumber || data.phone_number;

            if (!targetPhone) {
                toast({
                    title: "No phone number",
                    description: "Could not resolve a phone number for this customer.",
                    variant: "destructive"
                });
                return;
            }

            // 3. Clean Phone Number (Remove non-digits, ensure format)
            // WhatsApp Click to Chat requires pure digits. 
            // If international, omit leading zeros, but keep country code if present.
            // Assuming system stores numbers reasonably well. 
            // Better to strip '+', ' ', '-', '(', ')'
            const cleanPhone = targetPhone.replace(/\D/g, '');

            // 4. Encode Message
            const encodedMessage = encodeURIComponent(data.message);

            // 5. Open WhatsApp
            const url = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
            window.open(url, '_blank');


        } catch (error: any) {
            console.error("WhatsApp Error:", error);

            let errorMsg = "Failed to prepare WhatsApp message.";
            if (error.response?.data?.error) {
                errorMsg = error.response.data.error;
            }

            toast({
                title: "Error",
                description: errorMsg,
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button
            variant={variant}
            size={size}
            className={cn("gap-2", className)}
            onClick={handleClick}
            disabled={isLoading}
        >
            <MessageSquare className="h-4 w-4" />
            {size !== "icon" && label}
        </Button>
    );
}
