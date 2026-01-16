/**
 * IndexedDB Wrapper for Offline Data Storage
 */

import { openDB, DBSchema, IDBPDatabase, deleteDB } from 'idb';

type StoreName = "workOrders" | "inspections" | "timeLogs" | "syncQueue" | "photos";

interface VehicleRepairsDB extends DBSchema {
  workOrders: {
    key: number;
    value: {
      id: number;
      data: any;
      synced: 0 | 1;
      lastModified: number;
      version: number;
    };
    indexes: { 'by-synced': 0 | 1; 'by-lastModified': number };
  };
  inspections: {
    key: number;
    value: {
      id: number;
      data: any;
      synced: 0 | 1;
      lastModified: number;
      version: number;
    };
    indexes: { 'by-synced': 0 | 1; 'by-lastModified': number };
  };
  timeLogs: {
    key: number;
    value: {
      id: number;
      data: any;
      synced: 0 | 1;
      lastModified: number;
      version: number;
    };
    indexes: { 'by-synced': 0 | 1; 'by-lastModified': number };
  };
  syncQueue: {
    key: number;
    value: {
      id: number;
      action: 'create' | 'update' | 'delete';
      endpoint: string;
      method: string;
      payload: any;
      timestamp: number;
      retries: number;
      lastError?: string;
    };
    indexes: { 'by-timestamp': number; 'by-retries': number };
  };
  photos: {
    key: string;
    value: {
      id: string;
      blob: Blob;
      workOrderId?: number;
      inspectionId?: number;
      synced: 0 | 1;
      timestamp: number;
    };
    indexes: { 'by-synced': 0 | 1; 'by-workOrderId': number; 'by-inspectionId': number };
  };
}

const DB_NAME = 'vehicle-repairs-db';
const DB_VERSION = 3;

let dbInstance: IDBPDatabase<VehicleRepairsDB> | null = null;

// Helper to safely create an index
function safeCreateIndex(store: any, name: string, keyPath: string | string[]) {
  try {
    if (!store.indexNames.contains(name)) {
      store.createIndex(name, keyPath);
    }
  } catch (error: any) {
    // Catch ALL errors to ensure DB opens even if index creation fails
    console.warn(`[OfflineDB] Failed to create index '${name}' on '${store.name}':`, error);
  }
}

/**
 * Initialize and open the IndexedDB database
 */
export async function openDatabase(): Promise<IDBPDatabase<VehicleRepairsDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<VehicleRepairsDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // Work Orders store
      if (!db.objectStoreNames.contains('workOrders')) {
        const workOrdersStore = db.createObjectStore('workOrders', { keyPath: 'id' });
        safeCreateIndex(workOrdersStore, 'by-synced', 'synced');
        safeCreateIndex(workOrdersStore, 'by-lastModified', 'lastModified');
      } else if (transaction) {
        const workOrdersStore = transaction.objectStore('workOrders');
        safeCreateIndex(workOrdersStore, 'by-synced', 'synced');
        safeCreateIndex(workOrdersStore, 'by-lastModified', 'lastModified');
      }

      // Inspections store
      if (!db.objectStoreNames.contains('inspections')) {
        const inspectionsStore = db.createObjectStore('inspections', { keyPath: 'id' });
        safeCreateIndex(inspectionsStore, 'by-synced', 'synced');
        safeCreateIndex(inspectionsStore, 'by-lastModified', 'lastModified');
      } else if (transaction) {
        const inspectionsStore = transaction.objectStore('inspections');
        safeCreateIndex(inspectionsStore, 'by-synced', 'synced');
        safeCreateIndex(inspectionsStore, 'by-lastModified', 'lastModified');
      }

      // Time Logs store
      if (!db.objectStoreNames.contains('timeLogs')) {
        const timeLogsStore = db.createObjectStore('timeLogs', { keyPath: 'id' });
        safeCreateIndex(timeLogsStore, 'by-synced', 'synced');
        safeCreateIndex(timeLogsStore, 'by-lastModified', 'lastModified');
      } else if (transaction) {
        const timeLogsStore = transaction.objectStore('timeLogs');
        safeCreateIndex(timeLogsStore, 'by-synced', 'synced');
        safeCreateIndex(timeLogsStore, 'by-lastModified', 'lastModified');
      }

      // Sync Queue store
      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncQueueStore = db.createObjectStore('syncQueue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        safeCreateIndex(syncQueueStore, 'by-timestamp', 'timestamp');
        safeCreateIndex(syncQueueStore, 'by-retries', 'retries');
      } else if (transaction) {
        const syncQueueStore = transaction.objectStore('syncQueue');
        safeCreateIndex(syncQueueStore, 'by-timestamp', 'timestamp');
        safeCreateIndex(syncQueueStore, 'by-retries', 'retries');
      }

      // Photos store
      if (!db.objectStoreNames.contains('photos')) {
        const photosStore = db.createObjectStore('photos', { keyPath: 'id' });
        safeCreateIndex(photosStore, 'by-synced', 'synced');
        safeCreateIndex(photosStore, 'by-workOrderId', 'workOrderId');
        safeCreateIndex(photosStore, 'by-inspectionId', 'inspectionId');
      } else if (transaction) {
        const photosStore = transaction.objectStore('photos');
        safeCreateIndex(photosStore, 'by-synced', 'synced');
        safeCreateIndex(photosStore, 'by-workOrderId', 'workOrderId');
        safeCreateIndex(photosStore, 'by-inspectionId', 'inspectionId');
      }
    },
  });

  return dbInstance;
}

