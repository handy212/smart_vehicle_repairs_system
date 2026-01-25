"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, RefreshCw, Copy, Eye, EyeOff, Building2, User } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { Badge } from "@/components/ui/badge";

export const customerSchema = z.object({
    // User fields
    email: z.string().email("Invalid email address"),
    first_name: z.string().min(1, "First name is required"),
    last_name: z.string().min(1, "Last name is required"),
    phone: z.string().optional(),
    password: z.string().optional(),

    // Portal access
    grant_portal_access: z.boolean().optional(),
    send_welcome_email: z.boolean().optional(),

    // Customer fields
    customer_type: z.enum(["individual", "business", "fleet"]),
    company_name: z.string().optional(),
    business_type: z.string().optional(),
    tax_id: z.string().optional(),
    payment_terms: z.enum(["due_on_receipt", "net_15", "net_30", "net_60", "prepaid"]).optional(),
    status: z.enum(["active", "inactive", "suspended"]),
}).refine((data) => {
    // If portal access is granted, password is required (or will be auto-generated)
    return true; // We'll handle password generation in the UI
}, {
    message: "Password is required when granting portal access",
    path: ["password"],
});

export type CustomerFormData = z.infer<typeof customerSchema>;

interface CustomerFormProps {
    initialData?: Partial<CustomerFormData>;
    onSubmit: (data: CustomerFormData) => Promise<void>;
    isSubmitting: boolean;
    mode: "create" | "edit";
    onCancel?: () => void;
}

