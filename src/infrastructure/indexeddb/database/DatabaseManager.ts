import { DomainError } from '../../../domain/common/errors.ts';

export class DatabaseError extends DomainError {
  constructor(message: string, cause?: unknown) {
    super(message, 'DATABASE_ERROR');
    this.name = 'DatabaseError';
    if (cause) {
      this.stack += `\nCause: ${cause instanceof Error ? cause.stack : String(cause)}`;
    }
  }
}

export class DatabaseManager {
  private static readonly DB_NAME = 'snabby';
  private static readonly DB_VERSION = 2;

  private db: IDBDatabase | null = null;
  private openPromise: Promise<IDBDatabase> | null = null;

  public async getDb(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    if (this.openPromise) {
      return this.openPromise;
    }

    this.openPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DatabaseManager.DB_NAME, DatabaseManager.DB_VERSION);

      request.onerror = () => {
        this.openPromise = null;
        reject(new DatabaseError('Failed to open database', request.error));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.openPromise = null;

        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };

        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = event.oldVersion;
        // The upgrade transaction provided by the browser — must be used for all
        // record-level reads and writes during schema migration.
        const upgradeTx = (event.target as IDBOpenDBRequest).transaction!;

        console.log(`[DatabaseManager] Upgrading database from version ${oldVersion} to ${DatabaseManager.DB_VERSION}`);

        // ── Version 1: Initial schema ──────────────────────────────────────────
        if (oldVersion < 1) {
          // 1. Create sessions store
          if (!db.objectStoreNames.contains('sessions')) {
            db.createObjectStore('sessions', { keyPath: 'id' });
          }

          // 2. Create captures store and indexes
          if (!db.objectStoreNames.contains('captures')) {
            const captureStore = db.createObjectStore('captures', { keyPath: 'id' });
            captureStore.createIndex('sessionId', 'sessionId', { unique: false });
            captureStore.createIndex('sessionId_order', ['sessionId', 'order'], { unique: false });
          }

          // 3. Create images store
          if (!db.objectStoreNames.contains('images')) {
            db.createObjectStore('images', { keyPath: 'id' });
          }

          // 4. Create ocrResults store
          if (!db.objectStoreNames.contains('ocrResults')) {
            db.createObjectStore('ocrResults', { keyPath: 'captureId' });
          }
        }

        // ── Version 2: Backfill Page fields on existing capture records ─────────
        //
        // Existing v1 records only have:
        //   id, sessionId, imageId, order, source, createdAt, processingStatus
        //
        // Every legacy screenshot record is treated as a SCREENSHOT page with:
        //   type            ??= 'SCREENSHOT'
        //   renderedImageId ??= imageId
        //   annotationData  ??= null
        //   version         ??= 1
        //
        // Fields are only set when absent — already-present values are preserved.
        if (oldVersion < 2) {
          if (db.objectStoreNames.contains('captures')) {
            const capturesStore = upgradeTx.objectStore('captures');
            const getAllRequest = capturesStore.getAll();

            getAllRequest.onsuccess = () => {
              const records = getAllRequest.result as Array<Record<string, unknown>>;
              for (const record of records) {
                // Apply safe defaults only for absent fields.
                let changed = false;

                if (record['type'] === undefined) {
                  record['type'] = 'SCREENSHOT';
                  changed = true;
                }

                if (record['renderedImageId'] === undefined) {
                  // Fall back to imageId — every v1 screenshot record has one.
                  record['renderedImageId'] = record['imageId'] ?? '';
                  changed = true;
                }

                if (record['annotationData'] === undefined) {
                  record['annotationData'] = null;
                  changed = true;
                }

                if (record['version'] === undefined) {
                  record['version'] = 1;
                  changed = true;
                }

                if (changed) {
                  capturesStore.put(record);
                }
              }

              console.log(
                `[DatabaseManager] v1 → v2 migration: backfilled Page fields on ${records.length} capture record(s).`
              );
            };

            getAllRequest.onerror = () => {
              console.error(
                '[DatabaseManager] v1 → v2 migration: failed to read captures store during upgrade.',
                getAllRequest.error
              );
              // Do not abort — the upgrade transaction continuing is preferable to
              // a hard failure; the mapper's defensive defaults will handle any
              // unmigrated records at read time.
            };
          }
        }
      };
    });

    return this.openPromise;
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export single instance for application-wide sharing
export const dbManager = new DatabaseManager();
