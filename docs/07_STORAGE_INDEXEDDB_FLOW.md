# 07 — Storage & IndexedDB Flow

## 1. Purpose

This document defines how Snabby stores and retrieves its persistent application data using **IndexedDB**.

For Snabby v1, IndexedDB is the **primary persistent local storage mechanism**.

The storage subsystem is responsible for making data survive:

* React component unmounts.
* Extension popup closing/reopening.
* Service-worker lifecycle changes.
* OCR/PDF operations.
* Browser session changes.

The storage subsystem must provide a clean application-level interface so that the rest of Snabby does **not** need to know how IndexedDB works internally.

The high-level architecture is:

```text
React / Service Worker / Application
                │
                ▼
        Repository Interfaces
                │
                ▼
        IndexedDB Repository
                │
                ▼
          IndexedDB API
                │
                ▼
        Browser Local Storage
```

---

# 2. Why IndexedDB

Snabby deals with data that can be considerably larger than ordinary key-value storage.

A capture can contain:

```text
Screenshot
   +
Metadata
   +
OCR Result
```

Screenshots can be large binary objects, and a session can contain multiple screenshots.

Therefore, Snabby v1 uses IndexedDB rather than `chrome.storage.local` as its primary application database.

The important architectural decision is:

> **IndexedDB is the persistent source of truth for Snabby's application data.**

---

# 3. What Needs to Be Stored

The main persistent concepts identified so far are:

```text
IndexedDB
│
├── Sessions
│
├── Captures
│
├── Image Assets
│
└── OCR Results
```

Conceptually:

```text
Session
   │
   └── Captures
          │
          ├── Image Asset
          │
          └── OCR Result
```

These concepts map directly to the finalized database stores: `sessions`, `captures`, `images`, and `ocrResults`.

---

# 4. Storage Responsibilities

The storage subsystem is responsible for:

* Opening the database.
* Creating/upgrading the database.
* Managing object stores.
* Persisting sessions.
* Persisting captures.
* Persisting image data.
* Persisting OCR results.
* Retrieving entities.
* Updating entities.
* Deleting entities.
* Maintaining required indexes.
* Performing atomic transactions.
* Handling storage errors.
* Supporting recovery after interrupted operations.

It should **not** be responsible for:

* Screenshot capture.
* OCR recognition.
* PDF generation.
* React rendering.
* Session business rules.
* Image processing.

---

# 5. Storage Architecture

The intended architecture is:

```text
┌──────────────────────────────────────┐
│           Application Layer          │
│                                      │
│  Capture  Session  OCR  PDF  UI      │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│          Repository Interfaces       │
│                                      │
│ SessionRepository                    │
│ CaptureRepository                    │
│ ImageRepository                      │
│ OCRRepository                        │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│       IndexedDB Repository Layer     │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│          IndexedDB Infrastructure    │
│                                      │
│ Database connection                  │
│ Transactions                         │
│ Object stores                        │
│ Indexes                              │
│ Serialization / Deserialization      │
└──────────────────┬───────────────────┘
                   │
                   ▼
             IndexedDB
```

The final repositories and interfaces are implemented as:
- Interfaces under `src/application/interfaces/repositories/` (`SessionRepository`, `CaptureRepository`, `ImageRepository`, `OCRRepository`).
- Implementations under `src/infrastructure/indexeddb/repositories/` (`IndexedDBSessionRepository`, `IndexedDBCaptureRepository`, `IndexedDBImageRepository`, `IndexedDBOCRRepository`).

---

# 6. Important Architectural Rule

Application code should **never be scattered with raw IndexedDB calls**.

We do not want:

```text
React Component
   ↓
indexedDB.open(...)
   ↓
IDBTransaction
   ↓
objectStore(...)
```

or:

```text
OCR Service
   ↓
indexedDB.put(...)
```

Instead:

```text
React
  ↓
Use Case
  ↓
Repository
  ↓
IndexedDB
```

This follows the separation-of-concerns principle and supports the SOLID design we want for the rebuilt project.

---

# 7. IndexedDB as Infrastructure

IndexedDB itself is a browser storage technology.

Therefore:

```text
Application
     ↓
Repository Interface
     ↓
IndexedDB Implementation
```

The application should depend on an abstraction.

This means the application knows:

> "I need to save an OCR result."

It does not know:

> "I need to open object store `ocrResults` and call `put()` inside a read-write transaction."

That is an infrastructure concern.

---

