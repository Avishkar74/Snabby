# 16 — Low-Level Design

## 1. Purpose

This document defines the implementation blueprint for Snabby v1.

It connects the previously defined:

* Requirements
* System flows
* Data models
* Function contracts
* Architecture decisions
* IndexedDB storage design

The goal is to define **which modules exist, what each module is responsible for, and how they depend on each other**.

This is the design we will implement—not a copy of the old project.

---

# 2. Overall Architecture

```text
┌─────────────────────────────────────────────┐
│                  React UI                   │
│                                             │
│ Components → Hooks → UI/Application State   │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│              Application Layer              │
│                                             │
│ Session Use Cases                           │
│ Capture Use Cases                           │
│ OCR Use Cases                               │
│ PDF / Download Use Cases                    │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│                 Domain Layer                │
│                                             │
│ Session / Capture rules                     │
│ Image processing rules                      │
│ OCR result normalization                    │
│ PDF preparation                             │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│              Infrastructure                │
│                                             │
│ IndexedDB  │ Chrome APIs │ Tesseract │ PDF │
└─────────────────────────────────────────────┘
```

---

# 3. Main Architectural Layers

## 3.1 Presentation

Responsible for:

* React components.
* User interaction.
* UI state.
* Loading/error/progress display.

Must not contain business logic.

---

## 3.2 Application

Responsible for:

* Application Use Cases (organized by feature: `session/`, `capture/`, `ocr/`, `pdf/`).
* Orchestration.
* Coordinating domain entities, repository interfaces, and adapter abstractions.
* Converting user actions into application operations.

Example:

```text
CaptureScreenshot Use Case
    ↓
CaptureAdapter
    ↓
ImageRepository
    ↓
OCRRepository
```

---

## 3.3 Domain

Responsible for:

* Domain models.
* Business rules.
* Data transformations.
* Application-independent logic.

This layer should not know about:

```text
React
IndexedDB
Chrome
Tesseract
```

---

## 3.4 Infrastructure

Responsible for interacting with external systems:

```text
IndexedDB
Chrome APIs
Tesseract.js
pdf-lib
```

Infrastructure implements interfaces required by the application/domain layers.

---

# 4. Runtime Contexts

Snabby runs across multiple browser contexts.

```text
                    ┌──────────────┐
                    │   React UI   │
                    │ Content Page │
                    └──────┬───────┘
                           │
                           │ Messages
                           ▼
                    ┌──────────────┐
                    │Service Worker│
                    └──────┬───────┘
                           │
                           │ OCR message
                           ▼
                    ┌──────────────┐
                    │   Offscreen  │
                    │   Document   │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Tesseract.js │
                    │ Worker/WASM  │
                    └──────────────┘
```

These contexts are execution environments, not architectural layers.

---

# 5. React Layer

The React layer contains the finalized Snabby UI.

Conceptually:

```text
App
│
├── NewSession
│
└── ActiveSession
    ├── SessionHeader
    ├── CaptureControls
    ├── CaptureList
    │   └── CaptureCard
    └── DownloadButton
```

Additional UI components can handle:

* Preview/lightbox.
* Loading states.
* Error states.
* Progress.

The existing UI design is treated as fixed.

---

# 6. React Hooks

Hooks provide application operations to components.

Conceptually:

```text
useSession()
useCaptures()
useCapture()
useOCR()
usePDF()
```

Example:

```text
CaptureButton
      ↓
useCapture()
      ↓
capture()
```

The hook should not implement screenshot capture itself.

---

# 7. Application Use Cases

The main use cases are:

```text
Session
├── CreateSession
├── GetSession
├── UpdateSession
└── DeleteSession

Capture
├── CaptureScreenshot
├── GetCaptures
├── DeleteCapture
└── ReorderCaptures

OCR
├── RunOCR
└── GetOCRResult

PDF
├── GeneratePDF
└── DownloadPDF
```

These are the primary entry points for application behavior.

---

# 8. Session Use Case

The session use case coordinates:

```text
React
  ↓
CreateSession
  ↓
SessionRepository
  ↓
IndexedDB
```

It is responsible for:

* Validating session input.
* Creating the session entity.
* Persisting it.
* Returning the resulting domain object.

It should not know how IndexedDB works.

---

# 9. Capture Use Case

The capture use case coordinates the complete capture operation.

```text
React
  ↓
CaptureScreenshot
  ↓
Capture Adapter
  ↓
Screenshot
  ↓
Image Processing
  ↓
Persist Image + Capture
  ↓
Start OCR
```

The use case coordinates the operation but delegates each responsibility.

---

# 10. Capture Adapter

The Chrome-specific capture implementation lives behind an adapter.

Conceptually:

