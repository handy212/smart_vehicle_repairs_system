"use client";

import { useCurrency } from "@/lib/hooks/useCurrency";
import { format } from "date-fns";
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
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Primary Contact Information */}
                <Card className="shadow-sm border border-gray-100 dark:border-gray-800">
                    <CardHeader className="bg-gray-50/30 dark:bg-gray-800/20 pb-4 border-b border-gray-100 dark:border-gray-800">
                        <CardTitle className="text-base font-semibold">Primary Contact</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <div className="group flex items-start space-x-3">
                            <User className="w-4 h-4 text-gray-400 mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Full Name</p>
                                <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                                    {customer.user?.first_name} {customer.user?.last_name}
                                </p>
                            </div>
                        </div>

                        <div className="group flex items-start space-x-3">
                            <Mail className="w-4 h-4 text-gray-400 mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Email Address</p>
                                <p className="text-sm text-gray-900 dark:text-gray-100">{customer.user?.email || "-"}</p>
                            </div>
                        </div>

                        <div className="group flex items-start space-x-3">
                            <Phone className="w-4 h-4 text-gray-400 mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</p>
                                <p className="text-sm text-gray-900 dark:text-gray-100">{customer.user?.phone || "-"}</p>
                            </div>
                        </div>

                        <div className="group flex items-start space-x-3">
                            <Globe className="w-4 h-4 text-gray-400 mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Default Language</p>
                                <p className="text-sm text-gray-900 dark:text-gray-100 capitalize">{customer.default_language || "English"}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Address & Business Info */}
                <Card className="shadow-sm border border-gray-100 dark:border-gray-800">
                    <CardHeader className="bg-gray-50/30 dark:bg-gray-800/20 pb-4 border-b border-gray-100 dark:border-gray-800">
                        <CardTitle className="text-base font-semibold">Address & Details</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <div className="group flex items-start space-x-3">
                            <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Billing Address</p>
                                <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-line">{customer.billing_address || customer.user?.address || "-"}</p>
                            </div>
                        </div>

                        <div className="group flex items-start space-x-3">
                            <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Shipping Address</p>
                                <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-line">{customer.shipping_address || "-"}</p>
                            </div>
                        </div>

                        <div className="group flex items-start space-x-3">
                            <CreditCard className="w-4 h-4 text-gray-400 mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Currency & Terms</p>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="font-normal">{customer.currency || "USD"}</Badge>
                                    <Badge variant="outline" className="font-normal capitalize">{customer.payment_terms?.replace(/_/g, " ")}</Badge>
                                </div>
                            </div>
                        </div>

                        {customer.customer_type !== "individual" && (
                            <div className="group flex items-start space-x-3">
                                <Building className="w-4 h-4 text-gray-400 mt-1" />
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Company Details</p>
                                    <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{customer.company_name}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">VAT: {customer.vat_number || "-"}</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
