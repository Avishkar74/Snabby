import type { CaptureRepository } from '../../../application/interfaces/repositories/CaptureRepository.ts';
import type { Capture } from '../../../domain/capture/Capture.ts';
import type { CaptureId, SessionId } from '../../../domain/common/ids.ts';
import { dbManager } from '../database/DatabaseManager.ts';
import { CaptureMapper } from '../mappers/capture.mapper.ts';
import type { CaptureRecord } from '../mappers/capture.mapper.ts';

export class IndexedDBCaptureRepository implements CaptureRepository {
  public async save(capture: Capture): Promise<void> {
    const db = await dbManager.getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('captures', 'readwrite');
      const store = tx.objectStore('captures');
      const record = CaptureMapper.toRecord(capture);
      store.put(record);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async findById(id: CaptureId): Promise<Capture | null> {
    const db = await dbManager.getDb();
    return new Promise<Capture | null>((resolve, reject) => {
      const tx = db.transaction('captures', 'readonly');
      const store = tx.objectStore('captures');
      const request = store.get(id);

      request.onsuccess = () => {
        const record = request.result as CaptureRecord | undefined;
        resolve(record ? CaptureMapper.toDomain(record) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  public async findBySessionId(sessionId: SessionId): Promise<Capture[]> {
    const db = await dbManager.getDb();
    return new Promise<Capture[]>((resolve, reject) => {
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
      request.onerror = () => reject(request.error);
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
      const tx = db.transaction(['captures', 'images', 'ocrResults'], 'readwrite');
      const captureStore = tx.objectStore('captures');
      const imageStore = tx.objectStore('images');
      const ocrStore = tx.objectStore('ocrResults');

      captureStore.delete(id);
      imageStore.delete(capture.imageId);
      ocrStore.delete(id); // keyed by captureId

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
export const captureRepository = new IndexedDBCaptureRepository();