# 8. Database Initialization

Before Snabby can access persistent data, the IndexedDB database must be opened.

Conceptually:

```text
Application Starts
       │
       ▼
Initialize Storage
       │
       ▼
Open IndexedDB
       │
       ▼
Database Exists?
       │
   ┌───┴────┐
   │        │
  Yes      No
   │        │
   │        ▼
   │   Create Schema
   │        │
   └───┬────┘
       ▼
Database Ready
```

The application should not perform business operations before storage initialization is complete when those operations depend on persistence.

---

# 9. Database Versioning

IndexedDB databases use a version number.

Conceptually:

```text
Database v1
   ↓
Database v2
   ↓
Database v3
```

When the database version changes:

```text
Open Database
      │
      ▼
Version Changed
      │
      ▼
Upgrade Handler
      │
      ▼
Modify Schema
      │
      ▼
Database Ready
```

Schema migrations will therefore be an explicit part of the storage design.

---

# 10. Schema Creation

During initial database creation, the required object stores and indexes are created.

Conceptually:

```text
Database
│
├── sessions
├── captures
├── images
└── ocrResults
```

The final store names are: `sessions`, `captures`, `images`, and `ocrResults`.

The database schema is implemented in `DatabaseManager.ts`.

---

# 11. Object Stores

IndexedDB organizes persistent data using object stores.

Conceptually:

```text
Database
│
├── Session Store
├── Capture Store
├── Image Store
└── OCR Store
```

Each store represents a persistence boundary for a particular type of data.

These entities are separated into dedicated stores in our final schema.

---

# 12. Sessions Store

The session store conceptually contains:

```text
Session
│
├── id
├── createdAt
├── updatedAt
├── status / lifecycle data
└── session metadata
```

It is responsible for persistent session information.

It should not contain large image binaries unless the final schema demonstrates a strong reason to do so.

---

# 13. Captures Store

The capture store conceptually contains:

```text
Capture
│
├── id
├── sessionId
├── order
├── source metadata
├── capturedAt
├── image reference
├── OCR state
└── processing state
```

The capture represents the relationship between:

```text
Session
   +
Screenshot
   +
Processing state
```

---

# 14. Image Store

Screenshot data can be significantly larger than normal metadata.

Therefore, image data may be stored separately from capture metadata.

Conceptually:

```text
Capture
   │
   └── imageId
          │
          ▼
       Images
          │
          └── Blob
```

This separation allows metadata operations to remain lightweight.

Snabby v1 stores screenshot image Blobs in a dedicated `images` object store.

---

# 15. OCR Store

OCR results can also be stored separately.

Conceptually:

```text
Capture
   │
   └── OCR Result
          │
          ▼
      OCR Store
```

An OCR result may contain:

```text
OCRResult
│
├── captureId
├── fullText
├── imageWidth
├── imageHeight
└── words
      │
      ├── text
      ├── confidence
      └── boundingBox
```

The schema is implemented inside `DatabaseManager.ts` and its mapper helper `ocr.mapper.ts`.

---

# 16. Entity Relationships

The conceptual relationship is:

```text
Session
   │
   │ 1 : N
   ▼
Capture
   │
   ├───────────────┐
   │               │
   │ 1 : 1         │ 1 : 1
   ▼               ▼
Image            OCR Result
```

Therefore:

```text
One Session
   ↓
Many Captures

One Capture
   ↓
One Image

One Capture
   ↓
Zero or One OCR Result
```

The OCR relationship is conceptually optional because OCR may:

* Not have started.
* Be processing.
* Fail.
* Produce no text.

---

# 17. Why OCR Is Optional

A capture can exist without an OCR result.

For example:

```text
Capture
│
├── Image ✓
│
└── OCR
     └── NOT_STARTED
```

or:

```text
Capture
│
├── Image ✓
│
└── OCR
     └── FAILED
```

Therefore, the storage model must not require a successful OCR result for a capture to be valid.

---

# 18. Capture Persistence Flow

When a screenshot is captured:

```text
Screenshot
    │
    ▼
Create Capture
    │
    ▼
Persist Image
    │
    ▼
Persist Capture Metadata
    │
    ▼
Session Updated
```

The capture order and transaction strategies are implemented in `IndexedDBCaptureRepository.ts` and `IndexedDBSessionRepository.ts`.

The important requirement is that the application must not report the capture as safely persisted if the required persistent operation has failed.

---

# 19. Add-Capture Transaction

