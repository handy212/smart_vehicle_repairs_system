/**
 * Offline Sync Manager
 */

import {
  workOrdersDB,
  inspectionsDB,
  timeLogsDB,
  photosDB,
  diagnosisDraftsDB,
} from './db';
import { processQueue, getQueueStats } from './queue';
import apiClient from '../api/client';

export interface SyncResult {
  success: boolean;
  synced: {
    workOrders: number;
    inspections: number;
    timeLogs: number;
    photos: number;
  };
  queue: {
    processed: number;
    failed: number;
  };
  errors: string[];
}

/**
 * Sync all offline data with the server
 */
export async function syncAll(): Promise<SyncResult> {
  const errors: string[] = [];
  const synced = {
    workOrders: 0,
    inspections: 0,
    timeLogs: 0,
    photos: 0,
  };

  try {
    // Sync work orders
    const unsyncedWorkOrders = await workOrdersDB.getUnsynced();
    for (const workOrder of unsyncedWorkOrders) {
      try {
        if (workOrder.id && workOrder.id > 0) {
          // Update existing
          await apiClient.patch(`/workorders/${workOrder.id}/`, workOrder);
        } else {
          // Create new
          await apiClient.post('/workorders/', workOrder);
        }
        await workOrdersDB.markSynced(workOrder.id || workOrder.tempId);
        synced.workOrders++;

      } catch (error: any) {
        errors.push(`Work Order ${workOrder.id}: ${error.message}`);
      }
    }

    // Sync inspections
    const unsyncedInspections = await inspectionsDB.getUnsynced();
    for (const inspection of unsyncedInspections) {
      try {
        if (inspection.id && inspection.id > 0) {
          await apiClient.patch(`/inspections/${inspection.id}/`, inspection);
        } else {
          await apiClient.post('/inspections/', inspection);
        }
        await inspectionsDB.markSynced(inspection.id || inspection.tempId);
        synced.inspections++;

      } catch (error: any) {
        errors.push(`Inspection ${inspection.id}: ${error.message}`);
      }
    }

    // Sync time logs (shop labor — requires task on clock-in)
    const unsyncedTimeLogs = await timeLogsDB.getUnsynced();
    for (const timeLog of unsyncedTimeLogs) {
      try {
        const localId = timeLog.id || timeLog.tempId;
        if (timeLog.clock_out && timeLog.id && timeLog.id > 0 && !timeLog.tempId) {
          await apiClient.post(`/workorders/time-logs/${timeLog.id}/clock_out/`, {
            clock_out: timeLog.clock_out ?? new Date().toISOString(),
          });
          await timeLogsDB.markSynced(localId);
          synced.timeLogs++;
          continue;
        }

        if (!timeLog.task) {
          errors.push(`Time Log ${localId}: missing task — cannot sync clock-in`);
          continue;
        }

        if (timeLog.tempId || !timeLog.id || timeLog.id < 0) {
          const created = await apiClient.post("/workorders/time-logs/clock-in/", {
            work_order: timeLog.work_order,
            task: timeLog.task,
            description: timeLog.description || undefined,
          });
          const serverId = created.data?.id;
          if (serverId && timeLog.clock_out) {
            await apiClient.post(`/workorders/time-logs/${serverId}/clock_out/`, {
              clock_out: timeLog.clock_out,
            });
          }
          if (localId) {
            await timeLogsDB.delete(localId);
          }
          if (serverId) {
            await timeLogsDB.set(serverId, { ...timeLog, id: serverId, tempId: undefined }, true);
          }
          synced.timeLogs++;
          continue;
        }

        if (timeLog.clock_out) {
          await apiClient.post(`/workorders/time-logs/${timeLog.id}/clock_out/`, {
            clock_out: timeLog.clock_out,
          });
        }
        await timeLogsDB.markSynced(localId);
        synced.timeLogs++;
      } catch (error: any) {
        errors.push(`Time Log ${timeLog.id || timeLog.tempId}: ${error.message}`);
      }
    }

    // Sync photos (work orders, inspections, roadside)
    const unsyncedPhotos = await photosDB.getUnsynced();
    for (const photo of unsyncedPhotos) {
      try {
        const formData = new FormData();
        const filename = `photo-${photo.id}.jpg`;

        if (photo.roadsideRequestId) {
          formData.append('image', photo.blob, filename);
          formData.append('photo_type', photo.photoType || 'other');
          if (photo.caption) formData.append('caption', photo.caption);
          await apiClient.post(
            `/roadside/requests/${photo.roadsideRequestId}/site-photos/`,
            formData
          );
        } else {
          formData.append('photo', photo.blob, filename);
          if (photo.workOrderId) {
            formData.append('work_order', photo.workOrderId.toString());
          }
          if (photo.inspectionId) {
            formData.append('inspection', photo.inspectionId.toString());
          }
          await apiClient.post('/workorders/photos/', formData);
        }

        await photosDB.markSynced(photo.id);
        synced.photos++;
      } catch (error: any) {
        errors.push(`Photo ${photo.id}: ${error.message}`);
      }
    }

    // Process sync queue
    const queueResult = await processQueue();

    // Refresh diagnosis drafts after queue sync
    const unsyncedDrafts = await diagnosisDraftsDB.getUnsynced();
    for (const draft of unsyncedDrafts) {
      const woId =
        typeof draft.work_order === 'number'
          ? draft.work_order
          : draft.work_order?.id;
      if (woId && draft.id) {
        try {
          const response = await apiClient.get(`/diagnosis/diagnoses/${draft.id}/`);
          await diagnosisDraftsDB.set(woId, response.data, true);
        } catch {
          // leave unsynced for next pass
        }
      }
    }

    return {
      success: errors.length === 0,
      synced,
      queue: queueResult,
      errors,
    };

  } catch (error: any) {
    errors.push(`Sync failed: ${error.message}`);
    return {
      success: false,
      synced,
      queue: { processed: 0, failed: 0 },
      errors,
    };
  }
}

