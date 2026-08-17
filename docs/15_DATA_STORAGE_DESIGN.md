# 15 — Data Storage Design

## 1. Purpose

This document defines how Snabby v1 will persist its data using **IndexedDB**.

The existing project currently persists screenshot records through `chrome.storage.local`, while it also contains a separate `BlobStore` implementation using IndexedDB. We will **not copy either implementation directly**. Instead, we will use IndexedDB as the primary persistence layer and design the schema around the new data model. 

---

# 2. Storage Decision

Snabby v1 uses:

```text
IndexedDB
```

as the persistent local database.

We will not use:

```text
chrome.storage.local
```

for sessions, captures, images, or OCR results.

The storage architecture is:

```text
Application
     ↓
Repository Interfaces
     ↓
IndexedDB Repositories
     ↓
IndexedDB
```

---

# 3. Database

Conceptually:

```text
Database: snabby
```

The database name is `snabby`.

The database version number is:

```text
snabby
  version: 1
```

Database versioning allows schema migrations when the database schema evolves.

---

# 4. Object Stores

The proposed v1 database contains four object stores:

```text
snabby
│
├── sessions
├── captures
├── images
└── ocrResults
```

Their responsibilities are:

| Store        | Contains                      |
| ------------ | ----------------------------- |
| `sessions`   | Session metadata              |
| `captures`   | Capture metadata and ordering |
| `images`     | Screenshot Blobs              |
| `ocrResults` | OCR output and bounding boxes |

---

# 5. Sessions Store

## Purpose

Stores the metadata of each capture session.

Conceptually:

```text
sessions
│
└── Session
    ├── id
    ├── name
    ├── createdAt
    └── updatedAt
```

The session should **not contain the screenshot Blobs themselves**.

---

# 6. Session Key

Primary key:

```text
id
```

Example:

```text
719266ad-22a4-4fa0-82cf-f8444a7f0535
```

The ID-generation strategy uses branded string UUIDs generated using `crypto.randomUUID()`.

The ID must remain stable for the lifetime of the session.

---

# 7. Captures Store

## Purpose

Stores metadata describing individual screenshots.

Conceptually:

```text
captures
│
└── Capture
    ├── id
    ├── sessionId
    ├── imageId
    ├── order
    ├── source
    ├── createdAt
    └── processing state
```

The screenshot itself is not stored directly inside this record.

---

# 8. Capture → Session Relationship

Each capture contains:

```text
sessionId
```

Therefore:

```text
Session
   │
   ├── Capture
   ├── Capture
   └── Capture
```

The relationship is:

```text
1 Session → N Captures
```

---

# 9. Capture Indexes

The `captures` store needs an index for retrieving captures belonging to a session.

Conceptually:

```text
index:
sessionId
```

This allows:

```text
getCaptures(sessionId)
```

without scanning every capture.

We also need ordering by the capture's `order` value.

We use a compound index named `sessionId_order` defined on `['sessionId', 'order']` to retrieve captures for a session sorted by their order natively without post-sorting in memory.

---

# 10. Capture Ordering

Capture order is important because:

```text
UI order
    =
PDF page order
```

Therefore every capture has:

```text
order: number
```

Example:

```text
Capture A → 0
Capture B → 1
Capture C → 2
```

If captures are reordered:

```text
C → 0
A → 1
B → 2
```

the new ordering must be persisted.

---

# 11. Images Store

## Purpose

Stores the actual screenshot data.

Conceptually:

```text
images
│
└── ImageAsset
    ├── id
    ├── blob
    ├── mimeType
    ├── width
    ├── height
    └── createdAt
```

The important difference from the old implementation is:

```text
OLD
data:image/png;base64,...

NEW
Blob
```

The existing `BlobStore` already demonstrates storing image data as a Blob in IndexedDB, although it is not the storage path used by the current `SessionManager`. 

---

# 12. Why Store Blobs

Screenshots can be large.

We therefore don't want application persistence to look like:

```text
Capture
└── huge base64 string
```