Adding a capture affects the capture metadata and the raw screenshot image asset.

Conceptually:

```text
Add Capture
    │
    ├── Create Capture
    └── Store Image
```

These operations happen atomically inside a single multi-store transaction.

The transaction scope is:

```text
['captures', 'images']
```

The `sessions` store is NOT part of this atomic transaction. Either the capture and image are both persisted successfully, or no incomplete state is committed.
```

The IndexedDB transaction scopes are isolated to their specific repository implementations.

---

# 20. Why Transactions Matter

Without proper transaction handling, we could end up with:

```text
Session
   ✓

Capture
   ✓

Image
   ✗
```

Now the capture references an image that doesn't exist.

Or:

```text
Session
   ✓

Capture
   ✗

Image
   ✓
```

Now orphaned image data exists.

Transactions should be used where atomicity is required.

---

# 21. Reordering Flow

When the user reorders captures:

```text
React UI
    │
    ▼
New Order
    │
    ▼
Session Use Case
    │
    ▼
Storage Repository
    │
    ▼
IndexedDB
    │
    ▼
Updated Capture Ordering
```

The ordering must be persisted.

Otherwise:

```text
UI order ≠ stored order
```

and reopening the UI could produce a different order.

---

# 22. Reordering Transaction

Conceptually:

```text
Before:

A → 0
B → 1
C → 2
D → 3
```

User moves D to the beginning:

```text
After:

D → 0
A → 1
B → 2
C → 3
```

The update should be persisted as one logical operation.

The exact representation may involve:

* Updating multiple capture records.
* Updating a session-level order list.
* Using another ordering strategy.

We will choose this during schema/LLD design.

---

# 23. Delete Capture Flow

Deleting a capture may require cleanup of related records.

Conceptually:

```text
Delete Capture
      │
      ├── Delete Capture
      ├── Delete Image
      ├── Delete OCR Result
      └── Update Session Ordering
```

The final operation should leave no invalid references.

---

# 24. Delete Transaction

Ideally:

```text
Delete Operation
      │
      ├── Capture removed
      ├── Image removed
      ├── OCR removed
      └── Session ordering updated
```

should either complete consistently or fail without leaving partially applied application state.

This is an important IndexedDB transaction boundary.

---

# 25. Orphan Prevention

The storage subsystem must avoid orphaned records.

For example:

```text
Image
   │
   X
No Capture references it
```

or:

```text
OCR Result
   │
   X
No Capture exists
```

Cleanup rules must ensure that deleting a capture eventually removes or otherwise handles associated derived data.

---

# 26. Reading a Session

When the React UI loads:

```text
React
  │
  ▼
Load Session
  │
  ▼
Session Repository
  │
  ▼
IndexedDB
  │
  ▼
Session
  │
  ▼
Load Captures
  │
  ▼
Load Required Images/OCR
  │
  ▼
Application State
  │
  ▼
React
```

The storage layer may perform several underlying reads, but the application should ideally see a clean session-level result.

---

# 27. Loading Captures in Order

The storage layer must return captures according to the application's ordering requirements.

Conceptually:

```text
IndexedDB
   │
   ▼
Captures
   │
   ▼
Sort / Query by persisted order
   │
   ▼
Ordered Captures
```

The application must not assume that IndexedDB returns records in the order the user expects.

Ordering must be explicit.

---

# 28. Reading Image Data

When an image is required:

```text
Capture
   │
   ▼
imageId
   │
   ▼
Image Repository
   │
   ▼
IndexedDB
   │
   ▼
Blob
   │
   ▼
Application
```

The image should be retrieved only when necessary.

This helps reduce unnecessary memory usage.

---

# 29. Reading OCR Data

When OCR information is required:

```text
Capture
   │
   ▼
OCR Repository
   │
   ▼
IndexedDB
   │
   ▼
OCR Result
```

The same OCR result can be used by:

```text
React UI
```

and:

```text
PDF Generator
```

without running OCR again.

---

# 30. Storage and PDF Generation

PDF generation should retrieve data through application/storage abstractions.

Conceptually:

```text
PDF Generator
     │
     ├── Load Session
     ├── Load Ordered Captures
     ├── Load Images
     └── Load OCR Results
              │
              ▼
          PDF Builder
```

The PDF generator should not directly access IndexedDB.

---

# 31. Storage and OCR

OCR persistence follows:

```text
OCR
 │
 ▼
Normalized OCR Result
 │
 ▼