```text
CaptureAdapter
      ↓
Chrome Capture APIs
```

The application asks:

```text
captureScreen()
```

rather than:

```text
chrome.tabs.captureVisibleTab(...)
```

This keeps Chrome-specific APIs out of the domain/application logic.

---

# 11. Region Capture

Region capture involves:

```text
Screenshot
    ↓
Region Selection
    ↓
Crop
    ↓
Processed Image
```

The region-selection implementation belongs to the browser/UI integration layer because it interacts with the webpage and canvas.

The application layer receives the resulting image rather than controlling DOM selection itself.

---

# 12. Image Processing Service

The image processing service is responsible for:

* Decoding image data.
* Normalization.
* Required transformations.
* Producing the image format required by storage/OCR.

Conceptually:

```text
ImageProcessor
      │
      ├── normalize()
      └── process()
```

It should not:

* Save to IndexedDB.
* Run OCR.
* Generate PDFs.

---

# 13. Image Repository

The image repository abstracts persistent image storage.

```text
ImageRepository
├── save()
├── getById()
└── delete()
```

Implementation:

```text
IndexedDBImageRepository
        ↓
images object store
```

The application knows only about `ImageRepository`.

---

# 14. Capture Repository

```text
CaptureRepository
├── create()
├── getById()
├── getBySessionId()
├── update()
└── delete()
```

Implementation:

```text
IndexedDBCaptureRepository
        ↓
captures object store
```

The repository is responsible only for persistence operations.

It does not capture screenshots.

---

# 15. Session Repository

```text
SessionRepository
├── create()
├── getById()
├── update()
└── delete()
```

Implementation:

```text
IndexedDBSessionRepository
        ↓
sessions object store
```

---

# 16. OCR Architecture

OCR is divided into three parts:

```text
OCR Service
     ↓
OCR Adapter
     ↓
Offscreen / Tesseract
```

### OCR Service

Application-level orchestration.

### OCR Adapter

Communication with the actual OCR engine.

### Tesseract

Actual recognition computation.

---

# 17. OCR Runtime Flow

```text
Capture Use Case
      ↓
OCR Service
      ↓
OCR Adapter
      ↓
Service Worker
      ↓
Runtime Message
      ↓
Offscreen Document
      ↓
Tesseract.js
      ↓
Tesseract Worker/WASM
```

The service worker coordinates the operation.

It does not perform the recognition computation itself.

---

# 18. OCR Result Normalization

Tesseract's result should be converted into Snabby's internal format.

```text
TesseractResult
      ↓
OCR Result Normalizer
      ↓
OCRResult
```

This prevents Tesseract-specific structures from spreading throughout the application.

---

# 19. OCR Repository

```text
OCRRepository
├── save()
├── getByCaptureId()
└── delete()
```

Implementation:

```text
IndexedDBOCRRepository
        ↓
ocrResults object store
```

---

# 20. OCR Lifecycle

```text
Capture Created
      ↓
OCR Pending
      ↓
OCR Processing
      ↓
Tesseract
      ↓
Normalize Result
      ↓
Save OCRResult
      ↓
OCR Completed
```

Failure:

```text
OCR Processing
      ↓
Failure
      ↓
OCR Failed
```

The capture itself remains valid.

---

# 21. PDF Architecture

PDF generation is separated into:

```text
PDF Use Case
      ↓
PDF Service
      ↓
PDF Builder
      ↓
pdf-lib
```

The PDF service retrieves the required data through repositories.

---

# 22. PDF Generation Flow

```text
GeneratePDF(sessionId)
          ↓
Load Session
          ↓
Load Ordered Captures
          ↓
Load Images
          ↓
Load OCR Results
          ↓
PDF Builder
          ↓
pdf-lib
          ↓
PDF Blob
```

The PDF builder should not query IndexedDB directly.

---

# 23. PDF OCR Layer

The PDF builder receives:

```text
Image
+
OCRResult
```

and creates:

```text
PDF Page
├── Screenshot Image
└── Invisible OCR Text
```

OCR coordinates are transformed into PDF coordinates during PDF construction.

---

# 24. Download Architecture

Downloading is separate from PDF generation.

```text
PDF Blob
   ↓
Download Service
   ↓
Download Adapter
   ↓
Chrome Downloads API
```

The PDF generator does not know how the browser downloads files.

---

# 25. Download Adapter

Conceptually:

```text
DownloadAdapter
└── download(blob, filename)
```

Implementation:

```text
ChromeDownloadAdapter
        ↓
chrome.downloads
```

This isolates browser-specific download behavior.

---

# 26. IndexedDB Architecture

The storage layer is:

```text
Repository Interfaces
        ↓
IndexedDB Repositories
        ↓
IndexedDB Database
```