/**
 * Download and cache data from server
 */
export async function downloadAndCache(): Promise<void> {
  try {
    // Download work orders assigned to current user
    const workOrdersResponse = await apiClient.get('/workorders/', {
      params: { assigned_to_me: true },
    });
    const workOrders = workOrdersResponse.data.results || workOrdersResponse.data;

    for (const workOrder of workOrders) {
      await workOrdersDB.set(workOrder.id, workOrder, true);
    }

    // Download recent inspections
    const inspectionsResponse = await apiClient.get('/inspections/', {
      params: { limit: 50 },
    });
    const inspections = inspectionsResponse.data.results || inspectionsResponse.data;

    for (const inspection of inspections) {
      await inspectionsDB.set(inspection.id, inspection, true);
    }
  } catch (error) {
    console.error('[Sync] Failed to download and cache data:', error);
  }
}

/**
 * Get sync status
 */
export async function getSyncStatus(): Promise<{
  hasUnsyncedData: boolean;
  unsyncedCounts: {
    workOrders: number;
    inspections: number;
    timeLogs: number;
    photos: number;
  };
  queueStats: {
    total: number;
    pending: number;
    failed: number;
  };
}> {
  const [unsyncedWorkOrders, unsyncedInspections, unsyncedTimeLogs, unsyncedPhotos, queueStats] =
    await Promise.all([
      workOrdersDB.getUnsynced(),
      inspectionsDB.getUnsynced(),
      timeLogsDB.getUnsynced(),
      photosDB.getUnsynced(),
      getQueueStats(),
    ]);

  return {
    hasUnsyncedData:
      unsyncedWorkOrders.length > 0 ||
      unsyncedInspections.length > 0 ||
      unsyncedTimeLogs.length > 0 ||
      unsyncedPhotos.length > 0 ||
      queueStats.pending > 0,
    unsyncedCounts: {
      workOrders: unsyncedWorkOrders.length,
      inspections: unsyncedInspections.length,
      timeLogs: unsyncedTimeLogs.length,
      photos: unsyncedPhotos.length,
    },
    queueStats,
  };
}