OCR Repository
 │
 ▼
IndexedDB
```

Later:

```text
IndexedDB
 │
 ▼
OCR Repository
 │
 ▼
PDF Generator
```

This creates a clean separation between OCR computation and storage.

---

# 32. Storage and React

React should never become the permanent owner of the session.

Instead:

```text
IndexedDB
   ↓
Repository
   ↓
Application
   ↓
React State
```

When React unmounts:

```text
React State
   X
```

persistent data remains:

```text
IndexedDB
   ✓
```

When React mounts again:

```text
React
  ↓
Load from IndexedDB
  ↓
Reconstruct UI state
```

---

# 33. Storage as Source of Truth

For persistent application data:

```text
IndexedDB
     =
Persistent Source of Truth
```

React state is:

```text
Current UI Representation
```

not:

```text
Permanent Database
```

This distinction is important for the architecture.

---

# 34. Database Initialization Across Extension Contexts

Snabby contains multiple extension contexts:

```text
Service Worker
React UI
Offscreen Document
```

Each context may have its own JavaScript runtime.

However, they can access the same browser IndexedDB database when operating under the same extension origin.

Conceptually:

```text
Service Worker ────────┐
                       │
React UI ──────────────┼──→ IndexedDB
                       │
Offscreen Document ────┘
```

This gives the application a shared persistent storage mechanism across extension contexts.

The storage implementation should therefore be context-safe.

---

# 35. Important Cross-Context Rule

The application must not rely on:

```text
Service Worker memory
```

to communicate persistent state to:

```text
React UI
```

Instead, persistent state should be available through:

```text
IndexedDB
```

This reduces coupling between extension contexts.

---

# 36. Database Connection Management

The application should have a controlled way of opening the database.

Conceptually:

```text
Storage Initialization
       │
       ▼
Database Manager
       │
       ▼
Open Connection
       │
       ▼
Database Ready
```

The connection reuse and initialization logic is centralized inside `DatabaseManager.ts` to expose a single connection pool.

The important requirement is that every repository should not independently implement database initialization.

---

# 37. Repository Pattern

The storage architecture will use repositories as the application-facing persistence boundary.

Conceptually:

```text
SessionRepository
│
├── create
├── get
├── update
└── delete
```

```text
CaptureRepository
│
├── create
├── get
├── update
├── delete
└── listBySession
```

```text
ImageRepository
│
├── save
├── get
└── delete
```

```text
OCRRepository
│
├── save
├── getByCapture
├── update
└── delete
```

These are conceptual operations only.

The exact interface contracts are declared under `src/application/interfaces/repositories/`.

---

# 38. Repository vs Service

The distinction should remain clear.

### Repository

Responsible for:

> Persistence and retrieval.

### Service / Use Case

Responsible for:

> Business/application behavior.

For example:

```text
Session Use Case
      │
      ▼
Session Repository
      │
      ▼
IndexedDB
```

The session use case decides:

> "Reorder these captures."

The repository decides:

> "How do I persist this change?"

---

# 39. Serialization

IndexedDB can persist JavaScript values, but the application still needs explicit serialization rules.

For example:

```text
Application Model
       │
       ▼
Persistence Model
       │
       ▼
IndexedDB
```

and:

```text
IndexedDB
       │
       ▼
Persistence Model
       │
       ▼
Application Model
```

This prevents database-specific representations from leaking into the application model.

---

# 40. Persistence Models vs Domain Models

We should distinguish:

```text
Domain Model
```

from:

```text
IndexedDB Record
```

They may be similar, but they do not have to be identical.

For example:

```text
Application:

OCRResult
```

may become:

```text
IndexedDB:

{
    key: captureId,
    ...
}
```

The mapping belongs to the storage layer.

This supports clean architecture and future schema migrations.

---

# 41. IndexedDB Indexes

Indexes are required when the application frequently queries by something other than the primary key.

Likely examples include:

```text
captures.sessionId
```

because we frequently need:

```text
Get all captures for session X
```

Potential indexes may also exist for:

```text
createdAt
updatedAt
status
order
```

However:

> We should only create indexes that support real query requirements.

The final index strategy uses `sessionId` and compound `sessionId_order` indexes on the `captures` store.

---

# 42. Query: Captures by Session

One of the most important storage queries is:

```text
Get all captures belonging to session X
```

Conceptually:

```text
Session ID
    │
    ▼
Capture Index
    │
    ▼
