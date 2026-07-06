import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface PhotosDB extends DBSchema {
    photos: {
        key: number; // timestamp
        value: {
            id?: number; // Server ID after upload
            workOrderId: number;
            blob: Blob;
            caption?: string;
            timestamp: number;
            uploaded: boolean;
            uploadError?: string;
        };
        indexes: { 'by-workorder': number; 'by-uploaded': number };
    };
}

let dbPromise: Promise<IDBPDatabase<PhotosDB>> | null = null;

const getDB = (): Promise<IDBPDatabase<PhotosDB>> => {
    if (!dbPromise) {
        dbPromise = openDB<PhotosDB>('workorder-photos', 1, {
            upgrade(db) {
                const store = db.createObjectStore('photos', { keyPath: 'timestamp' });
                store.createIndex('by-workorder', 'workOrderId');
                store.createIndex('by-uploaded', 'uploaded');
            },
        });
    }
    return dbPromise;
};

export const photosDB = {
    async add(workOrderId: number, blob: Blob, caption?: string): Promise<number> {
        const db = await getDB();
        const timestamp = Date.now();

        await db.add('photos', {
            workOrderId,
            blob,
            caption,
            timestamp,
            uploaded: false,
        });

        return timestamp;
    },

    async getByWorkOrder(workOrderId: number) {
        const db = await getDB();
        const index = db.transaction('photos').store.index('by-workorder');
        return await index.getAll(workOrderId);
    },

    async getUnuploaded() {
        const db = await getDB();
        const index = db.transaction('photos').store.index('by-uploaded');
        return await index.getAll(0); // 0 = false
    },

    async markUploaded(timestamp: number, serverId: number) {
        const db = await getDB();
        const photo = await db.get('photos', timestamp);
        if (photo) {
            photo.uploaded = true;
            photo.id = serverId;
            await db.put('photos', photo);
        }
    },

    async delete(timestamp: number) {
        const db = await getDB();
        await db.delete('photos', timestamp);
    },

    async deleteByWorkOrder(workOrderId: number) {
        const photos = await this.getByWorkOrder(workOrderId);
        const db = await getDB();
        const tx = db.transaction('photos', 'readwrite');
        for (const photo of photos) {
            await tx.store.delete(photo.timestamp);
        }
        await tx.done;
    },
};

// Photo compression utility
export const compressPhoto = async (file: File, maxWidth = 1920, maxHeight = 1920, quality = 0.8): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Calculate new dimensions
                if (width > height) {
                    if (width > maxWidth) {
                        height = height * (maxWidth / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = width * (maxHeight / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to compress image'));
                        }
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => reject(new Error('Failed to load image'));
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
    });
};
