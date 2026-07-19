import { describe, expect, it } from "vitest";
import type { Notification } from "@/lib/api/notifications";
import {
  getMobileNotificationHref,
  getNotificationHref,
  getPortalSearchResultHref,
  getSafeNotificationDataUrl,
} from "@/lib/utils/navigation-safety";

const origin = "https://repairs.example";

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    recipient: 2,
    notification_type: "system",
    title: "Update",
    message: "Updated",
    priority: "normal",
    status: "sent",
    created_at: "2026-07-19T12:00:00Z",
    ...overrides,
  };
}

describe("notification navigation safety", () => {
  it("preserves query strings and hashes for allowlisted dynamic routes", () => {
    expect(
      getSafeNotificationDataUrl(
        "https://repairs.example/workorders/WO_42?tab=parts#item-7",
        "staff",
        origin,
      ),
    ).toBe("/workorders/WO_42?tab=parts#item-7");
  });

  it("rejects same-origin unknown routes, cross-origin routes, and routes for another surface", () => {
    expect(getSafeNotificationDataUrl("/admin/users?next=/workorders/1", "staff", origin)).toBeNull();
    expect(getSafeNotificationDataUrl("https://evil.example/workorders/1", "staff", origin)).toBeNull();
    expect(getSafeNotificationDataUrl("/portal/invoices/1", "staff", origin)).toBeNull();
    expect(getSafeNotificationDataUrl("/mobile/workorders/1/delete", "mobile", origin)).toBeNull();
  });

  it("uses trusted notification metadata as fallback after rejecting data.url", () => {
    const result = getNotificationHref(
      notification({
        data: { url: "/admin/users" },
        related_object_type: "invoice",
        related_object_id: 73,
      }),
      "customer",
      origin,
    );

    expect(result).toBe("/portal/invoices/73");
  });

  it("does not navigate when neither the URL nor metadata is supported", () => {
    expect(
      getMobileNotificationHref(
        notification({ data: { url: "/mobile/settings/advanced" } }),
        origin,
      ),
    ).toBeNull();
  });

  it("allows supported mobile routes with their query strings", () => {
    expect(
      getMobileNotificationHref(
        notification({ data: { url: "/mobile/workorders/95?section=diagnosis" } }),
        origin,
      ),
    ).toBe("/mobile/workorders/95?section=diagnosis");
  });
});

describe("portal search navigation", () => {
  it("derives portal routes without using backend staff URLs", () => {
    expect(getPortalSearchResultHref({ type: "vehicle", id: 12 })).toBe("/portal/vehicles/12");
    expect(getPortalSearchResultHref({ type: "workorder", id: 33 })).toBe(
      "/portal/work-orders/33",
    );
    expect(getPortalSearchResultHref({ type: "invoice", id: 44 })).toBe("/portal/invoices/44");
  });

  it("does not expose staff-only result types in the portal", () => {
    expect(getPortalSearchResultHref({ type: "part", id: 8 })).toBeNull();
  });
});