Captures
    │
    ▼
Ordered Captures
```

This is why the capture/session relationship must be explicitly represented.

---

# 43. Query: OCR by Capture

Another common query is:

```text
Get OCR result for capture X
```

Conceptually:

```text
Capture ID
    │
    ▼
OCR Store / Index
    │
    ▼
OCR Result
```

The OCR Result is keyed directly by `captureId` as its primary key.

---

# 44. Query: Image by Capture

Similarly:

```text
Capture ID
    │
    ▼
Image Reference
    │
    ▼
Image Store
    │
    ▼
Image Blob
```

This should be efficient because PDF generation may need to load many images.

---

# 45. Storage Error Handling

Potential storage errors include:

```text
DatabaseOpenError
DatabaseUpgradeError
TransactionError
ReadError
WriteError
DeleteError
QuotaError
SerializationError
RecordNotFound
SchemaError
```

These should be converted into application-level errors where appropriate.

Raw `DOMException` or IndexedDB-specific errors should not leak throughout the application.

---

# 46. Quota / Storage Limits

IndexedDB storage is subject to browser storage policies and available disk space.

Snabby stores potentially large screenshots.

Therefore:

```text
Image
   ↓
IndexedDB
   ↓
Storage limit
```

may eventually result in a quota error.

The application should handle this explicitly.

For example:

```text
Image Save
    │
    X
Quota exceeded
    │
    ▼
Storage Error
    │
    ▼
User Feedback
```

The exact user-facing behavior will be designed later.

---

# 47. Interrupted Operations

Browser extension contexts can terminate unexpectedly.

For example:

```text
Capture
  ↓
Persist
  ↓
Service Worker terminates
```

The storage architecture should rely on IndexedDB transaction semantics rather than in-memory assumptions.

A transaction that did not successfully commit should not be treated as persisted.

---

# 48. Atomicity Principle

The key persistence principle is:

> **A successful operation means the required IndexedDB transaction has successfully committed.**

Not:

```text
"put() was called"
```

but:

```text
Transaction committed successfully
```

This distinction is important for reliable persistence.

---

# 49. Storage Recovery

After an interrupted operation, the application should be able to inspect persistent state and recover.

For example:

```text
Application Starts
      │
      ▼
Load Session
      │
      ▼
Inspect Capture States
      │
      ├── Completed
      ├── Processing
      └── Failed
```

A capture that was persisted before OCR started can remain available even if OCR was interrupted.

This is another benefit of separating persistent capture state from processing state.

---

# 50. Processing State vs Stored Data

Persistent storage may contain:

```text
Capture
│
├── image ✓
├── OCR status = PROCESSING
└── OCR result = absent
```

After restart:

```text
Application
   │
   ▼
Detect incomplete processing
   │
   ▼
Decide whether to retry
```

The exact recovery policy will be defined later.

---

# 51. Database Migration Flow

When a future version changes the schema:

```text
Existing Database
      │
      ▼
Open With New Version
      │
      ▼
Upgrade Event
      │
      ▼
Migration
      │
      ▼
New Schema
      │
      ▼
Application
```

Migrations must preserve existing user data wherever possible.

They should be:

* deterministic
* versioned
* testable
* backward-aware where required

---

# 52. Migration Example

Conceptually:

```text
v1

captures
images
ocrResults
sessions
```

Later:

```text
v2

captures
images
ocrResults
sessions
newIndex
```

The upgrade handler creates the required new index without destroying existing data.

---

# 53. Database Version Is Not Application Version

These concepts should remain separate:

```text
Snabby Application Version
```

and:

```text
IndexedDB Schema Version
```

A small application update may not require a database migration.

A database migration may occur independently of visible product functionality.

---

# 54. Delete Session

If a session is deleted, all dependent data must be handled.

Conceptually:

```text
Delete Session
      │
      ▼
Find Captures
      │
      ├── Capture 1
      │      ├── Image
      │      └── OCR
      │
      ├── Capture 2
      │      ├── Image
      │      └── OCR
      │
      └── Capture 3
             ├── Image
             └── OCR
      │
      ▼
Cleanup Dependencies
      │
      ▼
Delete Session
```

The cascade deletions are performed atomically in repository transactions inside `IndexedDBSessionRepository.ts` and `IndexedDBCaptureRepository.ts`.

---

# 55. Session Deletion and Orphans

Deleting only:

```text
Session
```

while leaving:

```text
Captures
Images
OCR
```

would create orphaned records.

Therefore, session deletion must account for the full dependency graph.

---

# 56. Bulk Operations

PDF generation may need to load:

```text
Session
   ↓