/**
 * Get database instance (opens if not already open)
 */
export async function getDB(): Promise<IDBPDatabase<VehicleRepairsDB>> {
  return openDatabase();
}

async function safeGetAll<T extends StoreName>(
  storeName: T
): Promise<VehicleRepairsDB[T]['value'][]> {
  try {
    const db = await getDB();
    return await db.getAll(storeName);
  } catch (error) {
    console.warn(`[OfflineDB] Failed to read ${storeName}, resetting DB`, error);
    try {
      if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
      }
      await deleteDB(DB_NAME);
    } catch (deleteError) {
      console.warn("[OfflineDB] Failed to delete DB", deleteError);
    }
    return [];
  }
}

/**
 * Work Orders operations
 */
export const workOrdersDB = {
  async getAll(): Promise<any[]> {
    const items = await safeGetAll('workOrders');
    return items.map((item) => item.data);
  },

  async get(id: number): Promise<any | null> {
    const db = await getDB();
    const item = await db.get('workOrders', id);
    return item?.data || null;
  },

  async set(id: number, data: any, synced: boolean = false): Promise<void> {
    const db = await getDB();
    await db.put('workOrders', {
      id,
      data,
      synced: synced ? 1 : 0,
      lastModified: Date.now(),
      version: 1,
    });
  },

  async delete(id: number): Promise<void> {
    const db = await getDB();
    await db.delete('workOrders', id);
  },

  async getUnsynced(): Promise<any[]> {
    try {
      const items = await safeGetAll('workOrders');
      return items.filter((item) => item.synced === 0).map((item) => item.data);
    } catch (error) {
      console.error('[OfflineDB] getUnsynced workOrders failed:', error);
      return [];
    }
  },

  async markSynced(id: number): Promise<void> {
    const db = await getDB();
    const item = await db.get('workOrders', id);
    if (item) {
      await db.put('workOrders', { ...item, synced: 1 });
    }
  },
};

/**
 * Inspections operations
 */
export const inspectionsDB = {
  async getAll(): Promise<any[]> {
    const items = await safeGetAll('inspections');
    return items.map((item) => item.data);
  },

  async get(id: number): Promise<any | null> {
    const db = await getDB();
    const item = await db.get('inspections', id);
    return item?.data || null;
  },

  async set(id: number, data: any, synced: boolean = false): Promise<void> {
    const db = await getDB();
    await db.put('inspections', {
      id,
      data,
      synced: synced ? 1 : 0,
      lastModified: Date.now(),
      version: 1,
    });
  },

  async delete(id: number): Promise<void> {
    const db = await getDB();
    await db.delete('inspections', id);
  },

  async getUnsynced(): Promise<any[]> {
    try {
      const items = await safeGetAll('inspections');
      return items.filter((item) => item.synced === 0).map((item) => item.data);
    } catch (error) {
      console.error('[OfflineDB] getUnsynced inspections failed:', error);
      return [];
    }
  },

  async markSynced(id: number): Promise<void> {
    const db = await getDB();
    const item = await db.get('inspections', id);
    if (item) {
      await db.put('inspections', { ...item, synced: 1 });
    }
  },
};

