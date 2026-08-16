import type { SessionRepository } from '../../../application/interfaces/repositories/SessionRepository.ts';
import type { Session } from '../../../domain/session/Session.ts';
import type { SessionId } from '../../../domain/common/ids.ts';
import { dbManager, DatabaseError } from '../database/DatabaseManager.ts';
import { SessionMapper } from '../mappers/session.mapper.ts';
import type { SessionRecord } from '../mappers/session.mapper.ts';

export class IndexedDBSessionRepository implements SessionRepository {
  public async save(session: Session): Promise<void> {
    const db = await dbManager.getDb();
    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction('sessions', 'readwrite');
        const store = tx.objectStore('sessions');
        const record = SessionMapper.toRecord(session);
        store.put(record);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new DatabaseError('SessionRepository.save: Failed to put record', tx.error));
      } catch (err: any) {
        reject(new DatabaseError('SessionRepository.save: Synchronous error occurred during save', err));
      }
    });
  }

  public async findById(id: SessionId): Promise<Session | null> {
    const db = await dbManager.getDb();
    return new Promise<Session | null>((resolve, reject) => {
      try {
        const tx = db.transaction('sessions', 'readonly');
        const store = tx.objectStore('sessions');
        const request = store.get(id);

        request.onsuccess = () => {
          const record = request.result as SessionRecord | undefined;
          resolve(record ? SessionMapper.toDomain(record) : null);
        };
        request.onerror = () => reject(new DatabaseError(`SessionRepository.findById: Failed to get record by ID ${id}`, request.error));
      } catch (err: any) {
        reject(new DatabaseError(`SessionRepository.findById: Synchronous error occurred for ID ${id}`, err));
      }
    });
  }

  public async findAll(): Promise<Session[]> {
    const db = await dbManager.getDb();
    return new Promise<Session[]>((resolve, reject) => {
      try {
        const tx = db.transaction('sessions', 'readonly');
        const store = tx.objectStore('sessions');
        const request = store.getAll();

        request.onsuccess = () => {
          const records = request.result as SessionRecord[];
          resolve(records.map(SessionMapper.toDomain));
        };
        request.onerror = () => reject(new DatabaseError('SessionRepository.findAll: Failed to retrieve all records', request.error));
      } catch (err: any) {
        reject(new DatabaseError('SessionRepository.findAll: Synchronous error occurred during query', err));
      }
    });
  }

  public async delete(id: SessionId): Promise<void> {
    const db = await dbManager.getDb();

    // 1. Retrieve all captures associated with this session to find imageIds
    const captures = await new Promise<any[]>((resolve, reject) => {
      try {
        const tx = db.transaction('captures', 'readonly');
        const store = tx.objectStore('captures');
        const index = store.index('sessionId');
        const request = index.getAll(id);

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(new DatabaseError(`SessionRepository.delete: Failed to query captures for session ID ${id}`, request.error));
      } catch (err: any) {
        reject(new DatabaseError(`SessionRepository.delete: Synchronous error querying captures for session ID ${id}`, err));
      }
    });

    const captureIds = captures.map((c) => c.id);
    const imageIds = captures.map((c) => c.imageId);

    // 2. Cascade delete session and all dependent entities atomically
    return new Promise<void>((resolve, reject) => {
      try {
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
        tx.onerror = () => reject(new DatabaseError(`SessionRepository.delete: Failed to cascade delete session and related records for ID ${id}`, tx.error));
      } catch (err: any) {
        reject(new DatabaseError(`SessionRepository.delete: Synchronous error during cascade delete for session ID ${id}`, err));
      }
    });
  }
}
export const sessionRepository = new IndexedDBSessionRepository();
