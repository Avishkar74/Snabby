import type { ImageRepository } from '../../../application/interfaces/repositories/ImageRepository.ts';
import type { ImageAsset } from '../../../domain/image/image.types.ts';
import type { ImageId } from '../../../domain/common/ids.ts';
import { dbManager, DatabaseError } from '../database/DatabaseManager.ts';
import { ImageMapper } from '../mappers/image.mapper.ts';
import type { ImageRecord } from '../mappers/image.mapper.ts';

export class IndexedDBImageRepository implements ImageRepository {
  public async save(image: ImageAsset): Promise<void> {
    const db = await dbManager.getDb();
    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction('images', 'readwrite');
        const store = tx.objectStore('images');
        const record = ImageMapper.toRecord(image);
        store.put(record);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new DatabaseError('ImageRepository.save: Failed to put record', tx.error));
      } catch (err: any) {
        reject(new DatabaseError('ImageRepository.save: Synchronous error occurred during save', err));
      }
    });
  }

  public async findById(id: ImageId): Promise<ImageAsset | null> {
    const db = await dbManager.getDb();
    return new Promise<ImageAsset | null>((resolve, reject) => {
      try {
        const tx = db.transaction('images', 'readonly');
        const store = tx.objectStore('images');
        const request = store.get(id);

        request.onsuccess = () => {
          const record = request.result as ImageRecord | undefined;
          resolve(record ? ImageMapper.toDomain(record) : null);
        };
        request.onerror = () => reject(new DatabaseError(`ImageRepository.findById: Failed to get record by ID ${id}`, request.error));
      } catch (err: any) {
        reject(new DatabaseError(`ImageRepository.findById: Synchronous error occurred for ID ${id}`, err));
      }
    });
  }

  public async delete(id: ImageId): Promise<void> {
    const db = await dbManager.getDb();
    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction('images', 'readwrite');
        const store = tx.objectStore('images');
        store.delete(id);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new DatabaseError(`ImageRepository.delete: Failed to delete record by ID ${id}`, tx.error));
      } catch (err: any) {
        reject(new DatabaseError(`ImageRepository.delete: Synchronous error occurred for ID ${id}`, err));
      }
    });
  }
}
export const imageRepository = new IndexedDBImageRepository();
