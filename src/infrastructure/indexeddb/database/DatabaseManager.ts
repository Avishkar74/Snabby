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
  private static readonly DB_VERSION = 1;

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

        console.log(`[DatabaseManager] Upgrading database from version ${oldVersion} to ${DatabaseManager.DB_VERSION}`);

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
