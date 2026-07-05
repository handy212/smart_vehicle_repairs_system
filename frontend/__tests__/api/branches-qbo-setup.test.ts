import { describe, it, expect, vi, beforeEach } from "vitest";
import { branchesApi } from "@/lib/api/branches";
import { qboMappingsApi } from "@/lib/api/qbo-mappings";
import apiClient from "@/lib/api/client";

describe("branchesApi QBO setup endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("suggestQboMappings posts dry_run flag", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { branch_id: 1, suggestions: [], applied: 0, rows: [] },
    });

    await branchesApi.suggestQboMappings(1, { dry_run: true });

    expect(apiClient.post).toHaveBeenCalledWith("/branches/1/qbo-suggest-mappings/", {
      dry_run: true,
    });
  });

  it("copyQboMappingsFrom posts source_branch_id", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { copied: 2, source_branch_id: 3, rows: [] },
    });

    const result = await branchesApi.copyQboMappingsFrom(5, 3);

    expect(apiClient.post).toHaveBeenCalledWith("/branches/5/qbo-copy-mappings/", {
      source_branch_id: 3,
    });
    expect(result.copied).toBe(2);
  });

  it("resyncQboDocuments posts to resync endpoint", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { branch_id: 2, queued_count: 4, skipped_count: 0 },
    });

    const result = await branchesApi.resyncQboDocuments(2);

    expect(apiClient.post).toHaveBeenCalledWith("/branches/2/qbo-resync-documents/");
    expect(result.queued_count).toBe(4);
  });

  it("linkAllQboLocations posts bulk location link", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { dry_run: false, linked: [{ branch: "A" }], skipped: [] },
    });

    await branchesApi.linkAllQboLocations();

    expect(apiClient.post).toHaveBeenCalledWith("/branches/qbo-link-all-locations/", {});
  });

  it("provisionAllSettlement posts bulk settlement provision", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { dry_run: false, branches: [{ branch_id: 1 }] },
    });

    await branchesApi.provisionAllSettlement({ dry_run: true });

    expect(apiClient.post).toHaveBeenCalledWith("/branches/qbo-provision-all-settlement/", {
      dry_run: true,
    });
  });
});

describe("qboMappingsApi.getSetupStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches setup status overview", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        is_connected: true,
        is_api_ready: true,
        company_mappings: { mapped: 10, total: 20 },
        branches: { active_count: 2, unmapped_locations: 1, items: [], override_slots_per_branch: 8 },
        next_steps: [{ id: "connect", label: "Connected", done: true }],
      },
    });

    const status = await qboMappingsApi.getSetupStatus();

    expect(apiClient.get).toHaveBeenCalledWith("/quickbooks/setup-status/");
    expect(status.is_connected).toBe(true);
    expect(status.company_mappings.mapped).toBe(10);
  });
});
