import type { Notification } from "@/lib/api/notifications";
import type { SearchResult } from "@/lib/api/search";

type NotificationSurface = "staff" | "portal" | "mobile";

const ROUTE_PATTERNS: Record<NotificationSurface, readonly RegExp[]> = {
  staff: [
    /^\/appointments\/[A-Za-z0-9_-]+\/?$/,
    /^\/workorders\/[A-Za-z0-9_-]+\/?$/,
    /^\/billing\/(?:invoices|estimates|payments)\/[A-Za-z0-9_-]+\/?$/,
    /^\/customers\/[A-Za-z0-9_-]+\/?$/,
    /^\/vehicles\/[A-Za-z0-9_-]+\/?$/,
    /^\/inspections\/[A-Za-z0-9_-]+\/?$/,
    /^\/inventory\/(?:transfers|purchase-orders)\/[A-Za-z0-9_-]+\/?$/,
    /^\/inventory\/[A-Za-z0-9_-]+\/?$/,
    /^\/inventory\/quotation-requests\/?$/,
    /^\/subscriptions\/?$/,
    /^\/roadside\/[A-Za-z0-9_-]+\/?$/,
  ],
  portal: [
    /^\/portal\/appointments\/[A-Za-z0-9_-]+\/?$/,
    /^\/portal\/work-orders\/[A-Za-z0-9_-]+\/?$/,
    /^\/portal\/(?:invoices|estimates|vehicles|inspections|subscriptions)\/[A-Za-z0-9_-]+\/?$/,
    /^\/portal\/payment\/[A-Za-z0-9_-]+\/?$/,
    /^\/portal\/roadside\/[A-Za-z0-9_-]+\/?$/,
    /^\/portal\/profile\/?$/,
  ],
  mobile: [
    /^\/mobile\/workorders\/[A-Za-z0-9_-]+\/?$/,
    /^\/mobile\/roadside\/[A-Za-z0-9_-]+\/?$/,
    /^\/mobile\/schedule\/?$/,
  ],
};

export function getSafeNotificationDataUrl(
  rawUrl: unknown,
  surface: NotificationSurface,
  origin: string,
): string | null {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;

  try {
    const parsed = new URL(rawUrl, origin);
    if (parsed.origin !== origin) return null;
    if (!ROUTE_PATTERNS[surface].some((pattern) => pattern.test(parsed.pathname))) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function notificationData(notification: Notification): Record<string, unknown> {
  return (notification.data || {}) as Record<string, unknown>;
}

export function getNotificationHref(
  notification: Notification,
  role: string | undefined,
  origin: string,
): string | null {
  const surface: NotificationSurface = role === "customer" ? "portal" : "staff";
  const data = notificationData(notification);
  const safeDataUrl = getSafeNotificationDataUrl(data.url, surface, origin);
  if (safeDataUrl) return safeDataUrl;

  const workOrderId = data.work_order_id;
  if (workOrderId && notification.notification_type === "inventory" && surface === "staff") {
    const tab =
      data.action === "quotation_request" || data.source === "recommendations_quote"
        ? "quotes"
        : "fulfillment";
    return `/inventory/quotation-requests?tab=${tab}&work_order=${workOrderId}`;
  }

  const typeRaw = notification.related_object_type || notification.notification_type;
  if (!typeRaw || !notification.related_object_id) return null;

  const type = typeRaw.toLowerCase();
  const id = notification.related_object_id;

  if (surface === "portal") {
    const portalRoutes: Record<string, string> = {
      appointment: `/portal/appointments/${id}`,
      workorder: `/portal/work-orders/${id}`,
      work_order: `/portal/work-orders/${id}`,
      invoice: `/portal/invoices/${id}`,
      estimate: `/portal/estimates/${id}`,
      customer: "/portal/profile",
      vehicle: `/portal/vehicles/${id}`,
      inspection: `/portal/inspections/${id}`,
      payment: `/portal/payment/${id}`,
      subscription: `/portal/subscriptions/${id}`,
      roadside: `/portal/roadside/${id}`,
      roadside_request: `/portal/roadside/${id}`,
      roadsideassistancerequest: `/portal/roadside/${id}`,
    };
    return portalRoutes[type] || null;
  }

  if (type === "work_order_part") {
    return workOrderId
      ? `/inventory/quotation-requests?tab=fulfillment&work_order=${workOrderId}`
      : "/inventory/quotation-requests?tab=fulfillment";
  }
  if ((type === "part" || type === "inventory") && workOrderId) {
    return `/inventory/quotation-requests?tab=fulfillment&work_order=${workOrderId}`;
  }

  const staffRoutes: Record<string, string> = {
    appointment: `/appointments/${id}`,
    workorder: `/workorders/${id}`,
    work_order: `/workorders/${id}`,
    invoice: `/billing/invoices/${id}`,
    estimate: `/billing/estimates/${id}`,
    customer: `/customers/${id}`,
    vehicle: `/vehicles/${id}`,
    inspection: `/inspections/${id}`,
    payment: `/billing/payments/${id}`,
    transfer: `/inventory/transfers/${id}`,
    inventory_transfer: `/inventory/transfers/${id}`,
    purchase_order: `/inventory/purchase-orders/${id}`,
    "purchase-order": `/inventory/purchase-orders/${id}`,
    part: `/inventory/${id}`,
    inventory: `/inventory/${id}`,
    subscription: `/subscriptions?subscription=${id}`,
    roadside: `/roadside/${id}`,
    roadside_request: `/roadside/${id}`,
    roadsideassistancerequest: `/roadside/${id}`,
  };
  return staffRoutes[type] || null;
}

export function getMobileNotificationHref(
  notification: Notification,
  origin: string,
): string | null {
  const data = notificationData(notification);
  const safeDataUrl = getSafeNotificationDataUrl(data.url, "mobile", origin);
  if (safeDataUrl) return safeDataUrl;

  if (notification.notification_type === "inventory" && data.work_order_id) {
    return `/mobile/workorders/${data.work_order_id}`;
  }
  if (notification.related_object_type === "roadside" && notification.related_object_id) {
    return `/mobile/roadside/${notification.related_object_id}`;
  }
  if (data.request_id) return `/mobile/roadside/${data.request_id}`;
  if (data.work_order_id) return `/mobile/workorders/${data.work_order_id}`;
  if (data.appointment_id) return "/mobile/schedule";
  return null;
}

export function getPortalSearchResultHref(
  result: Pick<SearchResult, "type" | "id">,
): string | null {
  const routes: Partial<Record<SearchResult["type"], string>> = {
    customer: "/portal/profile",
    vehicle: `/portal/vehicles/${result.id}`,
    workorder: `/portal/work-orders/${result.id}`,
    appointment: `/portal/appointments/${result.id}`,
    invoice: `/portal/invoices/${result.id}`,
    estimate: `/portal/estimates/${result.id}`,
    payment: `/portal/payment/${result.id}`,
  };
  return routes[result.type] || null;
}
