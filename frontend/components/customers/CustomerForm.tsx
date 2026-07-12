"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Controller } from "react-hook-form";
import { GHANA_REGIONS } from "@/lib/constants/ghana-regions";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CheckCircle2, RefreshCw, Copy, Eye, EyeOff, Building2, User, Briefcase } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useState, useCallback } from "react";
import { useToast } from "@/lib/hooks/useToast";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Badge } from "@/components/ui/badge";

export const customerSchema = z.object({
    // User fields
    email: z.string().email("Invalid email address"),
    first_name: z.string().min(1, "First name is required"),
    last_name: z.string().min(1, "Last name is required"),
    phone: z.string().optional(),
    alternative_phone: z.string().optional(),
    gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
    occupation: z.string().optional(),
    password: z.string().optional(),
    date_of_birth: z.string().optional(), // Using string for date input

    // Portal access
    grant_portal_access: z.boolean().optional(),
    send_welcome_email: z.boolean().optional(),

    // Customer fields
    customer_type: z.enum(["individual", "business", "fleet"]),
    company_name: z.string().optional(),
    contact_person_name: z.string().optional(),
    company_email: z.string().email("Invalid company email").or(z.literal("")).optional(),
    company_phone: z.string().optional(),
    business_type: z.string().optional(),
    tax_id: z.string().optional(),
    payment_terms: z.enum(["due_on_receipt", "net_15", "net_30", "net_60", "prepaid"]).optional(),
    default_payment_method: z.enum(["cash", "momo", "card", "bank_transfer", "check"]).optional(),
    status: z.enum(["active", "inactive", "suspended", "blacklisted"]),
    service_address: z.string().optional(),
    service_region: z.string().optional(),
    service_city: z.string().optional(),
    service_area: z.string().optional(),
    preferred_contact_method: z.enum(["email", "phone", "sms", "mail"]).optional(),
    notes: z.string().optional(),
}).superRefine((data, ctx) => {
    if (
        (data.customer_type === "business" || data.customer_type === "fleet") &&
        !data.company_name?.trim()
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Company name is required",
            path: ["company_name"],
        });
    }
});

export type CustomerFormData = z.infer<typeof customerSchema>;

interface CustomerFormProps {
    initialData?: Partial<CustomerFormData>;
    onSubmit: (data: CustomerFormData) => Promise<void>;
    isSubmitting: boolean;
    mode: "create" | "edit";
    onCancel?: () => void;
    hidePortalAccess?: boolean;
}