Instead:

```text
Capture
└── imageId
      ↓
Images Store
└── Blob
```

This also keeps capture metadata relatively small.

---

# 13. Image Metadata

The image record should retain enough information to understand the Blob without decoding it.

Conceptually:

```text
ImageAsset
├── id
├── blob
├── mimeType
├── width
├── height
└── createdAt
```

The exact metadata fields will be confirmed against the actual capture/image-processing behavior before implementation.

---

# 14. OCR Results Store

## Purpose

Stores the normalized OCR result for a capture.

Conceptually:

```text
ocrResults
│
└── OCRResult
    ├── captureId
    ├── status
    ├── fullText
    ├── words
    ├── imageWidth
    └── imageHeight
```

The existing OCR implementation produces word-level bounding boxes and image dimensions, which are required by the PDF text-layer implementation. 

---

# 15. OCR → Capture Relationship

OCR belongs to a capture:

```text
Capture
   │
   └── OCRResult
```

For v1:

```text
1 Capture → 0 or 1 OCRResult
```

A capture can exist even when OCR fails.

---

# 16. OCR Word Data

The OCR result contains word-level information.

Conceptually:

```text
words: [
    {
        text,
        confidence,
        boundingBox
    }
]
```

The bounding box remains in the **original image coordinate system**.

```text
OCR
 ↓
Image Coordinates
```

PDF generation performs the coordinate transformation later.

---

# 17. OCR Key

The primary lookup is by:

```text
captureId
```

Therefore the OCR store needs an index/key that allows:

```text
getOCRResult(captureId)
```

The primary key is finalized as `captureId` inside `DatabaseManager.ts` to support direct one-to-one retrieval.

---

# 18. Complete Storage Relationship

```text
                    sessions
                       │
                       │ sessionId
                       ▼
                    captures
                   /         \
                  /           \
             imageId        captureId
                │                │
                ▼                ▼
             images          ocrResults
```

This gives us a clean separation between:

```text
Metadata
Large binary data
OCR data
```

---

# 19. Why Not Store Everything in One Record?

We intentionally avoid:

```text
Session
└── captures[]
      ├── huge image Blob
      └── huge OCR result
```

because:

* session metadata becomes unnecessarily large.
* updating one capture modifies a larger structure.
* image data and metadata have different access patterns.
* deleting individual captures becomes less clean.
* IndexedDB indexes become less useful.

Instead:

```text
Session
   ↓
Capture
   ├── Image
   └── OCR
```

---

# 20. Transaction Boundaries

Operations involving multiple related records should use IndexedDB transactions where atomicity matters.

For example, creating a capture may involve:

```text
images
+
captures
```

Conceptually:

```text
BEGIN TRANSACTION
    save image
    save capture
COMMIT
```

If the operation fails:

```text
ROLLBACK
```

so we don't leave an orphaned image.

The transaction implementation is defined by the LLD and implemented within the IndexedDB repositories.

---

# 21. Capture Creation

The intended persistence flow is:

```text
Screenshot
    ↓
Image Processing
    ↓
Image Blob
    ↓
Create ImageAsset + Capture
    ↓
CapturePersistenceService (Atomic transaction)
    ↓
IndexedDB ('captures' and 'images' stores)
    ↓
Start OCR
```

The capture should be persisted before OCR completes because OCR is asynchronous.

This follows the behavior of the existing implementation, where the screenshot is saved and OCR is subsequently started without blocking capture persistence. 

---

# 22. OCR Persistence

OCR is persisted separately after recognition finishes:

```text
Capture
   │
   ▼
OCR
   │
   ▼
Normalize Result
   │
   ▼
Save OCRResult
```

Therefore:

```text
Capture exists
+
OCRResult doesn't exist yet
```

is a valid intermediate state.

---

# 23. Delete Capture

Deleting a capture requires cleanup of its dependent records.

```text
Delete Capture
      │
      ├── Delete OCRResult
      ├── Delete Image
      └── Delete Capture
```

