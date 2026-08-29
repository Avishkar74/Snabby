# 12 — Data Models

## 1. Purpose

This document defines the core data models used by Snabby.

The goal is to establish **what data exists and how the entities relate to each other** before defining functions, constants, and the LLD.

We will keep three concepts separate:

```text
The domain model design, TypeScript interfaces, and IndexedDB schemas are finalized and implemented.
```

---

# 2. Core Entities

Snabby has four primary persistent entities:

```text
Session
   │
   └── Capture[]
          │
          ├── Image
          │
          └── OCRResult
```

### Entities

| Entity       | Purpose                               |
| ------------ | ------------------------------------- |
| `Session`    | Represents one Snabby capture session |
| `Capture`    | Represents one captured screenshot    |
| `ImageAsset` | Represents the screenshot/image data  |
| `OCRResult`  | Represents OCR output for a capture   |

---

# 3. Session

A session groups multiple captures that will eventually become one PDF.

Conceptually:

```text
Session
├── id
├── name
├── createdAt
├── updatedAt
└── captures
```

Proposed domain model:

```text
Session {
    id: SessionId
    name: string
    createdAt: Timestamp
    updatedAt: Timestamp
}
```

Captures should **not necessarily be embedded directly inside the session object**.

They can be retrieved using `sessionId`.

---

# 4. Capture

A capture represents one screenshot taken during a session.

```text
Capture
├── id
├── sessionId
├── order
├── imageId
├── source
├── createdAt
└── processing state
```

Conceptually:

```text
Capture {
    id: CaptureId
    sessionId: SessionId
    imageId: ImageId
    order: number
    source: CaptureSource
    createdAt: Timestamp
    processing: ProcessingState
}
```

---

# 5. Capture Source

A capture can have a source/mode.

For v1:

```text
CaptureSource
├── FULL_SCREEN
└── CROP_REGION
```

Phone upload is **not part of v1**.

However, the model should be extensible so that a future version can add:

```text
PHONE_UPLOAD
```

without changing the fundamental capture model.

---

# 6. Capture Processing State

A capture goes through multiple processing stages.

Conceptually:

```text
Capture
   │
   ├── Image processing
   │
   └── OCR
```

We should avoid putting every temporary processing detail into the core `Capture` entity.

A simplified state could represent the overall processing status:

```text
ProcessingStatus
├── PENDING
├── PROCESSING
├── COMPLETED
└── FAILED
```

Image processing and OCR have separate, distinct lifecycles, so Snabby v1 uses separate statuses: `processingStatus` (Capture) and `OCRStatus` (OCR Result).

---

# 7. ImageAsset

The actual screenshot should be represented separately from capture metadata.

Conceptually:

```text
ImageAsset
├── id
├── data
├── width
├── height
├── mimeType
└── createdAt
```

Proposed model:

```text
ImageAsset {
    id: ImageId
    data: Blob
    width: number
    height: number
    mimeType: string
    createdAt: Timestamp
}
```

The `Blob` is the important part because screenshots can be relatively large.

---

# 8. Why Image Is Separate

We don't want the capture metadata to become:

```text
Capture {
    ...
    hugeImageBlob
    ...
}
```

Instead:

```text
Capture
   │
   └── imageId
          ↓
      ImageAsset
```

This keeps metadata operations lightweight and gives the storage layer flexibility.

This is stored in a separate IndexedDB object store named `images`.

---

# 9. OCRResult

OCR represents text extracted from a specific image.

```text
OCRResult
├── captureId
├── status
├── fullText
├── words
├── imageWidth
├── imageHeight
└── errorDetails (optional — populated when status is FAILED)
```

Conceptually:

```text
OCRResult {
    captureId: CaptureId
    status: OCRStatus
    fullText: string
    words: OCRWord[]
    imageWidth: number
    imageHeight: number
    errorDetails?: string
}
```

---

# 10. OCR Status

OCR has an explicit lifecycle with these terminal states:

```text
OCRStatus
├── PENDING     (initial state when capture is first persisted)
├── PROCESSING  (OCR job is actively running in offscreen document)
├── COMPLETED   (OCR succeeded; fullText and words are populated)
└── FAILED      (OCR failed; errorDetails string is populated)
```

`PENDING` and `PROCESSING` are stored on `Capture.status`. `COMPLETED` and `FAILED` are terminal states stored on both `Capture.status` and `OCRResult.status`. The `errorDetails` field on `OCRResult` contains the error message when `status = FAILED`.

---

# 11. OCRWord

The OCR text layer requires **word-level coordinates**, not just the final text.

Conceptually:

```text
OCRWord
├── text
├── confidence
└── boundingBox
```

Proposed model:

```text
OCRWord {
    text: string
    confidence: number
    boundingBox: BoundingBox
}
```

---

# 12. BoundingBox

The bounding box represents the location of a recognized word in the original image.

```text
BoundingBox {
    x: number
    y: number
    width: number
    height: number
}
```

The coordinates are stored in **image coordinate space**.

Example:

```text
Image
┌─────────────────────────┐
│                         │
│     ┌──────────────┐    │
│     │    Snabby    │    │
│     └──────────────┘    │
│                         │
└─────────────────────────┘

x, y, width, height
```

The PDF generator transforms these coordinates into PDF coordinates.