10+ captures
   ↓
10+ images
   ↓
10+ OCR results
```

The storage layer should provide efficient ways to retrieve this data without causing unnecessary repeated database operations.

Batching or querying captures for a session uses the native sorting index `sessionId_order` to retrieve records sequentially in one transaction.

---

# 57. Storage and Memory

IndexedDB persistence does not mean all data should remain in memory.

For example:

```text
IndexedDB
│
├── Image 1
├── Image 2
├── Image 3
├── ...
└── Image 100
```

does not mean React should load all 100 images simultaneously.

The application should load data according to the current operation.

This becomes particularly important for large sessions.

---

# 58. Image Blob Lifecycle

If image data is stored as `Blob`:

```text
IndexedDB
    │
    ▼
Blob
    │
    ▼
Create temporary object URL if needed
    │
    ▼
Use image
    │
    ▼
Release object URL
```

The cleanup lifecycle is managed when React components unmount or temporary object URLs are revoked.

---

# 59. Storage and Browser Context Isolation

The same extension-origin IndexedDB database can conceptually be used by:

```text
Service Worker
React UI
Offscreen Document
```

But each context still has its own JavaScript memory.

Therefore:

```text
Shared persistence
      ≠
Shared runtime memory
```

This distinction is important.

IndexedDB is the common persistence boundary.

---

# 60. Storage Event / Synchronization Considerations

When multiple extension contexts interact with the same database:

```text
React UI
     │
     ▼
IndexedDB
     ▲
     │
Service Worker
```

the application needs a strategy for keeping UI state current.

Possible mechanisms include:

* explicit message notifications
* re-reading from IndexedDB
* application-level event bus
* context-specific synchronization

The synchronization strategy is implemented through React state updates and the extension's runtime messaging channels.

---

# 61. Storage and SOLID Principles

The storage architecture supports the project's SOLID goals.

### Single Responsibility

Repositories handle persistence.

They do not perform OCR or PDF generation.

### Open/Closed

A new persistence implementation can theoretically replace IndexedDB without rewriting domain logic.

### Liskov Substitution

Repository interfaces can have different implementations while preserving their contracts.

### Interface Segregation

Different consumers can depend on focused repository interfaces rather than one massive storage interface.

### Dependency Inversion

Application logic depends on repository abstractions rather than directly on IndexedDB.

---

# 62. Example Dependency Direction

The desired dependency direction is:

```text
          Application
              │
              ▼
        Repository API
              │
              ▼
      IndexedDB Adapter
              │
              ▼
         Browser API
```

Not:

```text
Application
     │
     ▼
IndexedDB
     │
     ▼
Application
```

The second architecture creates tight coupling.

---

# 63. Storage Operation: Save Capture

Conceptually:

```text
Capture Use Case
      │
      ▼
Save Capture
      │
      ├── Session
      ├── Capture
      └── Image
      │
      ▼
IndexedDB Transaction
      │
      ▼
Commit
      │
      ▼
Success
```

Failure:

```text
Transaction
     X
Rollback
     │
     ▼
Storage Error
```

---

# 64. Storage Operation: Save OCR

```text
OCR Service
     │
     ▼
Normalized OCR Result
     │
     ▼
OCR Repository
     │
     ▼
IndexedDB
     │
     ▼
Commit
     │
     ▼
OCR Persisted
```

---

# 65. Storage Operation: Load PDF Data

```text
PDF Generation
      │
      ▼
Session Repository
      │
      ▼
Session
      │
      ▼
Capture Repository
      │
      ▼
Ordered Captures
      │
      ├───────────────┐
      ▼               ▼
Image Repository   OCR Repository
      │               │
      ▼               ▼
Images            OCR Results
      │               │
      └───────┬───────┘
              ▼
         PDF Generator
```

---

# 66. Storage Operation: Delete Capture

```text
Delete Capture Use Case
          │
          ▼
Storage Transaction
          │
          ├── Delete OCR
          ├── Delete Image
          ├── Delete Capture
          └── Update Session
          │
          ▼
        Commit
          │
          ▼
      Updated State
```

---

# 67. Storage Operation: Reorder

```text
Reorder Use Case
      │
      ▼
Validate New Order
      │
      ▼
Storage Transaction
      │
      ▼
