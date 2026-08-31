import type { PagePersistenceService } from '../../../application/interfaces/services/PagePersistenceService.ts';
import type { Page } from '../../../domain/page/Page.ts';
import type { ImageAsset } from '../../../domain/image/image.types.ts';
import { dbManager, DatabaseError } from '../database/DatabaseManager.ts';
import { PageMapper } from '../mappers/page.mapper.ts';
import { ImageMapper } from '../mappers/image.mapper.ts';

export class IndexedDBPagePersistenceService implements PagePersistenceService {
  public async save(page: Page, image: ImageAsset): Promise<void> {
    try {
      const db = await dbManager.getDb();
      const transaction = db.transaction(['captures', 'images'], 'readwrite');

      const pageRecord = PageMapper.toRecord(page);
      const imageRecord = ImageMapper.toRecord(image);

      const capturesStore = transaction.objectStore('captures');
      const imagesStore = transaction.objectStore('images');

      return new Promise<void>((resolve, reject) => {
        try {
          const imageRequest = imagesStore.put(imageRecord);
          imageRequest.onerror = () => {
            reject(new DatabaseError(
              'IndexedDBPagePersistenceService.save: Failed to put image',
              imageRequest.error
            ));
          };

          const pageRequest = capturesStore.put(pageRecord);
          pageRequest.onerror = () => {
            reject(new DatabaseError(
              'IndexedDBPagePersistenceService.save: Failed to put page record',
              pageRequest.error
            ));
          };

          transaction.oncomplete = () => resolve();

          transaction.onerror = () => {
            reject(new DatabaseError(
              'IndexedDBPagePersistenceService.save: Transaction failed',
              transaction.error
            ));
          };

          transaction.onabort = () => {
            reject(new DatabaseError(
              'IndexedDBPagePersistenceService.save: Transaction aborted'
            ));
          };
        } catch (syncErr: unknown) {
          reject(new DatabaseError(
            'IndexedDBPagePersistenceService.save: Synchronous IndexedDB operation failed',
            syncErr
          ));
        }
      });
    } catch (err: unknown) {
      if (err instanceof DatabaseError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new DatabaseError(
        `IndexedDBPagePersistenceService.save: Failed to persist page and image atomically: ${message}`,
        err
      );
    }
  }
}