export function CustomerForm({ initialData, onSubmit, isSubmitting, mode, onCancel }: CustomerFormProps) {
    const { toast } = useToast();
    const [passwordCopied, setPasswordCopied] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
        watch,
        setValue,
        setError, // Exposed for parent to set manual errors
    } = useForm<CustomerFormData>({
        resolver: zodResolver(customerSchema),
        defaultValues: {
            status: "active",
            customer_type: "individual",
            payment_terms: "due_on_receipt",
            grant_portal_access: false,
            send_welcome_email: false,
            ...initialData,
        },
    });

    const customerType = watch("customer_type");
    const grantPortalAccess = watch("grant_portal_access");
    const passwordValue = watch("password");

    // Generate secure password
    const generatePassword = useCallback(() => {
        const length = 16;
        const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const lowercase = "abcdefghijklmnopqrstuvwxyz";
        const numbers = "0123456789";
        const symbols = "!@#$%^&*";
        const allChars = uppercase + lowercase + numbers + symbols;

        let password = "";
        password += uppercase[Math.floor(Math.random() * uppercase.length)];
        password += lowercase[Math.floor(Math.random() * lowercase.length)];
        password += numbers[Math.floor(Math.random() * numbers.length)];
        password += symbols[Math.floor(Math.random() * symbols.length)];

        for (let i = password.length; i < length; i++) {
            password += allChars[Math.floor(Math.random() * allChars.length)];
        }

        password = password.split("").sort(() => Math.random() - 0.5).join("");
        setValue("password", password);
        setPasswordCopied(false);
    }, [setValue]);

    const handleCopyPassword = async () => {
        if (passwordValue) {
            try {
                await navigator.clipboard.writeText(passwordValue);
                setPasswordCopied(true);
                setTimeout(() => setPasswordCopied(false), 2000);
                toast({
                    title: "Copied!",
                    description: "Password copied to clipboard",
                });
            } catch (err) {
                console.error("Failed to copy password:", err);
            }
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Column */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Personal Info */}
                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-base font-medium flex items-center gap-2">
                                <User className="w-4 h-4 text-primary" />
                                Personal Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="first_name">First Name <span className="text-red-500">*</span></Label>
                                <Input
                                    id="first_name"
                                    placeholder="John"
                                    {...register("first_name")}
                                    className={errors.first_name ? "border-red-500" : ""}
                                />
                                {errors.first_name && <p className="text-xs text-red-500">{errors.first_name.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="last_name">Last Name <span className="text-red-500">*</span></Label>
                                <Input
                                    id="last_name"
                                    placeholder="Doe"
                                    {...register("last_name")}
                                    className={errors.last_name ? "border-red-500" : ""}
                                />
                                {errors.last_name && <p className="text-xs text-red-500">{errors.last_name.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="email@example.com"
                                    {...register("email")}
                                    className={errors.email ? "border-red-500" : ""}
                                />
                                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone</Label>
                                <Input
                                    id="phone"
                                    type="tel"
                                    placeholder="(555) 123-4567"
                                    {...register("phone")}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Business Info (Conditional) */}
                    {(customerType === "business" || customerType === "fleet") && (
                        <Card className="border-l-4 border-l-primary">
                            <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                                <CardTitle className="text-base font-medium flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-primary" />
                                    Business Details
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
                                <div className="space-y-2 sm:col-span-2">
                                    <Label htmlFor="company_name">Company Name <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="company_name"
                                        placeholder="Acme Corp"
                                        {...register("company_name")}
                                        className={errors.company_name ? "border-red-500" : ""}
                                    />
                                    {errors.company_name && <p className="text-xs text-red-500">{errors.company_name.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="business_type">Business Type</Label>
                                    <Input
                                        id="business_type"
                                        placeholder="e.g. Construction"
                                        {...register("business_type")}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="tax_id">Tax ID</Label>
                                    <Input
                                        id="tax_id"
                                        placeholder="XX-XXXXXXX"
                                        {...register("tax_id")}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Portal Access */}
                    <Card className="border-l-4 border-l-green-500">
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-base font-medium">Portal Access</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="grant_portal_access"
                                    {...register("grant_portal_access")}
                                    className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4"
                                />
                                <Label htmlFor="grant_portal_access" className="font-normal cursor-pointer">
                                    Grant portal access to customer
                                </Label>
                            </div>

                            {grantPortalAccess && (
                                <div className="space-y-4 pt-4 border-t border-dashed">
                                    <div>
                                        <Label htmlFor="password">Password {passwordValue ? "" : "(Auto-generated if empty)"}</Label>
                                        <div className="flex gap-2 mt-1">
                                            <div className="relative flex-1">
                                                <Input
                                                    id="password"
                                                    type={showPassword ? "text" : "password"}
                                                    placeholder="Enter password"
                                                    {...register("password")}
                                                    className="pr-10"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
                                                >
                                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                            <Button type="button" variant="secondary" onClick={generatePassword} title="Generate">
                                                <RefreshCw className="w-4 h-4" />
                                            </Button>
                                            {passwordValue && (
                                                <Button type="button" variant="secondary" onClick={handleCopyPassword} title="Copy">
                                                    {passwordCopied ? <span className="text-xs text-green-600">Copied</span> : <Copy className="w-4 h-4" />}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            id="send_welcome_email"
                                            {...register("send_welcome_email")}
                                            className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4"
                                        />
                                        <Label htmlFor="send_welcome_email" className="font-normal cursor-pointer text-sm text-gray-600">
                                            Send welcome email with login details
                                        </Label>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar Column */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-base font-medium">Configuration</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="customer_type">Customer Type</Label>
                                <Select
                                    value={watch("customer_type")}
                                    onValueChange={(val) => setValue("customer_type", val as any)}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="individual">Individual</SelectItem>
                                        <SelectItem value="business">Business</SelectItem>
                                        <SelectItem value="fleet">Fleet</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="status">Status</Label>
                                <Select
                                    value={watch("status")}
                                    onValueChange={(val) => setValue("status", val as any)}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
                                        <SelectItem value="suspended">Suspended</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="payment_terms">Payment Terms</Label>
                                <Select
                                    value={watch("payment_terms")}
                                    onValueChange={(val) => setValue("payment_terms", val as any)}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select terms" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                                        <SelectItem value="net_15">Net 15</SelectItem>
                                        <SelectItem value="net_30">Net 30</SelectItem>
                                        <SelectItem value="net_60">Net 60</SelectItem>
                                        <SelectItem value="prepaid">Prepaid</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-base font-medium">Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3">
                            <Button type="submit" className="w-full" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Saving...
                                    </div>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        {mode === 'create' ? "Create Customer" : "Save Changes"}
                                    </>
                                )}
                            </Button>
                            <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
                                Cancel
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </form>
    );
}