Database:

```text
snabby
│
├── sessions
├── captures
├── images
└── ocrResults
```

No React component directly opens IndexedDB.

---

# 27. IndexedDB Database Manager

A central database infrastructure module should handle:

```text
DatabaseManager
├── open()
├── upgrade()
└── close()
```

Its responsibilities include:

* Opening the database.
* Creating object stores.
* Creating indexes.
* Running schema migrations.

Repositories use the database manager instead of implementing database initialization themselves.

---

# 28. Messaging Architecture

Messaging is isolated behind an extension messaging abstraction.

Conceptually:

```text
MessageBus
├── send()
├── request()
└── listen()
```

The infrastructure implementation uses:

```text
chrome.runtime.sendMessage()
```

This keeps Chrome messaging out of application logic.

---

# 29. Message Flow

Example OCR request:

```text
OCR Service
    ↓
Message Bus
    ↓
Service Worker
    ↓
Message Bus
    ↓
Offscreen Document
```

Result:

```text
Offscreen Document
    ↓
Message
    ↓
Service Worker
    ↓
OCR Service
```

Messages contain request IDs so asynchronous operations can be correlated.

---

# 30. Service Worker Structure

The service worker should remain relatively thin.

Conceptually:

```text
Service Worker
│
├── Message Router
│
├── Chrome Adapters
│
└── Application Bootstrap
```

It should not become:

```text
Service Worker
├── all session logic
├── all storage logic
├── all OCR logic
├── all PDF logic
├── all image processing
└── all download logic
```

That was one of the architectural problems we are fixing.

---

# 31. Dependency Direction

Dependencies should flow inward.

```text
                Infrastructure
                     │
                     ▼
               Application
                     │
                     ▼
                  Domain
```

More accurately, using dependency inversion:

```text
Application
    │
    ▼
Interfaces
    ▲
    │
Infrastructure Implementations
```

Example:

```text
CaptureUseCase
      ↓
CaptureRepository
      ↑
IndexedDBCaptureRepository
```

---

# 32. SOLID Application

### Single Responsibility

Each module has one primary responsibility.

```text
OCRService → OCR
PDFService → PDF
ImageProcessor → image processing
Repository → persistence
```

### Open/Closed

New capture sources can be added without rewriting session management.

### Liskov Substitution

Infrastructure implementations should satisfy their interfaces.

### Interface Segregation

Avoid one giant:

```text
SnabbyService
```

Instead use focused interfaces.

### Dependency Inversion

Application code depends on interfaces, not Chrome/IndexedDB/Tesseract implementations.

---

# 33. Cross-Context Data Strategy

Persistent data:

```text
IndexedDB
```

Transient communication:

```text
Runtime Messaging
```

Therefore:

```text
Large persistent image
        ↓
IndexedDB

"Capture completed"
        ↓
Message
```

Messages should not become an alternative database.

---

# 34. State Management

The application should distinguish:

### Persistent state

```text
Sessions
Captures
Images
OCR results
```

### Application runtime state

```text
OCR processing
PDF generation
Download state
Current operation
```

### UI state

```text
Selected capture
Modal state
Input values
```

These should not be merged into one large state object.

---

# 35. Capture End-to-End Architecture

```text
React
  ↓
Capture Hook
  ↓
Capture Use Case
  ↓
Capture Adapter
  ↓
Chrome
  ↓
Screenshot
  ↓
Image Processor
  ↓
Image Repository ──→ IndexedDB
  ↓
Capture Repository ─→ IndexedDB
  ↓
OCR Service
  ↓
OCR Adapter
  ↓
Offscreen
  ↓
Tesseract
  ↓
OCR Repository ──→ IndexedDB
  ↓
React State Update
```

---

# 36. PDF End-to-End Architecture

```text
React
  ↓
PDF Hook
  ↓
Generate PDF Use Case
  ↓
Session Repository
  ↓
Capture Repository
  ↓
Image Repository
  ↓
OCR Repository
  ↓
PDF Service
  ↓
PDF Builder
  ↓
pdf-lib
  ↓
PDF Blob
  ↓
Download Service
  ↓
Chrome Download Adapter
  ↓
Downloaded PDF
```

---

# 37. Delete Capture Architecture

```text
React
  ↓
DeleteCapture Use Case
  ↓
Capture Repository
  ↓
Find Capture
  ↓
Find Image/OCR
  ↓
Transaction
 ├── Delete OCR
 ├── Delete Image
 └── Delete Capture
  ↓
React State Update
```

The storage operation should leave no dependent records behind.

---

# 38. Session Deletion Architecture

