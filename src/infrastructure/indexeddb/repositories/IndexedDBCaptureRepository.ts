import type { CaptureRepository } from '../../../application/interfaces/repositories/CaptureRepository.ts';
import type { Capture } from '../../../domain/capture/Capture.ts';
import type { CaptureId, SessionId } from '../../../domain/common/ids.ts';
import { dbManager, DatabaseError } from '../database/DatabaseManager.ts';
import { CaptureMapper } from '../mappers/capture.mapper.ts';
import type { CaptureRecord } from '../mappers/capture.mapper.ts';

export class IndexedDBCaptureRepository implements CaptureRepository {
  public async save(capture: Capture): Promise<void> {
    const db = await dbManager.getDb();
    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction('captures', 'readwrite');
        const store = tx.objectStore('captures');
        const record = CaptureMapper.toRecord(capture);
        store.put(record);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new DatabaseError('CaptureRepository.save: Failed to put record', tx.error));
      } catch (err: any) {
        reject(new DatabaseError('CaptureRepository.save: Synchronous error occurred during save', err));
      }
    });
  }

  public async findById(id: CaptureId): Promise<Capture | null> {
    const db = await dbManager.getDb();
    return new Promise<Capture | null>((resolve, reject) => {
      try {
        const tx = db.transaction('captures', 'readonly');
        const store = tx.objectStore('captures');
        const request = store.get(id);

        request.onsuccess = () => {
          const record = request.result as CaptureRecord | undefined;
          resolve(record ? CaptureMapper.toDomain(record) : null);
        };
        request.onerror = () => reject(new DatabaseError(`CaptureRepository.findById: Failed to get record by ID ${id}`, request.error));
      } catch (err: any) {
        reject(new DatabaseError(`CaptureRepository.findById: Synchronous error occurred for ID ${id}`, err));
      }
    });
  }

  public async findBySessionId(sessionId: SessionId): Promise<Capture[]> {
    const db = await dbManager.getDb();
    return new Promise<Capture[]>((resolve, reject) => {
      try {
        const tx = db.transaction('captures', 'readonly');
        const store = tx.objectStore('captures');
        const index = store.index('sessionId_order');
        // Bound range matching prefix sessionId, automatically sorted by order
        const range = IDBKeyRange.bound([sessionId, -Infinity], [sessionId, Infinity]);
        const request = index.getAll(range);

        request.onsuccess = () => {
          const records = request.result as CaptureRecord[];
          resolve(records.map(CaptureMapper.toDomain));
        };
        request.onerror = () => reject(new DatabaseError(`CaptureRepository.findBySessionId: Failed to query captures by sessionId ${sessionId}`, request.error));
      } catch (err: any) {
        reject(new DatabaseError(`CaptureRepository.findBySessionId: Synchronous error occurred during query for sessionId ${sessionId}`, err));
      }
    });
  }

  public async delete(id: CaptureId): Promise<void> {
    const db = await dbManager.getDb();

    // 1. Find the capture to locate its associated imageId
    const capture = await this.findById(id);
    if (!capture) {
      return;
    }

    // 2. Perform cascade delete in a transaction across captures, images, and ocrResults
    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(['captures', 'images', 'ocrResults'], 'readwrite');
        const captureStore = tx.objectStore('captures');
        const imageStore = tx.objectStore('images');
        const ocrStore = tx.objectStore('ocrResults');

        captureStore.delete(id);
        imageStore.delete(capture.imageId);
        ocrStore.delete(id); // keyed by captureId

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new DatabaseError(`CaptureRepository.delete: Failed to cascade delete capture and related records for ID ${id}`, tx.error));
      } catch (err: any) {
        reject(new DatabaseError(`CaptureRepository.delete: Synchronous error during cascade delete for capture ID ${id}`, err));
      }
    });
  }
}
export const captureRepository = new IndexedDBCaptureRepository();
