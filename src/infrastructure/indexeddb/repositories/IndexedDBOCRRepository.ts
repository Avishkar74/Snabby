import type { OCRRepository } from '../../../application/interfaces/repositories/OCRRepository.ts';
import type { OCRResult } from '../../../domain/ocr/OCRResult.ts';
import type { CaptureId } from '../../../domain/common/ids.ts';
import { dbManager } from '../database/DatabaseManager.ts';
import { OCRMapper } from '../mappers/ocr.mapper.ts';
import type { OCRResultRecord } from '../mappers/ocr.mapper.ts';

export class IndexedDBOCRRepository implements OCRRepository {
  public async save(ocrResult: OCRResult): Promise<void> {
    const db = await dbManager.getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('ocrResults', 'readwrite');
      const store = tx.objectStore('ocrResults');
      const record = OCRMapper.toRecord(ocrResult);
      store.put(record);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async findByCaptureId(captureId: CaptureId): Promise<OCRResult | null> {
    const db = await dbManager.getDb();
    return new Promise<OCRResult | null>((resolve, reject) => {
      const tx = db.transaction('ocrResults', 'readonly');
      const store = tx.objectStore('ocrResults');
      const request = store.get(captureId);

      request.onsuccess = () => {
        const record = request.result as OCRResultRecord | undefined;
        resolve(record ? OCRMapper.toDomain(record) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  public async delete(captureId: CaptureId): Promise<void> {
    const db = await dbManager.getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('ocrResults', 'readwrite');
      const store = tx.objectStore('ocrResults');
      store.delete(captureId);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
export const ocrRepository = new IndexedDBOCRRepository();
