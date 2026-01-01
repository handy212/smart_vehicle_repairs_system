export const WORK_ORDER_STATUSES = [
    { value: "draft", label: "Draft", color: "gray" },
    { value: "inspection", label: "Initial Inspection", color: "blue" },
    { value: "intake", label: "Intake", color: "indigo" },
    { value: "diagnosis", label: "Diagnosis", color: "purple" },
    { value: "awaiting_approval", label: "Awaiting Approval", color: "yellow" },
    { value: "approved", label: "Approved", color: "green" },
    { value: "in_progress", label: "In Progress", color: "blue" },
    { value: "paused", label: "Paused", color: "orange" },
    { value: "quality_check", label: "Quality Check", color: "cyan" },
    { value: "completed", label: "Completed", color: "green" },
    { value: "invoiced", label: "Invoiced", color: "teal" },
    { value: "closed", label: "Closed", color: "gray" },
    { value: "cancelled", label: "Cancelled", color: "red" },
];

export function getStatusColor(status: string): string {
    const statusDef = WORK_ORDER_STATUSES.find(s => s.value === status);
    return statusDef ? statusDef.color : "gray";
}

export function getStatusLabel(status: string): string {
    const statusDef = WORK_ORDER_STATUSES.find(s => s.value === status);
    return statusDef ? statusDef.label : status?.replace(/_/g, " ") || status;
}

export function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "danger" | undefined {
    switch (status) {
        case "completed":
        case "closed":
            return "success";
        case "in_progress":
        case "approved":
        case "quality_check":
            return "info";
        case "pending":
        case "draft":
        case "awaiting_approval":
        case "inspection":
        case "intake":
        case "diagnosis":
            return "warning";
        case "cancelled":
        case "urgent": // Handling priority here too if needed, or stick to status
            return "danger";
        default:
            return "default";
    }
}
