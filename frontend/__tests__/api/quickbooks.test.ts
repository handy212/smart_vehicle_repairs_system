import { describe, it, expect, vi, beforeEach } from "vitest";
import { quickbooksApi } from "@/lib/api/quickbooks";
import apiClient from "@/lib/api/client";

describe("quickbooksApi.clearMapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to mappings clear endpoint", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        detail: "Mapping cleared.",
        entity_type: "invoice",
        object_id: 42,
        deleted: false,
        qbo_sync_status: "pending",
        qbo_sync_error: "",
      },
    });

    const result = await quickbooksApi.clearMapping({
      entity_type: "invoice",
      object_id: 42,
    });

    expect(apiClient.post).toHaveBeenCalledWith("/quickbooks/mappings/clear/", {
      entity_type: "invoice",
      object_id: 42,
    });
    expect(result.detail).toBe("Mapping cleared.");
    expect(result.qbo_sync_status).toBe("pending");
  });

  it("supports purchase_order and vendor_bill entity types", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { detail: "Mapping cleared.", entity_type: "purchase_order", object_id: 1, deleted: false },
    });

    await quickbooksApi.clearMapping({ entity_type: "purchase_order", object_id: 1 });
    expect(apiClient.post).toHaveBeenCalledWith("/quickbooks/mappings/clear/", {
      entity_type: "purchase_order",
      object_id: 1,
    });

    vi.mocked(apiClient.post).mockResolvedValue({
      data: { detail: "Mapping cleared.", entity_type: "vendor_bill", object_id: 2, deleted: false },
    });

    await quickbooksApi.clearMapping({ entity_type: "vendor_bill", object_id: 2 });
    expect(apiClient.post).toHaveBeenLastCalledWith("/quickbooks/mappings/clear/", {
      entity_type: "vendor_bill",
      object_id: 2,
    });
  });

  it("posts to refresh-company endpoint", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { company_name: "Acme Auto Repairs" },
    });

    const result = await quickbooksApi.refreshCompany();

    expect(apiClient.post).toHaveBeenCalledWith("/quickbooks/refresh-company/");
    expect(result.company_name).toBe("Acme Auto Repairs");
  });
});
