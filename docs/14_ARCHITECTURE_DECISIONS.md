# 14 — Architecture Decisions

## 1. Purpose

This document records the architectural decisions for the **new Snabby implementation**.

The existing project is used as a **behavioral reference**, not as the architecture to copy.

The old code contains multiple approaches, including unused/partially implemented code. We will select the cleanest approach and rebuild it using React, SOLID principles, and IndexedDB.

---

# 2. Core Architectural Direction

The new Snabby will follow:

```text
React UI
   ↓
Application Use Cases (feature-based)
   ↓
Domain / Application Interfaces
   ↓
Infrastructure (IndexedDB, Chrome APIs, Tesseract, pdf-lib)
```

Responsibilities are strictly separated. The application layer orchestrates behavior through use cases grouped by feature (`session/`, `capture/`, `ocr/`, `pdf/`), while repository interfaces and adapters decouple the core from technology-specific infrastructure details.

---

# 3. UI — React

### Decision

**Use React for the UI.**

The existing UI/UX is already finalized and will be reproduced using React rather than redesigning it.

```text
Finalized UI
     ↓
React Components
```

React will handle:

* Rendering.
* User interaction.
* UI state.
* Loading/progress/error presentation.

React will **not** directly handle:

* IndexedDB.
* OCR.
* PDF generation.
* Chrome APIs.

---

# 4. Persistence — IndexedDB

### Decision

**IndexedDB will be the primary persistence mechanism.**

The old implementation stores screenshot records through `chrome.storage.local`, even though it also contains a separate IndexedDB `BlobStore`. The current `SessionManager`/`StorageManager` path uses `chrome.storage.local`.

We will **not reproduce that architecture**.

New architecture:

```text
Session
   ↓
IndexedDB

Capture
   ↓
IndexedDB

Image Blob
   ↓
IndexedDB

OCR Result
   ↓
IndexedDB
```

---

# 5. IndexedDB Blob Storage

The existing `BlobStore` demonstrates the intended direction: storing full-resolution images as `Blob`s and keeping metadata separately. 

However, we will **not copy it directly**.

It will be redesigned around our final data model:

```text
sessions
captures
images
ocrResults
```

The final schema, indexes, transactions, and lifecycle will be defined in `15_DATA_STORAGE_DESIGN.md`.

---

# 6. `chrome.storage.local`

### Decision

**Do not use `chrome.storage.local` for Snabby's persistent application data.**

Therefore, we will not carry forward the old pattern:

```text
SessionManager
      ↓
StorageManager
      ↓
chrome.storage.local
```

Instead:

```text
Session Use Case
      ↓
Session Repository
      ↓
IndexedDB
```

This avoids mixing large screenshot data with Chrome's key/value storage model.

---

# 7. Image Representation

### Decision

Use:

```text
Blob
```

for persisted screenshot data rather than storing screenshots as large base64 data URLs.

The old implementation passes and stores screenshots as data URLs, while the unused `BlobStore` was designed specifically to avoid that. 

New direction:

```text
Screenshot
   ↓
Blob
   ↓
IndexedDB
```

Data URLs may still be used temporarily when required by Chrome APIs or libraries, but they are **not the persistence format**.

---

# 8. OCR Engine

### Decision

**Keep Tesseract.js + local WASM OCR.**

This part of the old architecture is fundamentally correct.

The existing implementation runs Tesseract inside the offscreen document and uses locally bundled worker/core/trained-data files.

New architecture:

```text
Service Worker
      ↓
Offscreen Document
      ↓
Tesseract.js
      ↓
Tesseract Worker
      ↓
Local WASM
```

No remote OCR service is required.

---

# 9. OCR Responsibility

### Decision

The OCR engine remains isolated behind an OCR service/adapter.

Application code should depend on something conceptually like:

```text
OCRService
   ↓
OCR Adapter
   ↓
Tesseract
```

The rest of Snabby should not depend directly on Tesseract's result structure.

