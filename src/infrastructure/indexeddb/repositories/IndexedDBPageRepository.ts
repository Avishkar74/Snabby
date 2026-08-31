import type { PageRepository } from '../../../application/interfaces/repositories/PageRepository.ts';
import type { Page } from '../../../domain/page/Page.ts';
import type { PageId, SessionId } from '../../../domain/common/ids.ts';
import { dbManager, DatabaseError } from '../database/DatabaseManager.ts';
import { PageMapper } from '../mappers/page.mapper.ts';
import type { PageRecord } from '../mappers/page.mapper.ts';

export class IndexedDBPageRepository implements PageRepository {
  public async save(page: Page): Promise<void> {
    const db = await dbManager.getDb();
    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction('captures', 'readwrite');
        const store = tx.objectStore('captures');
        const record = PageMapper.toRecord(page);
        store.put(record);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new DatabaseError('IndexedDBPageRepository.save: Failed to put record', tx.error));
      } catch (err: unknown) {
        reject(new DatabaseError('IndexedDBPageRepository.save: Synchronous error during save', err));
      }
    });
  }

  public async findById(id: PageId): Promise<Page | null> {
    const db = await dbManager.getDb();
    return new Promise<Page | null>((resolve, reject) => {
      try {
        const tx = db.transaction('captures', 'readonly');
        const store = tx.objectStore('captures');
        const request = store.get(id);

        request.onsuccess = () => {
          const record = request.result as PageRecord | undefined;
          resolve(record ? PageMapper.toDomain(record) : null);
        };
        request.onerror = () => reject(new DatabaseError(
          `IndexedDBPageRepository.findById: Failed to get record by ID ${id}`,
          request.error
        ));
      } catch (err: unknown) {
        reject(new DatabaseError(
          `IndexedDBPageRepository.findById: Synchronous error for ID ${id}`,
          err
        ));
      }
    });
  }

  public async findBySessionId(sessionId: SessionId): Promise<Page[]> {
    const db = await dbManager.getDb();
    return new Promise<Page[]>((resolve, reject) => {
      try {
        const tx = db.transaction('captures', 'readonly');
        const store = tx.objectStore('captures');
        const index = store.index('sessionId_order');
        // Compound range matching prefix sessionId, automatically sorted by order
        const range = IDBKeyRange.bound([sessionId, -Infinity], [sessionId, Infinity]);
        const request = index.getAll(range);

        request.onsuccess = () => {
          const records = request.result as PageRecord[];
          resolve(records.map(PageMapper.toDomain));
        };
        request.onerror = () => reject(new DatabaseError(
          `IndexedDBPageRepository.findBySessionId: Failed to query pages by sessionId ${sessionId}`,
          request.error
        ));
      } catch (err: unknown) {
        reject(new DatabaseError(
          `IndexedDBPageRepository.findBySessionId: Synchronous error for sessionId ${sessionId}`,
          err
        ));
      }
    });
  }

  public async delete(id: PageId): Promise<void> {
    const db = await dbManager.getDb();

    // Find the page first to locate associated image IDs for cascade deletion
    const page = await this.findById(id);
    if (!page) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(['captures', 'images', 'ocrResults'], 'readwrite');
        const captureStore = tx.objectStore('captures');
        const imageStore = tx.objectStore('images');
        const ocrStore = tx.objectStore('ocrResults');

        captureStore.delete(id);

        // Delete the original image if present
        if (page.imageId) {
          imageStore.delete(page.imageId);
        }

        // If renderedImageId differs from imageId (annotated page), delete the rendered image too
        if (page.renderedImageId && page.renderedImageId !== page.imageId) {
          imageStore.delete(page.renderedImageId);
        }

        ocrStore.delete(id); // keyed by pageId (same physical key as captureId)

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new DatabaseError(
          `IndexedDBPageRepository.delete: Failed to cascade delete page and related records for ID ${id}`,
          tx.error
        ));
      } catch (err: unknown) {
        reject(new DatabaseError(
          `IndexedDBPageRepository.delete: Synchronous error during cascade delete for ID ${id}`,
          err
        ));
      }
    });
  }
}