export function CustomerForm({ initialData, onSubmit, isSubmitting, mode, onCancel, hidePortalAccess = false }: CustomerFormProps) {
    const { toast } = useToast();
    const [passwordCopied, setPasswordCopied] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const {
        register,
        handleSubmit,
        control,
        formState: { errors },
        watch,
        setValue,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        setError, // Exposed for parent to set manual errors
    } = useForm<CustomerFormData>({
        resolver: zodResolver(customerSchema),
        defaultValues: {
            status: "active",
            customer_type: "individual",
            payment_terms: "due_on_receipt",
            default_payment_method: "cash",
            grant_portal_access: false,
            send_welcome_email: false,
            ...initialData,
        },
    });

    const customerType = watch("customer_type");
    const grantPortalAccess = watch("grant_portal_access");
    const passwordValue = watch("password");
    const isBusinessAccount = customerType === "business" || customerType === "fleet";

    const handleCustomerTypeChange = (value: CustomerFormData["customer_type"]) => {
        setValue("customer_type", value);
        if (value === "individual") {
            setValue("company_name", "");
            setValue("contact_person_name", "");
            setValue("company_email", "");
            setValue("company_phone", "");
            setValue("business_type", "");
            setValue("tax_id", "");
        }
    };

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
                    {/* Customer type — drives which fields appear below */}
                    <Card className="border-primary/20 bg-muted/20">
                        <CardContent className="pt-4 pb-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                <div className="space-y-1 flex-1 min-w-0">
                                    <Label htmlFor="customer_type_main">Customer type</Label>
                                    {/* <p className="text-xs text-muted-foreground">
                                        {isBusinessAccount
                                            ? "Business and fleet accounts use company and billing contact fields."
                                            : "Individual accounts use personal profile fields."}
                                    </p> */}
                                </div>
                                <Select
                                    value={customerType}
                                    onValueChange={(val) => handleCustomerTypeChange(val as CustomerFormData["customer_type"])}
                                >
                                    <SelectTrigger id="customer_type_main" className="w-full sm:w-[220px]">
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="individual">Individual</SelectItem>
                                        <SelectItem value="business">Business</SelectItem>
                                        <SelectItem value="fleet">Fleet</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    {!isBusinessAccount ? (
                        <Card key="individual-profile">
                            <CardHeader className="pb-3 border-b border-border">
                                <CardTitle className="text-base font-medium flex items-center gap-2">
                                    <User className="w-4 h-4 text-primary" />
                                    Personal information
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="first_name">First name <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="first_name"
                                        placeholder="John"
                                        {...register("first_name")}
                                        className={errors.first_name ? "border-destructive" : ""}
                                    />
                                    {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="last_name">Last name <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="last_name"
                                        placeholder="Doe"
                                        {...register("last_name")}
                                        className={errors.last_name ? "border-destructive" : ""}
                                    />
                                    {errors.last_name && <p className="text-xs text-destructive">{errors.last_name.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="email@example.com"
                                        {...register("email")}
                                        className={errors.email ? "border-destructive" : ""}
                                    />
                                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone</Label>
                                    <Input id="phone" type="tel" placeholder="(555) 123-4567" {...register("phone")} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="alternative_phone">Alternative phone</Label>
                                    <Input id="alternative_phone" type="tel" placeholder="(555) 987-6543" {...register("alternative_phone")} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="gender">Gender</Label>
                                    <Select value={watch("gender")} onValueChange={(val) => setValue("gender", val as CustomerFormData["gender"])}>
                                        <SelectTrigger id="gender">
                                            <SelectValue placeholder="Select gender" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="male">Male</SelectItem>
                                            <SelectItem value="female">Female</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                            <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="date_of_birth">Date of birth</Label>
                                    <Input id="date_of_birth" type="date" {...register("date_of_birth")} />
                                </div>
                                <div className="space-y-2 sm:col-span-2">
                                    <Label htmlFor="occupation">Occupation</Label>
                                    <Input id="occupation" placeholder="e.g. Engineer" {...register("occupation")} />
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card key="business-profile" className="border-l-4 border-l-primary">
                            <CardHeader className="pb-3 border-b border-border">
                                <CardTitle className="text-base font-medium flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-primary" />
                                    {customerType === "fleet" ? "Fleet account" : "Business account"}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-6">
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <div className="space-y-2 sm:col-span-2">
                                        <Label htmlFor="company_name">
                                            {customerType === "fleet" ? "Fleet / company name" : "Company name"}{" "}
                                            <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            id="company_name"
                                            placeholder={customerType === "fleet" ? "Metro Fleet Services" : "Acme Corp"}
                                            {...register("company_name")}
                                            className={errors.company_name ? "border-destructive" : ""}
                                        />
                                        {errors.company_name && <p className="text-xs text-destructive">{errors.company_name.message}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="business_type">Business type / industry</Label>
                                        <Input id="business_type" placeholder="e.g. Construction, Logistics" {...register("business_type")} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="tax_id">Tax ID / registration number</Label>
                                        <Input id="tax_id" placeholder="XX-XXXXXXX" {...register("tax_id")} />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                                        <Briefcase className="w-4 h-4 text-muted-foreground" />
                                        Primary contact
                                    </p>
                                    <p className="text-xs text-muted-foreground -mt-2">
                                        Account login and notifications use this person&apos;s details, and this person is saved automatically under Contacts.
                                    </p>
                                    <div className="grid sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="first_name">Contact first name <span className="text-destructive">*</span></Label>
                                            <Input
                                                id="first_name"
                                                placeholder="Jane"
                                                {...register("first_name")}
                                                className={errors.first_name ? "border-destructive" : ""}
                                            />
                                            {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="last_name">Contact last name <span className="text-destructive">*</span></Label>
                                            <Input
                                                id="last_name"
                                                placeholder="Smith"
                                                {...register("last_name")}
                                                className={errors.last_name ? "border-destructive" : ""}
                                            />
                                            {errors.last_name && <p className="text-xs text-destructive">{errors.last_name.message}</p>}
                                        </div>
                                        <div className="space-y-2 sm:col-span-2">
                                            <Label htmlFor="contact_person_name">Contact display name (optional)</Label>
                                            <Input
                                                id="contact_person_name"
                                                placeholder="Defaults to the contact's full name if left blank"
                                                {...register("contact_person_name")}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Contact email <span className="text-destructive">*</span></Label>
                                            <Input
                                                id="email"
                                                type="email"
                                                placeholder="contact@acme.com"
                                                {...register("email")}
                                                className={errors.email ? "border-destructive" : ""}
                                            />
                                            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="phone">Contact phone</Label>
                                            <Input id="phone" type="tel" placeholder="(555) 123-4567" {...register("phone")} />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <p className="text-sm font-medium text-foreground">Company contact</p>
                                    <div className="grid sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="company_email">Billing / company email</Label>
                                            <Input
                                                id="company_email"
                                                type="email"
                                                placeholder="billing@acme.com"
                                                {...register("company_email")}
                                                className={errors.company_email ? "border-destructive" : ""}
                                            />
                                            {errors.company_email && <p className="text-xs text-destructive">{errors.company_email.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="company_phone">Company phone</Label>
                                            <Input id="company_phone" type="tel" placeholder="(555) 000-1111" {...register("company_phone")} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="alternative_phone">Alternative phone</Label>
                                            <Input id="alternative_phone" type="tel" placeholder="(555) 987-6543" {...register("alternative_phone")} />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader className="pb-3 border-b border-border">
                            <CardTitle className="text-base font-medium">
                                {isBusinessAccount ? "Business / service location" : "Service address"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="service_address">Street address</Label>
                                <Input id="service_address" placeholder="Street / landmark" {...register("service_address")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="service_region">Region</Label>
                                <Controller
                                    name="service_region"
                                    control={control}
                                    render={({ field }) => (
                                        <Select value={field.value || ""} onValueChange={field.onChange}>
                                            <SelectTrigger id="service_region" className="w-full">
                                                <SelectValue placeholder="Select region" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {GHANA_REGIONS.map((region) => (
                                                    <SelectItem key={region} value={region}>
                                                        {region}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="service_city">City</Label>
                                <Input id="service_city" placeholder="e.g. Accra" {...register("service_city")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="service_area">Area</Label>
                                <Input id="service_area" placeholder="e.g. East Legon" {...register("service_area")} />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-blue-500">
                        <CardHeader className="pb-3 border-b border-border">
                            <CardTitle className="text-base font-medium">Preferences & Notes</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="preferred_contact_method">Preferred Contact Method</Label>
                                <Select
                                    value={watch("preferred_contact_method") || "email"}
                                    onValueChange={(val) => setValue("preferred_contact_method", val as any)}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select method" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="email">Email</SelectItem>
                                        <SelectItem value="phone">Phone Call</SelectItem>
                                        <SelectItem value="sms">SMS / Text</SelectItem>
                                        <SelectItem value="mail">Physical Mail</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="notes">Internal Notes</Label>
                                <textarea
                                    id="notes"
                                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-sans"
                                    placeholder="Special instructions, behavior, etc."
                                    {...register("notes")}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Portal Access */}
                    {!hidePortalAccess && (
                        <Card className="border-l-4 border-l-green-500">
                            <CardHeader className="pb-3 border-b border-border">
                                <CardTitle className="text-base font-medium">Portal Access</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="grant_portal_access"
                                        {...register("grant_portal_access")}
                                        className="rounded border-border text-primary focus:ring-primary w-4 h-4"
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
                                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                                                    >
                                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                                <Button type="button" variant="secondary" onClick={generatePassword} title="Generate">
                                                    <RefreshCw className="w-4 h-4" />
                                                </Button>
                                                {passwordValue && (
                                                    <Button type="button" variant="secondary" onClick={handleCopyPassword} title="Copy">
                                                        {passwordCopied ? <span className="text-xs text-success">Copied</span> : <Copy className="w-4 h-4" />}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                id="send_welcome_email"
                                                {...register("send_welcome_email")}
                                                className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                                            />
                                            <Label htmlFor="send_welcome_email" className="font-normal cursor-pointer text-sm text-muted-foreground">
                                                Send welcome email with login details
                                            </Label>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Sidebar Column */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader className="pb-3 border-b border-border">
                            <CardTitle className="text-base font-medium">Account Setup</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                                <span className="text-muted-foreground">Type: </span>
                                <span className="font-medium capitalize">{customerType}</span>
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
                                        <SelectItem value="blacklisted">Blacklisted</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="default_payment_method">Default Payment Method</Label>
                                <Select
                                    value={watch("default_payment_method")}
                                    onValueChange={(val) => setValue("default_payment_method", val as any)}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select method" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cash">Cash</SelectItem>
                                        <SelectItem value="momo">MoMo</SelectItem>
                                        <SelectItem value="card">Credit</SelectItem>
                                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                        <SelectItem value="check">Check</SelectItem>
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
                        <CardHeader className="pb-3 border-b border-border">
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
