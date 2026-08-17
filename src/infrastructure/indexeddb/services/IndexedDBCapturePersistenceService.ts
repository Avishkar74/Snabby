import type { Capture } from '../../../domain/capture/Capture.ts';
import type { ImageAsset } from '../../../domain/image/image.types.ts';
import type { CapturePersistenceService } from '../../../application/interfaces/services/CapturePersistenceService.ts';
import { dbManager, DatabaseError } from '../database/DatabaseManager.ts';
import { CaptureMapper } from '../mappers/capture.mapper.ts';
import { ImageMapper } from '../mappers/image.mapper.ts';

export class IndexedDBCapturePersistenceService implements CapturePersistenceService {
  public async save(capture: Capture, image: ImageAsset): Promise<void> {
    try {
      const db = await dbManager.getDb();
      const transaction = db.transaction(['captures', 'images'], 'readwrite');

      const captureRecord = CaptureMapper.toRecord(capture);
      const imageRecord = ImageMapper.toRecord(image);

      const capturesStore = transaction.objectStore('captures');
      const imagesStore = transaction.objectStore('images');

      return new Promise<void>((resolve, reject) => {
        try {
          const imageRequest = imagesStore.put(imageRecord);
          imageRequest.onerror = () => {
            reject(new DatabaseError('CapturePersistenceService.save: Failed to put image', imageRequest.error));
          };

          const captureRequest = capturesStore.put(captureRecord);
          captureRequest.onerror = () => {
            reject(new DatabaseError('CapturePersistenceService.save: Failed to put capture', captureRequest.error));
          };

          transaction.oncomplete = () => resolve();

          transaction.onerror = () => {
            reject(new DatabaseError('CapturePersistenceService.save: Transaction failed', transaction.error));
          };

          transaction.onabort = () => {
            reject(new DatabaseError('CapturePersistenceService.save: Transaction aborted'));
          };
        } catch (syncErr: unknown) {
          reject(new DatabaseError('CapturePersistenceService.save: Synchronous IndexedDB operation failed', syncErr));
        }
      });
    } catch (err: unknown) {
      if (err instanceof DatabaseError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new DatabaseError(`CapturePersistenceService.save: Failed to persist capture and image atomically: ${message}`, err);
    }
  }
}

export const indexedDBCapturePersistenceService = new IndexedDBCapturePersistenceService();