```text
DeleteSession
      ↓
Find Captures
      ↓
Delete Capture Dependencies
      ↓
Delete Captures
      ↓
Delete Session
```

This operation should be implemented with appropriate IndexedDB transaction boundaries.

---

# 39. Error Boundaries

Errors should be converted at architectural boundaries.

Example:

```text
Tesseract Error
      ↓
OCR Adapter
      ↓
OCR Error
      ↓
Application
      ↓
React
```

Similarly:

```text
IndexedDB DOMException
      ↓
Repository
      ↓
Storage Error
      ↓
Application
      ↓
React
```

React should not need to understand infrastructure-specific exceptions.

---

# 40. Operation Lifecycle

A long-running operation should conceptually expose:

```text
IDLE
  ↓
STARTED
  ↓
PROCESSING
  ↓
COMPLETED
```

or:

```text
PROCESSING
  ↓
FAILED
```

This applies particularly to:

* OCR.
* PDF generation.
* Download.

---

# 41. Concurrency

The architecture should not assume every operation is synchronous.

Potential concurrent operations include:

```text
Capture A → OCR
Capture B → OCR
```

Each asynchronous operation needs a correlation identifier where communication is involved.

For v1, OCR processing is explicitly sequential (one OCR job at a time).

```text
Capture persisted immediately
  ↓
Placed on OCR queue
  ↓
Single OCR worker lane processes jobs in order
```

Capture creation never waits for OCR completion.

---

# 42. Temporary Data

Temporary objects should not automatically become persistent records.

Examples:

```text
PDF Blob
Object URLs
Temporary canvas
OCR progress
```

They exist only for the lifetime required by the operation.

For v1, OCR/PDF operations do not use an application-level hard timeout. Operations complete asynchronously with success/failure outcomes.

Persistent data:

```text
Session
Capture
Image Blob
OCR Result
```

---

# 43. No Phone Upload in LLD

The v1 LLD intentionally contains no:

```text
Phone Upload Service
QR Service
Backend Client
Polling Service
WebRTC Service
```

The architecture only leaves room for a future additional `CaptureSource`.

---

# 44. Module Dependency Summary

```text
React Components
       ↓
React Hooks
       ↓
Application Use Cases
       ↓
Domain / Repository / Service Interfaces
       ↑
       │
Infrastructure
├── IndexedDB
├── Chrome
├── Tesseract
└── pdf-lib
```

---

# 45. Important Design Rule

A module should not bypass the layer immediately below it to reach infrastructure.

Avoid:

```text
React
  ↓
IndexedDB
```

Avoid:

```text
PDF Service
  ↓
chrome.storage
```

Avoid:

```text
Capture Service
  ↓
Tesseract.createWorker()
```

Prefer:

```text
React
  ↓
Use Case
  ↓
Repository / Service
  ↓
Infrastructure
```

---

# 46. Final LLD

The resulting architecture is:

```text
                         ┌──────────────────┐
                         │    React UI      │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │   React Hooks    │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │Application Use   │
                         │      Cases       │
                         └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              Domain Layer  Repositories  Adapters
                    │             │             │
                    │             │             │
                    ▼             ▼             ▼
                 Invariants    IndexedDB     Chrome APIs
                                                │
                                                │
                                     ┌──────────┴─────────┐
                                     ▼                    ▼
                                Offscreen             Downloads
                                     │
                                     ▼
                                 Tesseract
```

---

# 47. Final Responsibilities

| Module             | Responsibility                       |
| ------------------ | ------------------------------------ |
| React Components   | UI                                   |
| React Hooks        | Connect UI to application            |
| Use Cases          | Application workflows                |
| Domain Services    | Business/data transformations        |
| Session Repository | Session persistence                  |
| Capture Repository | Capture persistence                  |
| Image Repository   | Image Blob persistence               |
| OCR Repository     | OCR persistence                      |
| Image Processor    | Image normalization                  |
| OCR Service        | OCR orchestration                    |
| OCR Adapter        | Tesseract communication              |
| PDF Service        | PDF workflow                         |
| PDF Builder        | PDF construction                     |
| Download Service   | Download workflow                    |
| Chrome Adapters    | Chrome API access                    |
| IndexedDB Layer    | Persistent storage                   |
| Message Bus        | Cross-context communication          |
| Service Worker     | Extension infrastructure coordinator |
| Offscreen Document | OCR execution environment            |

---

> **Core principle:** The new Snabby implementation separates UI, application logic, domain logic, and infrastructure. React handles presentation, use cases orchestrate behavior, repositories handle persistence, adapters isolate browser/external libraries, and the service worker coordinates Chrome-specific execution contexts. This gives us a clean architecture to implement incrementally without carrying the old project's unused or contradictory implementations forward.
