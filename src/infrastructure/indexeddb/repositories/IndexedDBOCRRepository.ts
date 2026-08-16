import type { OCRRepository } from '../../../application/interfaces/repositories/OCRRepository.ts';
import type { OCRResult } from '../../../domain/ocr/OCRResult.ts';
import type { CaptureId } from '../../../domain/common/ids.ts';
import { dbManager, DatabaseError } from '../database/DatabaseManager.ts';
import { OCRMapper } from '../mappers/ocr.mapper.ts';
import type { OCRResultRecord } from '../mappers/ocr.mapper.ts';

export class IndexedDBOCRRepository implements OCRRepository {
  public async save(ocrResult: OCRResult): Promise<void> {
    const db = await dbManager.getDb();
    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction('ocrResults', 'readwrite');
        const store = tx.objectStore('ocrResults');
        const record = OCRMapper.toRecord(ocrResult);
        store.put(record);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new DatabaseError('OCRRepository.save: Failed to put record', tx.error));
      } catch (err: any) {
        reject(new DatabaseError('OCRRepository.save: Synchronous error occurred during save', err));
      }
    });
  }

  public async findByCaptureId(captureId: CaptureId): Promise<OCRResult | null> {
    const db = await dbManager.getDb();
    return new Promise<OCRResult | null>((resolve, reject) => {
      try {
        const tx = db.transaction('ocrResults', 'readonly');
        const store = tx.objectStore('ocrResults');
        const request = store.get(captureId);

        request.onsuccess = () => {
          const record = request.result as OCRResultRecord | undefined;
          resolve(record ? OCRMapper.toDomain(record) : null);
        };
        request.onerror = () => reject(new DatabaseError(`OCRRepository.findByCaptureId: Failed to get record by captureId ${captureId}`, request.error));
      } catch (err: any) {
        reject(new DatabaseError(`OCRRepository.findByCaptureId: Synchronous error occurred for captureId ${captureId}`, err));
      }
    });
  }

  public async delete(captureId: CaptureId): Promise<void> {
    const db = await dbManager.getDb();
    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction('ocrResults', 'readwrite');
        const store = tx.objectStore('ocrResults');
        store.delete(captureId);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new DatabaseError(`OCRRepository.delete: Failed to delete record by captureId ${captureId}`, tx.error));
      } catch (err: any) {
        reject(new DatabaseError(`OCRRepository.delete: Synchronous error occurred for captureId ${captureId}`, err));
      }
    });
  }
}
export const ocrRepository = new IndexedDBOCRRepository();
