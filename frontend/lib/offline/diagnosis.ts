/**
 * Offline cache and queue helpers for mobile diagnosis.
 */

import type { Diagnosis } from "@/lib/api/diagnosis";
import { diagnosisApi } from "@/lib/api/diagnosis";
import { diagnosisDraftsDB } from "./db";
import { queueRequest } from "./queue";

export async function cacheDiagnosis(workOrderId: number, diagnosis: Diagnosis) {
  await diagnosisDraftsDB.set(workOrderId, diagnosis, true);
}

export async function getCachedDiagnosis(workOrderId: number): Promise<Diagnosis | null> {
  return diagnosisDraftsDB.get(workOrderId);
}

export async function fetchDiagnosisForWorkOrder(
  workOrderId: number,
  preferOffline: boolean
): Promise<Diagnosis | null> {
  if (preferOffline && typeof navigator !== "undefined" && !navigator.onLine) {
    const cached = await getCachedDiagnosis(workOrderId);
    if (cached) return cached;
  }

  try {
    const diagnosis = await diagnosisApi.getByWorkOrder(workOrderId);
    if (diagnosis) {
      await cacheDiagnosis(workOrderId, diagnosis);
    }
    return diagnosis;
  } catch (error) {
    if (preferOffline) {
      return getCachedDiagnosis(workOrderId);
    }
    throw error;
  }
}

export async function patchDiagnosisOfflineAware(
  workOrderId: number,
  diagnosisId: number,
  data: Partial<Diagnosis>,
  isOnline: boolean
): Promise<Diagnosis> {
  const cached = (await getCachedDiagnosis(workOrderId)) || ({ id: diagnosisId } as Diagnosis);
  const merged = { ...cached, ...data, id: diagnosisId } as Diagnosis;

  if (!isOnline) {
    await queueRequest(
      "update",
      `/diagnosis/diagnoses/${diagnosisId}/`,
      "PATCH",
      data
    );
    await diagnosisDraftsDB.set(workOrderId, merged, false);
    return merged;
  }

  const updated = await diagnosisApi.update(diagnosisId, data);
  await cacheDiagnosis(workOrderId, updated);
  return updated;
}

/** POST/PATCH via queue when offline; otherwise run the live API call. */
export async function runDiagnosisMutation<T>(
  workOrderId: number,
  isOnline: boolean,
  offline: { endpoint: string; method: "POST" | "PATCH"; payload?: unknown },
  online: () => Promise<T>
): Promise<T> {
  if (!isOnline) {
    await queueRequest(
      offline.method === "PATCH" ? "update" : "create",
      offline.endpoint,
      offline.method,
      offline.payload ?? {}
    );
    const cached = await getCachedDiagnosis(workOrderId);
    if (cached) {
      await diagnosisDraftsDB.set(workOrderId, cached, false);
    }
    return undefined as T;
  }
  const result = await online();
  if (workOrderId) {
    const refreshed = await diagnosisApi.getByWorkOrder(workOrderId);
    if (refreshed) await cacheDiagnosis(workOrderId, refreshed);
  }
  return result;
}
