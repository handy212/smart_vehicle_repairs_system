/**
 * Request Queue for Offline Actions
 * Updated: 2026-01-16
 */

import { syncQueueDB } from './db';
import apiClient from '../api/client';

export interface QueuedRequest {
  id: number;
  action: 'create' | 'update' | 'delete';
  endpoint: string;
  method: string;
  payload: any;
  timestamp: number;
  retries: number;
  lastError?: string;
}

/**
 * Add a request to the sync queue
 */
export async function queueRequest(
  action: 'create' | 'update' | 'delete',
  endpoint: string,
  method: string,
  payload: any
): Promise<number> {
  return syncQueueDB.add(action, endpoint, method, payload);
}

/**
 * Process a single queued request
 */
export async function processQueuedRequest(
  request: QueuedRequest
): Promise<boolean> {
  try {
    let response;

    switch (request.method.toUpperCase()) {
      case 'GET':
        response = await apiClient.get(request.endpoint);
        break;
      case 'POST':
        response = await apiClient.post(request.endpoint, request.payload);
        break;
      case 'PATCH':
      case 'PUT':
        response = await apiClient.patch(request.endpoint, request.payload);
        break;
      case 'DELETE':
        response = await apiClient.delete(request.endpoint);
        break;
      default:
        throw new Error(`Unsupported method: ${request.method}`);
    }

    // Request succeeded, remove from queue
    await syncQueueDB.delete(request.id);
    return true;
  } catch (error: any) {
    // Increment retries
    const errorMessage =
      error?.response?.data?.message || error?.message || 'Unknown error';
    await syncQueueDB.incrementRetries(request.id, errorMessage);

    // If max retries reached, keep in queue but don't retry immediately
    if (request.retries >= 2) {
      console.error(
        `[Sync Queue] Max retries reached for request ${request.id}:`,
        errorMessage
      );
    }

    return false;
  }
}

// Export syncQueueDB for reading queue status
export { syncQueueDB as queueDB };

/**
 * Process all pending requests in the queue
 */
export async function processQueue(): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const pending = await syncQueueDB.getPending();
  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const request of pending) {
    const success = await processQueuedRequest(request);
    if (success) {
      processed++;
    } else {
      failed++;
      if (request.lastError) {
        errors.push(request.lastError);
      }
    }
  }

  return { processed, failed, errors };
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  total: number;
  pending: number;
  failed: number;
}> {
  const all = await syncQueueDB.getAll();
  const pending = all.filter((r) => r.retries < 3);
  const failed = all.filter((r) => r.retries >= 3);

  return {
    total: all.length,
    pending: pending.length,
    failed: failed.length,
  };
}
