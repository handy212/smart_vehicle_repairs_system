"use client";

import { useCurrency } from "@/lib/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Mail,
    Phone,
    MapPin,
    CreditCard,
    Building,
    User,
    Globe
} from "lucide-react";
import { Customer } from "@/lib/api/customers";

interface ProfileViewProps {
    customer: Customer;
}

export function ProfileView({ customer }: ProfileViewProps) {
    const { currency, formatCurrency } = useCurrency();
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Primary Contact Information */}
                <Card className="shadow-sm border border-border">
                    <CardHeader className="bg-muted/30 bg-muted/20 pb-4 border-b border-border flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-base font-semibold">Primary Contact</CardTitle>
                        <Badge variant={customer.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                            {customer.status}
                        </Badge>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <div className="group flex items-start space-x-3">
                            <User className="w-4 h-4 text-muted-foreground mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-muted-foreground">Full Name</p>
                                <p className="text-sm text-foreground font-medium">
                                    {customer.user?.first_name} {customer.user?.last_name}
                                </p>
                            </div>
                        </div>

                        <div className="group flex items-start space-x-3">
                            <Mail className="w-4 h-4 text-muted-foreground mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-muted-foreground">Email Address</p>
                                <p className="text-sm text-foreground">{customer.user?.email || "-"}</p>
                            </div>
                        </div>

                        <div className="group flex items-start space-x-3">
                            <Phone className="w-4 h-4 text-muted-foreground mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-muted-foreground">Phone</p>
                                <p className="text-sm text-foreground">{customer.user?.phone || "-"}</p>
                            </div>
                        </div>

                        <div className="group flex items-start space-x-3">
                            <Globe className="w-4 h-4 text-muted-foreground mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-muted-foreground">Default Language</p>
                                <p className="text-sm text-foreground capitalize">{customer.default_language || "English"}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Extended Details */}
                <Card className="shadow-sm border border-border">
                    <CardHeader className="bg-muted/30 bg-muted/20 pb-4 border-b border-border">
                        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                             Details & Attributes
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 grid grid-cols-2 gap-y-6 gap-x-4">
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Customer ID</p>
                            <p className="text-sm font-mono font-bold text-primary">{customer.customer_number}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Gender</p>
                            <p className="text-sm text-foreground capitalize">{customer.user?.gender?.replace(/_/g, " ") || "-"}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Date of Birth</p>
                            <p className="text-sm text-foreground">{customer.user?.date_of_birth || "-"}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Occupation</p>
                            <p className="text-sm text-foreground">{customer.occupation || "-"}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Alt. Phone</p>
                            <p className="text-sm text-foreground">{customer.alternative_phone || "-"}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Customer Type</p>
                            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest">{customer.customer_type}</Badge>
                        </div>
                    </CardContent>
                </Card>

                {/* Address Info */}
                <Card className="shadow-sm border border-border">
                    <CardHeader className="bg-muted/30 bg-muted/20 pb-4 border-b border-border">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            Locations
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                        <div className="space-y-1.5">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Service Address</p>
                            <p className="text-sm text-foreground">
                                {customer.service_address || "-"}
                                {(customer.service_city || customer.service_state) && (
                                    <span className="block text-xs text-muted-foreground mt-0.5">
                                        {[customer.service_city, customer.service_state, customer.service_zip_code].filter(Boolean).join(", ")}
                                    </span>
                                )}
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Billing Address</p>
                            <p className="text-sm text-foreground">
                                {customer.billing_address || customer.user?.address || "-"}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Business Info (Conditional) */}
                {(customer.customer_type === "business" || customer.customer_type === "fleet") && (
                    <Card className="shadow-sm border border-primary/20 bg-primary/5">
                        <CardHeader className="bg-primary/10 pb-4 border-b border-primary/20">
                            <CardTitle className="text-base font-bold text-primary flex items-center gap-2">
                                <Building className="w-4 h-4" />
                                Business & Fleet Info
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 grid grid-cols-2 gap-y-6 gap-x-4">
                            <div className="col-span-2 space-y-1 text-center border-b border-primary/10 pb-4">
                                <p className="text-lg font-black tracking-tight text-foreground uppercase">{customer.company_name}</p>
                                <p className="text-xs font-bold text-primary tracking-widest uppercase">{customer.business_type || "General Business"}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Contact Person</p>
                                <p className="text-sm font-bold text-foreground">{customer.contact_person_name || "-"}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Tax ID</p>
                                <p className="text-sm font-mono text-foreground">{customer.tax_id || "-"}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Business Email</p>
                                <p className="text-sm text-foreground">{customer.company_email || "-"}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Business Phone</p>
                                <p className="text-sm text-foreground">{customer.company_phone || "-"}</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Billing & Terms */}
                <Card className="shadow-sm border border-border md:col-span-2">
                    <CardHeader className="bg-muted/30 bg-muted/20 pb-4 border-b border-border">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <CreditCard className="w-4 h-4" />
                            Financial Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Currency</p>
                            <Badge variant="outline" className="font-bold">{customer.currency || currency || "USD"}</Badge>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Payment Method</p>
                            <Badge variant="secondary" className="font-bold uppercase tracking-wider text-[10px]">
                                {customer.default_payment_method?.replace(/_/g, " ") || "-"}
                            </Badge>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Payment Terms</p>
                            <Badge variant="outline" className="font-bold uppercase tracking-widest text-[10px] border-primary/20 text-primary">
                                {customer.payment_terms?.replace(/_/g, " ") || "-"}
                            </Badge>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Credit Limit</p>
                            <p className="text-sm font-black text-foreground">{customer.available_credit ? formatCurrency(parseFloat(customer.available_credit)) : "-"}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
