/**
 * Offline Sync Manager
 */

import {
  workOrdersDB,
  inspectionsDB,
  timeLogsDB,
  photosDB,
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

    // Sync time logs
    const unsyncedTimeLogs = await timeLogsDB.getUnsynced();
    for (const timeLog of unsyncedTimeLogs) {
      try {
        if (timeLog.id && timeLog.id > 0) {
          await apiClient.patch(`/workorders/${timeLog.work_order}/time-logs/${timeLog.id}/`, timeLog);
        } else {
          await apiClient.post(`/workorders/${timeLog.work_order}/time-logs/`, timeLog);
        }
        await timeLogsDB.markSynced(timeLog.id || timeLog.tempId);
        synced.timeLogs++;
      } catch (error: any) {
        errors.push(`Time Log ${timeLog.id}: ${error.message}`);
      }
    }

    // Sync photos
    const unsyncedPhotos = await photosDB.getUnsynced();
    for (const photo of unsyncedPhotos) {
      try {
        const formData = new FormData();
        formData.append('photo', photo.blob, `photo-${photo.id}.jpg`);
        if (photo.workOrderId) {
          formData.append('work_order', photo.workOrderId.toString());
        }
        if (photo.inspectionId) {
          formData.append('inspection', photo.inspectionId.toString());
        }

        await apiClient.post('/workorders/photos/', formData);
        await photosDB.markSynced(photo.id);
        synced.photos++;
      } catch (error: any) {
        errors.push(`Photo ${photo.id}: ${error.message}`);
      }
    }

    // Process sync queue
    const queueResult = await processQueue();

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