The existing implementation already normalizes Tesseract's nested blocks/paragraphs/lines into word-level data with bounding boxes. 

We will preserve that useful behavior.

---

# 10. OCR Data

### Decision

Persist:

```text
full text
confidence
word-level text
word confidence
bounding boxes
image dimensions
OCR status
```

The bounding boxes remain in **image coordinate space**.

PDF generation performs the transformation into PDF coordinates.

This preserves the clean boundary between OCR and PDF generation.

---

# 11. Image Processing

### Decision

Keep image normalization as a dedicated operation.

The existing OCR implementation normalizes image orientation and obtains the actual image dimensions before OCR. 

New architecture:

```text
Captured Image
      ↓
Image Processing Service
      ↓
Normalized Image
      ↓
OCR
```

Image processing should not be mixed into the React UI or persistence layer.

---

# 12. Region Capture

### Decision

**Keep Full Screen and Crop Region capture.**

The existing architecture captures the screenshot and uses the page context/canvas for region selection/cropping.

We will preserve the behavior but move the logic into clearly separated components/services.

```text
Capture Request
      ↓
Capture Adapter
      ↓
Screenshot
      ↓
Region Selection / Crop
      ↓
Capture
```

The exact implementation will be defined in the LLD.

---

# 13. PDF Generation

### Decision

**Keep `pdf-lib` as the PDF generation library.**

The existing PDF implementation already provides:

* image embedding
* page creation
* aspect-ratio-preserving scaling
* OCR text layer
* word-level OCR positioning
* invisible/selectable text

This behavior is valuable and should be preserved.

New architecture:

```text
PDF Service
    ↓
PDF Builder
    ↓
pdf-lib
```

---

# 14. OCR Text Layer

### Decision

Preserve the existing approach:

```text
Screenshot
     +
Invisible OCR text
```

The PDF generator uses word bounding boxes and transforms Tesseract's top-left coordinate system into PDF coordinates. 

This is a core Snabby feature and should not be removed during the rewrite.

---

# 15. Download

### Decision

Keep PDF generation and downloading as separate responsibilities.

```text
PDF Service
    ↓
PDF Blob
    ↓
Download Service
    ↓
Chrome Downloads API
```

The PDF generator should not own browser download behavior.

---

# 16. Extension Contexts

### Decision

Keep the Chrome extension's multi-context architecture.

```text
React / Content UI
       ↕
Service Worker
       ↕
Offscreen Document
       ↕
Tesseract Worker
```

The Manifest V3 architecture already uses a service worker and offscreen document.

The important change is **responsibility separation**, not eliminating these contexts.

---

# 17. Service Worker

### Decision

The service worker acts as an **extension infrastructure coordinator**, not as a giant application class.

It will handle things such as:

* Chrome API interaction.
* Runtime message routing.
* Offscreen document lifecycle.
* Extension-level orchestration.

Business logic should live in application services/use cases.

The existing service worker currently handles many responsibilities together, including capture, OCR orchestration, PDF export, and phone upload. 

We will split these responsibilities.

---

# 18. Runtime Messaging

### Decision

Use Chrome runtime messaging where communication between extension contexts is required.

For example:

```text
Service Worker
      ↓
OCR Request
      ↓
Offscreen Document
```

But messages should carry **commands/results**, not become the application's persistent storage mechanism.

---

# 19. Phone Upload

### Decision

**Remove phone upload from v1.**

The existing project contains a backend-based phone upload flow and polling state.

None of that will be implemented in this version.

Therefore, v1 does not include:

```text
QR upload
Phone session
Backend upload
Polling
WebRTC/P2P upload
Phone image synchronization
```

The architecture should remain extensible enough to add another capture source later.

---

# 20. Storage Limit UI

### Decision

**Do not display storage limits in the UI.**

The old UI contains storage-related information, but the new UI will not expose an artificial storage quota.

Storage management remains an internal concern:

```text
React UI
   ✗ storage quota display

IndexedDB
   ✓ persistence
```

---

# 21. Phone Upload Extensibility

Although phone upload is excluded from v1, the capture model should allow additional capture sources later.

Current:

```text
CaptureSource
├── FULL_SCREEN
└── CROP_REGION
```

Future:

```text
CaptureSource
├── FULL_SCREEN
├── CROP_REGION
└── PHONE
```

The core `Session → Capture` relationship should not need to change.

---

# 22. Unused / Competing Implementations

The old project contains code for approaches that should **not automatically be carried forward**.

Examples include:

```text
BlobStore
WebRTC/P2P upload
Backend phone upload
chrome.storage.local persistence
```

The presence of an implementation in the old repository does not mean it is part of the new architecture.

Each component must justify its existence against the new requirements.

---

# 23. SOLID Principle

The new implementation will explicitly follow SOLID principles.

Example:

```text
CaptureScreenshot Use Case
      ↓
CaptureRepository Interface
      ↓
IndexedDBCaptureRepository
```

Each layer should have a clear responsibility.

---

# 24. Dependency Direction

The preferred dependency direction is:

```text
UI
 ↓
Application
 ↓
Domain
 ↓
Interfaces
 ↑
Infrastructure
```

Infrastructure implements interfaces required by the application.

For example:

```text
Application
    ↓
ImageRepository interface
    ↑
IndexedDBImageRepository
```

The application should not depend directly on the IndexedDB implementation.

---

# 25. Source of Truth

For v1:

```text
                    SOURCE OF TRUTH

Sessions       → IndexedDB
Captures       → IndexedDB
Images         → IndexedDB
OCR Results    → IndexedDB
```

Runtime React state is only a representation of that persistent/application state.

---

# 26. What We Keep From the Old Project

```text
✓ Finalized UI/UX
✓ Chrome extension architecture
✓ Full-screen capture
✓ Region capture
✓ Session concept
✓ Multiple captures
✓ Local Tesseract OCR
✓ Offscreen OCR execution
✓ Word-level OCR bounding boxes
✓ Image normalization
✓ pdf-lib
✓ Invisible OCR PDF layer
✓ Chrome download
```

These are behaviors/technologies that already align with the new requirements.

---

# 27. What We Explicitly Change

```text
OLD                         NEW

Vanilla JS UI          →    React

chrome.storage.local  →    IndexedDB

Base64 persistence     →    Blob persistence

Mixed responsibilities →    SOLID layers

Large service worker   →    Coordinator + services

Phone backend          →    Removed from v1

Storage quota UI       →    Removed

Unused implementations →    Not carried forward blindly
```

---

# 28. Architecture Principle

The most important decision is:

> **We are rebuilding Snabby based on its required behavior, not copying its existing codebase.**

The old project tells us:

```text
"What Snabby currently does."
```

The new architecture defines:

```text
"How Snabby should do it cleanly."
```

---

# 29. Decision Summary

| Area                   | Decision                         |
| ---------------------- | -------------------------------- |
| UI                     | React                            |
| Architecture           | Layered + SOLID                  |
| Persistence            | IndexedDB                        |
| Screenshot storage     | Blob                             |
| OCR                    | Local Tesseract.js               |
| OCR execution          | Offscreen Document + Worker/WASM |
| Image processing       | Dedicated service                |
| PDF                    | pdf-lib                          |
| OCR PDF layer          | Invisible word-level text        |
| Download               | Chrome Downloads API             |
| Messaging              | Chrome runtime messaging         |
| Phone upload           | **Not v1**                       |
| Backend                | **Not required for v1**          |
| Storage limit UI       | **Removed**                      |
| Old unused code        | Evaluate; don't blindly copy     |
| `chrome.storage.local` | **Not application persistence**  |

---

## Implementation Status

Data storage design, LLD, and project structure have now been finalized in documents 15–17.

