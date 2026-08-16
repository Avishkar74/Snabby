import type { SessionRepository } from '../../../application/interfaces/repositories/SessionRepository.ts';
import type { Session } from '../../../domain/session/Session.ts';
import type { SessionId } from '../../../domain/common/ids.ts';
import { dbManager } from '../database/DatabaseManager.ts';
import { SessionMapper } from '../mappers/session.mapper.ts';
import type { SessionRecord } from '../mappers/session.mapper.ts';

export class IndexedDBSessionRepository implements SessionRepository {
  public async save(session: Session): Promise<void> {
    const db = await dbManager.getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      const store = tx.objectStore('sessions');
      const record = SessionMapper.toRecord(session);
      store.put(record);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async findById(id: SessionId): Promise<Session | null> {
    const db = await dbManager.getDb();
    return new Promise<Session | null>((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const store = tx.objectStore('sessions');
      const request = store.get(id);

      request.onsuccess = () => {
        const record = request.result as SessionRecord | undefined;
        resolve(record ? SessionMapper.toDomain(record) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  public async findAll(): Promise<Session[]> {
    const db = await dbManager.getDb();
    return new Promise<Session[]>((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const store = tx.objectStore('sessions');
      const request = store.getAll();

      request.onsuccess = () => {
        const records = request.result as SessionRecord[];
        resolve(records.map(SessionMapper.toDomain));
      };
      request.onerror = () => reject(request.error);
    });
  }

  public async delete(id: SessionId): Promise<void> {
    const db = await dbManager.getDb();

    // 1. Retrieve all captures associated with this session to find imageIds
    const captures = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction('captures', 'readonly');
      const store = tx.objectStore('captures');
      const index = store.index('sessionId');
      const request = index.getAll(id);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    const captureIds = captures.map((c) => c.id);
    const imageIds = captures.map((c) => c.imageId);

    // 2. Cascade delete session and all dependent entities atomically
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['sessions', 'captures', 'images', 'ocrResults'], 'readwrite');
      const sessionStore = tx.objectStore('sessions');
      const captureStore = tx.objectStore('captures');
      const imageStore = tx.objectStore('images');
      const ocrStore = tx.objectStore('ocrResults');

      // Delete the session record
      sessionStore.delete(id);

      // Delete all capture records
      for (const cid of captureIds) {
        captureStore.delete(cid);
      }

      // Delete all image asset records
      for (const imgId of imageIds) {
        imageStore.delete(imgId);
      }

      // Delete all OCR result records (keyed by captureId)
      for (const cid of captureIds) {
        ocrStore.delete(cid);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
export const sessionRepository = new IndexedDBSessionRepository();
