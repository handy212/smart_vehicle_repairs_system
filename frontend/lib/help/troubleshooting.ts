import { AlertTriangle } from "lucide-react";
import type { HelpGuide } from "./types";

export const troubleshootingGuides: HelpGuide[] = [
    {
        id: "ts-all",
        title: "Troubleshooting Guide",
        description: "Resolve common system issues quickly.",
        icon: AlertTriangle,
        section: "troubleshooting",
        keywords: ["troubleshooting", "error", "fix", "problem"],
        topics: [
            {
                title: "Login problems",
                blocks: [
                    {
                        type: "troubleshooting",
                        items: [
                            {
                                problem: "Invalid username or password",
                                solution:
                                    "Verify caps lock. Use password reset from the login page. Contact admin if account is deactivated.",
                            },
                            {
                                problem: "Two-factor code not working",
                                solution:
                                    "Ensure device time is synced. Request a backup code from admin. Re-enroll 2FA if device was replaced.",
                            },
                            {
                                problem: "Login page loops or blank screen",
                                solution:
                                    "Clear browser cache and cookies. Try incognito mode. Confirm you are using the correct staff URL (not the customer portal).",
                            },
                            {
                                problem: "Google sign-in fails",
                                solution:
                                    "Admin must enable Google OAuth in Settings → Integrations. Your Google email must match your user account.",
                            },
                        ],
                    },
                ],
            },
            {
                title: "Missing permissions or hidden modules",
                blocks: [
                    {
                        type: "troubleshooting",
                        items: [
                            {
                                problem: "Sidebar module is missing",
                                solution:
                                    "Your role may lack permission, or the area may be unavailable. Contact your administrator.",
                            },
                            {
                                problem: "Action button is greyed out or absent",
                                solution:
                                    "Check your role permissions in Admin → Roles. Example: bulk invoice send requires billing send permission.",
                            },
                            {
                                problem: "Cannot see other branch data",
                                solution:
                                    "By design — receptionists and technicians see only their assigned branch. Managers see managed branches.",
                            },
                        ],
                    },
                ],
                actionLink: "/admin/roles",
                actionLabel: "Review Roles",
            },
            {
                title: "Invoice and payment issues",
                blocks: [
                    {
                        type: "troubleshooting",
                        items: [
                            {
                                problem: "Cannot create invoice from work order",
                                solution:
                                    "Work order must be **Completed** or **Invoiced** status. Ensure all parts are allocated and estimate was approved.",
                            },
                            {
                                problem: "Paystack payment shows pending",
                                solution:
                                    "Customer may have abandoned checkout. Check Paystack dashboard. Webhook must reach API URL — contact admin.",
                            },
                            {
                                problem: "Payment applied to wrong invoice",
                                solution:
                                    "Accountant can reallocate from payment detail or issue credit note. Do not delete payment records.",
                            },
                            {
                                problem: "Till balance does not match cash drawer",
                                solution:
                                    "Review Pay In/Pay Out entries. Verify all counter payments were recorded against open till.",
                            },
                        ],
                    },
                ],
                actionLink: "/billing/payments",
                actionLabel: "Payments",
            },
            {
                title: "Mobile sync issues",
                blocks: [
                    {
                        type: "troubleshooting",
                        items: [
                            {
                                problem: "Offline changes not syncing",
                                solution:
                                    "Open mobile dashboard with connectivity. Wait 30 seconds. Log out and back in if sync queue is stuck.",
                            },
                            {
                                problem: "Photos fail to upload",
                                solution:
                                    "Grant camera/storage permissions. Use Wi-Fi for large uploads. Retry from work order photos page.",
                            },
                            {
                                problem: "Assigned jobs not showing on mobile",
                                solution:
                                    "Confirm you are primary technician on the job. Refresh list. Check branch assignment on your user profile.",
                            },
                        ],
                    },
                ],
                actionLink: "/mobile/dashboard",
                actionLabel: "Mobile Dashboard",
            },
            {
                title: "Report and export issues",
                blocks: [
                    {
                        type: "troubleshooting",
                        items: [
                            {
                                problem: "Export button does nothing",
                                solution:
                                    "Check pop-up blocker. Some inventory exports show 'coming soon' — use Excel export from list pages instead.",
                            },
                            {
                                problem: "Report shows zero data",
                                solution:
                                    "Verify date range and branch filter. Confirm you have report permission for that module.",
                            },
                            {
                                problem: "Scheduled report not received",
                                solution:
                                    "Check spam folder. Verify recipient email in schedule settings. Admin checks email SMTP configuration.",
                            },
                        ],
                    },
                ],
                actionLink: "/reports",
                actionLabel: "Reports",
            },
            {
                title: "Notification issues",
                blocks: [
                    {
                        type: "troubleshooting",
                        items: [
                            {
                                problem: "Customer not receiving SMS",
                                solution:
                                    "Verify phone number format. Check Hubtel SMS is enabled in settings. Review Messages logs for delivery status.",
                            },
                            {
                                problem: "Email notifications not arriving",
                                solution:
                                    "Admin verifies SMTP settings. Check customer spam folder. Confirm email on customer profile is correct.",
                            },
                            {
                                problem: "Push notifications not working",
                                solution:
                                    "Enable notifications in browser. Verify Firebase is configured. Customer must allow portal notifications.",
                            },
                        ],
                    },
                ],
                actionLink: "/notifications",
                actionLabel: "Notifications",
            },
        ],
    },
];