Update Ordering
      │
      ▼
Commit
      │
      ▼
Updated Session
```

---

# 68. Persistence Failure Example

Suppose the user captures a screenshot:

```text
Screenshot
   ✓
```

Then:

```text
Save Image
   ✓

Save Capture
   X
```

The operation must not be reported as successful.

Depending on the transaction design, the image write should either:

* be rolled back automatically, or
* be cleaned up deterministically.

The user should not be left with a capture that the application believes is valid but cannot retrieve.

---

# 69. Storage State Integrity

The following must never be considered valid:

```text
Capture → nonexistent Session
```

```text
Capture → nonexistent Image
```

```text
OCR Result → nonexistent Capture
```

```text
Session → nonexistent Capture
```

The storage and application layers should enforce these relationships as much as practical.

---

# 70. Storage Invariants

### Invariant 1

IndexedDB is the persistent source of truth.

### Invariant 2

Application code does not directly depend on IndexedDB APIs.

### Invariant 3

Every persisted capture belongs to a valid session.

### Invariant 4

Every persisted image belongs to a valid capture.

### Invariant 5

Every persisted OCR result belongs to a valid capture.

### Invariant 6

Capture ordering is persistent.

### Invariant 7

A failed transaction must not be treated as a successful persistence operation.

### Invariant 8

Deletion must not leave invalid dependent records.

### Invariant 9

React lifecycle does not determine data lifetime.

### Invariant 10

OCR failure does not remove the original capture.

### Invariant 11

Schema changes must be versioned.

### Invariant 12

Database-specific errors should not leak throughout the application.

---

# 71. Storage Error Categories

Conceptual error categories include:

```text
StorageInitializationError
DatabaseOpenError
DatabaseUpgradeError
TransactionError
RecordNotFoundError
RecordWriteError
RecordReadError
RecordDeleteError
QuotaExceededError
SchemaMigrationError
SerializationError
DataIntegrityError
```

The final error handling utilizes our base `DomainError` exception type alongside `ValidationError` and `SessionNotFoundError` to isolate application boundaries cleanly.

---

# 72. Important Design Decisions

## Decision 1 — IndexedDB replaces `chrome.storage.local`

For v1, persistent application data will be stored in IndexedDB.

## Decision 2 — IndexedDB is an infrastructure detail

Application/domain code interacts through repository abstractions.

## Decision 3 — Persistent entities are separated conceptually

Sessions, captures, image assets, and OCR results are treated as distinct concepts.

## Decision 4 — Large image data should not unnecessarily live inside metadata

Image storage will be designed independently from lightweight capture metadata.

## Decision 5 — OCR results are persisted

OCR should not be recomputed every time the application needs the text.

## Decision 6 — Transactions protect multi-record operations

Operations that modify related records should use appropriate IndexedDB transaction boundaries.

## Decision 7 — React state is not persistent storage

React reconstructs its state from persistent application data.

## Decision 8 — Storage is shared across extension contexts

The extension's contexts can use the same IndexedDB persistence boundary.

## Decision 9 — Persistence models are separated from application models

IndexedDB-specific structures should not leak into the rest of the application.

## Decision 10 — Schema migrations are explicit

Database changes will be versioned and handled through IndexedDB upgrade/migration logic.

---

# 73. Storage Decisions Finalized

The following persistence decisions are now finalized:

1. **Database Name/Version**: Name is `snabby`, version is `1`.
2. **Object Stores**: Four stores are configured: `sessions`, `captures`, `images`, and `ocrResults`.
3. **Primary Keys**: `id` for `sessions`, `captures`, and `images`; `captureId` as primary key for `ocrResults` (mapping 1:1 to captures).
4. **Capture Ordering**: Stored via a numeric `order` field on Capture records and sorted natively by compound index `sessionId_order = ['sessionId', 'order']`.
5. **Repositories**: Concrete classes implemented under `src/infrastructure/indexeddb/repositories/` inheriting from application repository interfaces.
6. **Transaction boundaries & Cascading Deletes**: Implemented atomically within IndexedDB repositories via multi-store readwrite transactions.
7. **Database Manager**: Connective connection pooling and initialization handled via [DatabaseManager.ts](file:///d:/Resume%20projects/Snabby/src/infrastructure/indexeddb/database/DatabaseManager.ts).

## 73.2 Future / Unresolved Storage Questions

The following genuinely future decisions remain open:

1. **Storage Quota Policy**: Custom UI/policies for handling disk quota limits.
2. **OCR Recovery Policy**: Interrupted OCR state recovery after browser/worker crashes.
3. **Concurrency Strategy**: Lock-handling or synchronization for rapid concurrent capture inserts.
4. **Future Schema Migrations**: Migration logic when schema changes beyond version 1.

---

# 74. Final Storage Flow

The complete conceptual storage architecture is:

```text
                         APPLICATION
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
         Session            Capture             OCR
          Use Case          Use Case           Service
            │                 │                 │
            ▼                 ▼                 ▼
      Session Repo       Capture Repo       OCR Repo
            │                 │                 │
            └─────────────────┼─────────────────┘
                              │
                              ▼
                    IndexedDB Repository
                              │
                              ▼
                       Database Manager
                              │
                              ▼
                         IndexedDB
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
          Sessions         Captures          Images
                                                │
                                                ▼
                                           OCR Results