/**
 * Time Logs operations
 */
export const timeLogsDB = {
  async getAll(): Promise<any[]> {
    const items = await safeGetAll('timeLogs');
    return items.map((item) => item.data);
  },

  async get(id: number): Promise<any | null> {
    const db = await getDB();
    const item = await db.get('timeLogs', id);
    return item?.data || null;
  },

  async set(id: number, data: any, synced: boolean = false): Promise<void> {
    const db = await getDB();
    await db.put('timeLogs', {
      id,
      data,
      synced: synced ? 1 : 0,
      lastModified: Date.now(),
      version: 1,
    });
  },

  async delete(id: number): Promise<void> {
    const db = await getDB();
    await db.delete('timeLogs', id);
  },

  async getUnsynced(): Promise<any[]> {
    try {
      const items = await safeGetAll('timeLogs');
      return items.filter((item) => item.synced === 0).map((item) => item.data);
    } catch (error) {
      console.error('[OfflineDB] getUnsynced timeLogs failed:', error);
      return [];
    }
  },

  async markSynced(id: number): Promise<void> {
    const db = await getDB();
    const item = await db.get('timeLogs', id);
    if (item) {
      await db.put('timeLogs', { ...item, synced: 1 });
    }
  },
};

/**
 * Sync Queue operations
 */
export const syncQueueDB = {
  async add(
    action: 'create' | 'update' | 'delete',
    endpoint: string,
    method: string,
    payload: any
  ): Promise<number> {
    const db = await getDB();
    const id = await db.add('syncQueue', {
      id: 0, // Will be auto-incremented
      action,
      endpoint,
      method,
      payload,
      timestamp: Date.now(),
      retries: 0,
    });
    return id as number;
  },

  async getAll(): Promise<VehicleRepairsDB['syncQueue']['value'][]> {
    return safeGetAll('syncQueue');
  },

  async getPending(): Promise<VehicleRepairsDB['syncQueue']['value'][]> {
    const db = await getDB();
    const index = db.transaction('syncQueue').store.index('by-retries');
    // Get items with retries < 3
    const all = await index.getAll();
    return all.filter((item) => item.retries < 3);
  },

  async delete(id: number): Promise<void> {
    const db = await getDB();
    await db.delete('syncQueue', id);
  },

  async incrementRetries(id: number, error?: string): Promise<void> {
    const db = await getDB();
    const item = await db.get('syncQueue', id);
    if (item) {
      await db.put('syncQueue', {
        ...item,
        retries: item.retries + 1,
        lastError: error,
      });
    }
  },
};

/**
 * Photos operations
 */
export const photosDB = {
  async add(
    id: string,
    blob: Blob,
    workOrderId?: number,
    inspectionId?: number
  ): Promise<void> {
    const db = await getDB();
    await db.put('photos', {
      id,
      blob,
      workOrderId,
      inspectionId,
      synced: 0,
      timestamp: Date.now(),
    });
  },

  async get(id: string): Promise<Blob | null> {
    const db = await getDB();
    const item = await db.get('photos', id);
    return item?.blob || null;
  },

  async getByWorkOrder(workOrderId: number): Promise<Blob[]> {
    const db = await getDB();
    const index = db.transaction('photos').store.index('by-workOrderId');
    const items = await index.getAll(workOrderId);
    return items.map((item) => item.blob);
  },

  async getByInspection(inspectionId: number): Promise<Blob[]> {
    const db = await getDB();
    const index = db.transaction('photos').store.index('by-inspectionId');
    const items = await index.getAll(inspectionId);
    return items.map((item) => item.blob);
  },

  async getUnsynced(): Promise<VehicleRepairsDB['photos']['value'][]> {
    try {
      const items = await safeGetAll('photos');
      return items.filter((item) => item.synced === 0);
    } catch (error) {
      console.error('[OfflineDB] getUnsynced photos failed:', error);
      return [];
    }
  },

  async markSynced(id: string): Promise<void> {
    const db = await getDB();
    const item = await db.get('photos', id);
    if (item) {
      await db.put('photos', { ...item, synced: 1 });
    }
  },

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('photos', id);
  },
};

/**
 * Clear all data (for testing/debugging)
 */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  await db.clear('workOrders');
  await db.clear('inspections');
  await db.clear('timeLogs');
  await db.clear('syncQueue');
  await db.clear('photos');
}