---

# 13. Important OCR Rule

The OCR model should store coordinates relative to the **original image**, not the PDF.

```text
OCR
 ↓
Image Coordinates
```

Then:

```text
PDF Generator
 ↓
Transform
 ↓
PDF Coordinates
```

This prevents PDF-specific logic from leaking into the OCR subsystem.

---

# 14. Timestamp

Timestamps should use a consistent representation.

Conceptually:

```text
Timestamp
```

The TypeScript representation is finalized as a number type representing milliseconds since Unix epoch (using `Date.now()` for generation).

Relevant timestamps include:

```text
Session.createdAt
Session.updatedAt
Capture.createdAt
ImageAsset.createdAt
```

---

# 15. Entity Relationships

The complete relationship is:

```text
Session
   │
   │ 1 : N
   ▼
Capture
   │
   ├──── 1 : 1 ──── ImageAsset
   │
   └──── 1 : 0..1 ─ OCRResult
```

Meaning:

```text
One Session
    → many Captures

One Capture
    → one ImageAsset

One Capture
    → zero or one OCRResult
```

---

# 16. Identifiers

Each persistent entity should have its own identifier.

Conceptually:

```text
SessionId
CaptureId
ImageId
```

Avoid relying on array indexes as entity IDs.

For example:

```text
capture.order = 0
```

is **not** the capture's identity.

If the user reorders captures:

```text
Capture A
order = 0 → order = 3
```

its `CaptureId` must remain unchanged.

---

# 17. Ordering

Capture ordering is session-specific.

Therefore:

```text
Capture {
    ...
    order: number
}
```

is conceptually required.

Example:

```text
Capture A → order 0
Capture B → order 1
Capture C → order 2
```

This same order determines:

```text
UI order
     =
PDF page order
```

The ordering strategy uses a compound index `sessionId_order` in the IndexedDB schema for sorted retrieval.

---

# 18. Domain Model vs Persistence Model

The models above describe **application concepts**.

IndexedDB records may look slightly different.

For example:

```text
Domain:

Capture
├── image
└── OCR
```

could be persisted as:

```text
IndexedDB:

captures
images
ocrResults
```

with relationships represented using IDs.

Therefore:

```text
Domain Model
     ↕
Mapper
     ↕
Persistence Model
```

The application should not depend on IndexedDB-specific record structures.

---

# 19. Message DTOs

Communication between contexts should use dedicated DTOs rather than passing entire domain objects unnecessarily.

For example:

```text
CaptureRequest
├── requestId
├── captureMode
└── ...
```

and:

```text
OCRRequest
├── requestId
├── captureId
└── image reference/data
```

The complete message schemas will be defined in:

```text
15_EXTERNAL_CONTRACTS.md
```

---

# 20. UI Models

React may also need lightweight models.

For example:

```text
CaptureViewModel
├── captureId
├── preview
├── order
├── processingStatus
└── metadata
```

A UI model does not need to contain the entire `ImageAsset` or `OCRResult`.

This avoids unnecessarily coupling the UI to persistence structures.

---

# 21. Model Boundaries

The intended architecture is:

```text
                    Domain Models
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     React Models   Message DTOs   Persistence Models
          │              │              │
          ▼              ▼              ▼
         UI          Messaging       IndexedDB
```

Mappings between these representations belong to their respective application/infrastructure boundaries.

---

# 22. Data Lifecycle

A capture's data lifecycle is:

```text
Screenshot Captured
       ↓
ImageAsset Created
       ↓
Capture Created
       ↓
Image Processing
       ↓
OCR
       ↓
OCRResult Created
       ↓
Session Available
       ↓
PDF Generation
       ↓
Download
```

The original capture data remains available even if OCR or PDF generation fails.

---

# 23. Deletion Relationships

Deleting a capture should eventually remove its dependent data:

```text
Delete Capture
     │
     ├── ImageAsset
     └── OCRResult
```

Deleting a session should remove its captures and their dependent data:

```text
Delete Session
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
```

The transaction/cascade implementation is executed atomically within IndexedDB repository implementations.

---

# 24. V1 Model Scope

### Included

```text
Session
Capture
ImageAsset
OCRResult
OCRWord
BoundingBox
CaptureSource
Processing/OCR Status
```

### Not included

```text
PhoneUpload
CloudSession
UserAccount
RemoteStorage
SyncState
```

Phone upload can later introduce a new capture source without fundamentally changing the session/capture relationship.

---

# 25. Proposed TypeScript Shape

This is **conceptual**, not the final code:

```text
Session
Capture
ImageAsset
OCRResult
OCRWord
BoundingBox

CaptureSource
OCRStatus
ProcessingStatus
```

We have implemented these domain models cleanly.

---

# 26. Domain Model Finalization

The final TypeScript representations are implemented under `src/domain/` with:
- Branded UUID string identifiers (`SessionId`, `CaptureId`, `ImageId`) generated via `crypto.randomUUID()`.
- Time representation as standard Epoch milliseconds (`Timestamp = number`).
- Capture `ProcessingStatus` separate from OCR `OCRStatus`.
- Invariant validation enforced inside domain constructors (e.g. Session requires name, Capture requires positive order).
- Domain mapping boundary cleanly separating domain models from raw database records.