```

A more accurate relationship between the persisted data is:

```text
                         IndexedDB
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
        ▼                   ▼                    ▼
     Sessions            Captures              Images
        │                   │
        │                   ├───────────────┐
        │                   │               │
        │                   ▼               ▼
        │                 Image          OCR Result
        │                   │               │
        └───────────────────┴───────────────┘
```

And the primary application flow is:

```text
Capture Mode (FULL_SCREEN)
   │
   ▼
Image Processing
   │
   ▼
Persist Capture + Image (Atomic)
   │
   ▼
OCR
   │
   ▼
Persist OCR Result
   │
   ▼
React
   │
   ▼
PDF Generation
   │
   ▼
Download
```

The key principle is:

> **IndexedDB is the durable backbone of Snabby v1: sessions, captures, screenshot data, and OCR results survive independently of React and extension-runtime lifecycles, while repositories isolate the rest of the application from IndexedDB's implementation details.**

---

# 75. What This Document Establishes

At this point, the architecture has established four major persistent concepts:

```text
┌──────────────┐
│   SESSION    │
└──────┬───────┘
       │
       │ 1 : N
       ▼
┌──────────────┐
│   CAPTURE    │
└──────┬───────┘
       │
       ├───────────────┐
       │               │
       ▼               ▼
┌──────────────┐ ┌──────────────┐
│ IMAGE ASSET  │ │ OCR RESULT   │
└──────────────┘ └──────────────┘
```

These entities map directly to the finalized database schemas implemented in `DatabaseManager.ts` and their corresponding application-facing interfaces: `SessionRepository`, `CaptureRepository`, `ImageRepository`, and `OCRRepository`.

### Component Source Map

| Layer | File Path | Responsibility | Dependencies |
| :--- | :--- | :--- | :--- |
| **Database Core** | `src/infrastructure/indexeddb/DBService.ts`, `DatabaseManager.ts` | Opens and manages `snabby-db` connection (v1 schema) across stores `sessions`, `captures`, `images`, `ocrResults`. | `idb` / native IndexedDB |
| **Atomic Persistence** | `src/infrastructure/indexeddb/services/IndexedDBCapturePersistenceService.ts` | Multi-store atomic transaction across `['captures', 'images']` ensuring capture and image asset are never orphaned. | `DBService`, `CaptureMapper`, `ImageMapper` |
| **Session Repository** | `src/infrastructure/indexeddb/repositories/IndexedDBSessionRepository.ts` | Implements `SessionRepository` interface. | `DBService`, `SessionMapper` |
| **Capture Repository** | `src/infrastructure/indexeddb/repositories/IndexedDBCaptureRepository.ts` | Implements `CaptureRepository` interface. | `DBService`, `CaptureMapper` |
| **Image Repository** | `src/infrastructure/indexeddb/repositories/IndexedDBImageRepository.ts` | Implements `ImageRepository` interface. | `DBService`, `ImageMapper` |
| **OCR Repository** | `src/infrastructure/indexeddb/repositories/IndexedDBOCRRepository.ts` | Implements `OCRRepository` interface. | `DBService`, `OCRMapper` |
| **Entity Mappers** | `src/infrastructure/indexeddb/mappers/*.mapper.ts` | Converts between domain entities and IndexedDB plain record schemas. | Domain Models |

---

> **IndexedDB is the durable backbone of Snabby v1: sessions, captures, screenshot data, and OCR results survive independently of React and extension-runtime lifecycles, while repositories isolate the rest of the application from IndexedDB's implementation details.**