This should be performed safely so that failed deletion does not leave the database in an unexpected state.

The transaction strategy is defined by the LLD and implemented within the IndexedDB repositories.

---

# 24. Delete Session

Deleting a session requires deleting all dependent captures and their data.

```text
Delete Session
      │
      ▼
Find captures
      │
      ├── Capture 1
      │     ├── Image
      │     └── OCR
      │
      ├── Capture 2
      │     ├── Image
      │     └── OCR
      │
      └── ...
      │
      ▼
Delete Session
```

This is a multi-store operation.

---

# 25. Orphan Prevention

We should avoid records like:

```text
images
└── image123

captures
└── no capture references image123
```

or:

```text
ocrResults
└── capture456

captures
└── capture456 doesn't exist
```

The repository/use-case layer should therefore control creation and deletion of related records.

---

# 26. Session Restoration

When the extension UI starts:

```text
React
   ↓
Session Use Case
   ↓
Session Repository
   ↓
IndexedDB
```

The application can retrieve the relevant session and its captures.

On application startup:
1. Look for the persisted ACTIVE session.
2. If found, restore it.
3. If not found, show/create a new session.

---

# 27. No Storage Quota in UI

IndexedDB is used internally.

The React UI will not show:

```text
200 MB remaining
Storage used: 45 MB
```

unless such a feature is explicitly added later.

Storage management remains an infrastructure concern.

---

# 28. Database Versioning

IndexedDB schema changes require database version upgrades.

Conceptually:

```text
Version 1
   ↓
Version 2
   ↓
Version 3
```

The upgrade handler will perform migrations.

Example future change:

```text
v1:
images

v2:
images + new metadata index
```

The migration logic should live in the IndexedDB infrastructure layer rather than in React or domain services.

---

# 29. Database Initialization

Application startup should ensure the database is ready before operations requiring persistence.

```text
Application Start
      ↓
Open IndexedDB
      ↓
Run required migrations
      ↓
Database Ready
      ↓
Application continues
```

Database initialization should happen through a dedicated database/infrastructure module.

---

# 30. Repository Boundary

The rest of the application should not directly know about object stores.

Instead:

```text
Capture Service
      ↓
CaptureRepository
      ↓
IndexedDBCaptureRepository
      ↓
IndexedDB
```

Similarly:

```text
Image Service
      ↓
ImageRepository
      ↓
IndexedDBImageRepository
```

This allows the persistence implementation to change without rewriting the application layer.

---

# 31. Proposed Repository Interfaces

Conceptually:

```text
SessionRepository
├── create()
├── getById()
├── update()
└── delete()

CaptureRepository
├── create()
├── getById()
├── getBySessionId()
├── update()
└── delete()

ImageRepository
├── save()
├── getById()
└── delete()

OCRRepository
├── save()
├── getByCaptureId()
└── delete()
```

These are conceptual contracts, not final TypeScript definitions.

---

# 32. Data Access Rule

Application code should never do:

```text
indexedDB.open(...)
```

directly.

Only the infrastructure layer should know:

```text
database name
object store names
indexes
transactions
schema versions
```

Therefore:

```text
React ❌
Use Case ❌
Domain Service ❌
Repository ✓
IndexedDB Infrastructure ✓
```

---

# 33. Large Data Handling

The main large objects are:

```text
Screenshot Blob
OCR result
PDF Blob
```

The first two are persistent.

The generated PDF is primarily a temporary artifact:

```text
Images → PDF Blob → Download
```

We do not currently need to persist generated PDFs.

This avoids unnecessary storage growth.

---

# 34. PDF Storage Decision

Generated PDFs are **not persisted in IndexedDB by default**.

Flow:

```text
IndexedDB
   ↓
Load images + OCR
   ↓
Generate PDF
   ↓
PDF Blob
   ↓
Download
```

Once the download operation is complete, the PDF Blob can be released.

If retry/caching requirements later justify persistence, that would be a separate architectural decision.

---

# 35. Temporary Object URLs

When displaying an image or downloading a PDF, an object URL may be created:

```text
Blob
 ↓
URL.createObjectURL()
 ↓
blob:...
```

The object URL is temporary.

It is not the database identifier.

After it is no longer required:

```text
URL.revokeObjectURL()
```

---

# 36. Storage Flow

The complete v1 storage architecture is:

```text
                         React
                           │
                           ▼
                     Application
                           │
                           ▼
                     Repositories
                           │
                           ▼
                    IndexedDB Layer
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
      sessions          captures          images
                           │
                           ▼
                       ocrResults
```

---

# 37. Example: One Capture

Suppose:

```text
Session ID = S1
Capture ID = C1
Image ID = I1
```

The database contains:

```text
sessions
└── S1
    name = "Research"

captures
└── C1
    sessionId = S1
    imageId = I1
    order = 0

images
└── I1
    blob = <PNG Blob>
    width = 1920
    height = 1080

ocrResults
└── C1
    status = COMPLETED
    fullText = "..."
    words = [...]
```

---

# 38. Example: OCR Not Finished

Immediately after capture:

```text
sessions
└── S1

captures
└── C1

images
└── I1

ocrResults
└── no record yet
```

After OCR:

```text
ocrResults
└── C1
```

This represents the asynchronous nature of OCR without making the capture itself dependent on OCR completion.

---

# 39. Storage Lifecycle

```text
Capture
   ↓
Create Image
   ↓
Create Capture
   ↓
OCR Processing
   ↓
Create OCR Result
   ↓
PDF Generation
   ↓
Download
   ↓
User Deletes Capture
   ↓
Delete OCR
   ↓
Delete Image
   ↓
Delete Capture
```

---

# 40. Storage Decisions Finalized

The following persistence decisions are now finalized:

* Database name: `snabby`
* Database version: `1`
* Key generation: Branded UUID string identifiers (`crypto.randomUUID()`)
* Object stores: `sessions`, `captures`, `images`, and `ocrResults`
* Indexes: `sessionId` index and compound sorting index `sessionId_order = ['sessionId', 'order']` on `captures`
* OCR primary key: `captureId` (1:1 with captures)
* Transaction boundaries: Atomic cascade deletion implemented directly in repository implementations

---

# 41. Final Storage Architecture

```text
                         SNABBY
                           │
                           ▼
                     Application
                           │
                     Repository APIs
                           │
                           ▼
                 ┌────────────────────┐
                 │     IndexedDB       │
                 │                    │
                 │  ┌──────────────┐  │
                 │  │   sessions   │  │
                 │  └──────┬───────┘  │
                 │         │          │
                 │         ▼          │
                 │  ┌──────────────┐  │
                 │  │   captures   │  │
                 │  └───┬──────┬───┘  │
                 │      │      │       │
                 │      ▼      ▼       │
                 │  images   ocrResults│
                 │                    │
                 └────────────────────┘
```

---

# 42. Key Decisions

| Decision                           | Choice                                   |
| ---------------------------------- | ---------------------------------------- |
| Persistent storage                 | **IndexedDB**                            |
| `chrome.storage.local`             | **Not used for application persistence** |
| Screenshot format                  | **Blob**                                 |
| Session storage                    | IndexedDB                                |
| Capture metadata                   | IndexedDB                                |
| OCR results                        | IndexedDB                                |
| Generated PDF persistence          | **No**                                   |
| Image/OCR separation               | **Yes**                                  |
| Session → Captures                 | 1:N                                      |
| Capture → Image                    | 1:1                                      |
| Capture → OCR                      | 1:0..1                                   |
| Capture ordering                   | Persisted                                |
| Storage quota UI                   | **No**                                   |
| Schema migrations                  | IndexedDB versioning                     |
| Direct IndexedDB access from React | **No**                                   |

> **Core principle:** IndexedDB is Snabby's persistent source of truth. Metadata, screenshot Blobs, and OCR results are separated into independently addressable records, while repositories hide all IndexedDB-specific details from the application and React layers.
