# 17 — Project Structure

## 1. Purpose

This document defines the proposed repository structure for the new Snabby implementation.

The structure follows the LLD and keeps:

* React/UI code separate from application logic.
* Domain models separate from infrastructure.
* IndexedDB isolated behind repositories.
* Chrome APIs isolated behind adapters.
* OCR and PDF libraries isolated from the application layer.

The structure is designed for **understandability and maintainability**, not for minimizing the number of files.

---

# 2. High-Level Structure

```text
snabby/
│
├── src/
│   ├── app/                    # React Root, CSS styles, and MessageBus provider composition
│   ├── features/               # React feature UI (session, capture, pdf)
│   ├── domain/                 # Core domain entities (Session, Capture, OCRResult, errors)
│   ├── application/            # Application use cases & interfaces (CaptureScreenshot, RunOCR, GeneratePDF)
│   ├── infrastructure/         # External infrastructure implementations (IndexedDB, Chrome, Tesseract, pdf-lib)
│   ├── main.tsx                # Content-script Shadow DOM mounting entry point
│   └── service-worker/         # Chrome Service Worker message & command router (index.ts)
│
├── tests/                      # Integration and unit test suite
├── manifest.json               # Chrome Extension Manifest V3 configuration
├── build.mjs                   # Custom Vite build bundler script (copies offline Tesseract assets)
├── package.json
└── tsconfig.json
```

The exact build configuration may differ depending on the chosen React/Chrome-extension setup.

---

# 3. `src/app/`

Responsible for application initialization and composition.

```text
src/app/
├── App.tsx
├── providers/
├── routes/
└── bootstrap/
```

### Responsibilities

* Initialize the React application.
* Register providers.
* Initialize application dependencies.
* Connect infrastructure implementations to application interfaces.

It should **not** contain business logic.

---

# 4. `src/components/`

Contains reusable UI components.

```text
src/components/
├── layout/
├── buttons/
├── modal/
├── loading/
├── error/
└── common/
```

Examples:

```text
Button
Modal
Toast
Spinner
IconButton
```

These components should be generic enough to be reused across Snabby features.

---

# 5. `src/features/`

Feature-specific React UI.

```text
src/features/
│
├── session/
│   ├── components/
│   │   ├── ActiveSessionView.tsx
│   │   ├── DecisionModal.tsx
│   │   └── NewSessionView.tsx
│   └── hooks/
│       └── useSession.ts
├── capture/
│   ├── components/
│   │   ├── CaptureCard.tsx
│   │   ├── FloatingMascot.tsx
│   │   ├── LightboxPreview.tsx
│   │   └── OCRTextOverlay.tsx
│   └── hooks/
│       └── useCaptures.ts
├── page-editor/
│   ├── components/
│   │   └── PageEditor.tsx
│   ├── types/
│   │   └── pageEditor.types.ts
│   ├── utils/
│   │   └── renderBoundedPageImage.ts
│   └── index.ts
└── pdf/
    └── hooks/
        └── usePdfExporter.ts
```

Each feature can contain:

```text
components/
hooks/
state/
```

For example:

```text
src/features/capture/
├── components/
│   ├── CaptureControls.tsx
│   ├── CaptureCard.tsx
│   └── CaptureList.tsx
│
├── hooks/
│   └── useCapture.ts
│
└── state/
```

The feature layer should consume application use cases rather than directly accessing infrastructure.

---

# 6. `src/domain/`

Contains the core concepts of Snabby.

```text
src/domain/
│
├── session/
│   ├── Session.ts
│   └── session.types.ts
│
├── capture/
│   ├── Capture.ts
│   └── capture.types.ts
│
├── image/
│   └── image.types.ts
│
├── ocr/
│   ├── OCRResult.ts
│   └── ocr.types.ts
│
└── common/
    ├── ids.ts
    ├── timestamps.ts
    └── errors.ts
```

The domain layer should not import:

```text
React
IndexedDB
Chrome APIs
Tesseract
pdf-lib
```

---

# 7. `src/application/`

Contains use cases and application-level orchestration.

```text
src/application/
│
├── session/
│   ├── CreateSession.ts
│   ├── GetSession.ts
│   ├── UpdateSession.ts
│   └── DeleteSession.ts
│
├── page/
│   ├── CreateScreenshotPage.ts
│   ├── GetPageEditorImage.ts
│   └── SavePageAnnotations.ts
│
├── capture/
│   ├── CaptureScreenshot.ts
│   ├── GetCaptures.ts
│   ├── DeleteCapture.ts
│   └── ReorderCaptures.ts
│
├── ocr/
│   ├── RunOCR.ts
│   └── GetOCRResult.ts
│
└── pdf/
    ├── GeneratePDF.ts
    └── DownloadPDF.ts
```

Each use case represents an application operation.

---

# 8. Application Interfaces

The application layer defines interfaces that infrastructure must implement.

Possible location:

```text
src/application/interfaces/
│
├── repositories/
│   ├── SessionRepository.ts
│   ├── CaptureRepository.ts
│   ├── ImageRepository.ts
│   └── OCRRepository.ts
│
├── adapters/
│   ├── CaptureAdapter.ts
│   ├── OCRAdapter.ts
│   └── DownloadAdapter.ts
│
└── messaging/
    └── MessageBus.ts
```

This enables dependency inversion.

Example:

```text
CaptureScreenshot
       ↓
CaptureAdapter
       ↑
ChromeCaptureAdapter
```

---

# 9. `src/infrastructure/`

Contains implementations that interact with external systems.

```text
src/infrastructure/
│
├── indexeddb/
├── chrome/
├── ocr/
├── pdf/
└── messaging/
```

This is where technology-specific code belongs.

---

# 10. `src/infrastructure/indexeddb/`

Responsible for all IndexedDB implementation details.

```text
src/infrastructure/indexeddb/
│
├── database/
│   ├── DatabaseManager.ts
│   ├── schema.ts
│   └── migrations/
│
├── repositories/
│   ├── IndexedDBSessionRepository.ts
│   ├── IndexedDBCaptureRepository.ts
│   ├── IndexedDBImageRepository.ts
│   └── IndexedDBOCRRepository.ts
│
└── mappers/
    ├── session.mapper.ts
    ├── capture.mapper.ts
    ├── image.mapper.ts
    └── ocr.mapper.ts
```

No other layer should need to know:

```text
objectStore()
createIndex()
transaction()
```

---

# 11. IndexedDB Database Manager

```text
src/infrastructure/indexeddb/database/
└── DatabaseManager.ts
```

Responsible for:

* Opening database.
* Creating object stores.
* Creating indexes.
* Handling version upgrades.
* Running migrations.

Conceptually:

```text
DatabaseManager
      ↓
IndexedDB
```

---

# 12. IndexedDB Repositories

Example:

```text
IndexedDBCaptureRepository
```

implements:

```text
CaptureRepository
```

Architecture:

```text
Application
     ↓
CaptureRepository
     ↑
IndexedDBCaptureRepository
     ↓
IndexedDB
```

This is one of the key SOLID boundaries.

---

# 13. `src/infrastructure/chrome/`

Chrome-specific functionality.

```text
src/infrastructure/chrome/
│
├── capture/
│   └── ChromeCaptureAdapter.ts
│
├── downloads/
│   └── ChromeDownloadAdapter.ts
│
├── tabs/
│   └── ChromeTabsAdapter.ts
│
└── runtime/
    └── ChromeRuntimeAdapter.ts
```

The exact adapters will depend on which Chrome APIs are actually required.

---

# 14. `src/infrastructure/ocr/`

OCR implementation.

```text
src/infrastructure/ocr/
│
├── TesseractOCRAdapter.ts
├── TesseractWorker.ts
└── offscreen/
```

The Tesseract-specific implementation stays here.

The application should only see:

```text
OCRAdapter
```

---

# 15. Offscreen OCR Context

The offscreen document is a separate runtime entry point.

Conceptually:

```text
src/infrastructure/ocr/
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.ts
```

Its responsibility is to provide the environment in which Tesseract executes.

```text
Service Worker
      ↓
Offscreen
      ↓
Tesseract
```

It should not contain session or UI logic.

---

# 16. `src/infrastructure/pdf/`

PDF infrastructure implementation directory.

```text
src/infrastructure/pdf/
│
├── PdfLibPDFService.ts   (implements PDFService interface using pdf-lib)
└── coordinate/
    └── CoordinateMapper.ts (handles image space to PDF space coordinate conversion)
```

`PdfLibPDFService.ts` handles PDF document creation, image embedding, dynamic page sizing (1:1 image aspect ratio + 10pt border), and selectable/invisible OCR text layer overlay. Obsolete placeholders (`PdfBuilder.ts` and `PdfExporter.ts`) have been completely removed.

`pdf-lib` must only be imported in this directory. The application layer interacts strictly through the `PDFService` interface.




---

# 17. `src/infrastructure/messaging/`

Cross-context communication.

```text
src/infrastructure/messaging/
├── MessageBus.ts
├── message.types.ts
├── message.validator.ts
└── ChromeMessageBus.ts
```

Responsibilities:

* Send messages.
* Receive messages.
* Validate messages.
* Correlate requests/responses.
* Handle communication errors.

---

# 18. Service Worker

The service worker is another runtime entry point.

Possible structure:

```text
src/service-worker/
├── index.ts
├── message-router.ts
└── bootstrap.ts
```

Its job is primarily:

```text
Chrome event
    ↓
Message Router
    ↓
Application Use Case
```

It should not become the location for all Snabby business logic.

---

# 19. Content Script / React Entry Point

Because the Snabby UI runs inside webpages, the React application needs a content-script entry point.

Conceptually:

```text
src/content/
├── index.tsx
└── mount.tsx
```

Responsibilities:

* Create Snabby's root element.
* Mount React.
* Provide required application dependencies.
* Connect UI to extension communication.

The actual React components remain in the feature/component folders.

---

# 20. Content-Script Integration

The architecture becomes:

```text
Web Page
   │
   ▼
Content Script Entry
   │
   ▼
React Application
   │
   ▼
Application Layer
```

The content script should be a **thin runtime bootstrap**, not a giant file containing the entire application.

---

# 21. `src/shared/`

Contains genuinely shared utilities.

```text
src/shared/
├── constants/
├── utils/
├── validation/
├── logging/
└── types/
```

Examples:

```text
ID generation
Filename sanitization
Date formatting
Common validation
Application-wide constants
```

Only things that are truly shared should go here.

Avoid turning `shared/` into a dumping ground.

---

# 22. Constants

Constants will eventually live under:

```text
src/shared/constants/
```

Possible categories:

```text
capture.constants.ts
ocr.constants.ts
storage.constants.ts
pdf.constants.ts
extension.constants.ts
```

The exact constants will be defined in the dedicated constants/contracts phase.

---

# 23. Types

Shared technical types can live under:

```text
src/shared/types/
```

However, domain-specific types should remain inside `domain/`.

For example:

```text
Session → domain/session
Capture → domain/capture
```

rather than putting everything into:

```text
shared/types/
```

---

# 24. Tests

Tests should mirror the source architecture.

```text
tests/
│
├── domain/
├── application/
├── infrastructure/
└── integration/
```

Example:

```text
tests/application/capture/
tests/infrastructure/indexeddb/
tests/infrastructure/ocr/
```

This makes it clear which layer is being tested.

---

# 25. Test Categories

### Unit Tests

For:

* Domain logic.
* Use cases.
* Image transformations.
* OCR normalization.
* Filename generation.

### Integration Tests

For:

* IndexedDB repositories.
* Message communication.
* OCR integration.
* PDF generation.

### End-to-End Tests

For important user flows:

```text
Start Session
     ↓
Capture
     ↓
OCR
     ↓
Generate PDF
     ↓
Download
```

The exact testing strategy will be defined after the first implementation.

---

# 26. Documentation

The repository should contain the architecture documents we've created.

Possible structure:

```text
docs/
│
├── 01_REQUIREMENTS.md
├── 02_OVERALL_SYSTEM_FLOW.md
├── 03_CAPTURE_FLOW.md
├── ...
├── 14_ARCHITECTURE_DECISIONS.md
├── 15_DATA_STORAGE_DESIGN.md
├── 16_LOW_LEVEL_DESIGN.md
└── 17_PROJECT_STRUCTURE.md
```

This is particularly useful for the project because the architecture and implementation decisions remain documented alongside the code.

---

# 27. Root Files

The root should contain the standard project configuration:

```text
snabby/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── manifest.json
├── README.md
└── .gitignore
```

Additional configuration files can be added when required by the build/test tooling.

---

# 28. Proposed Complete Structure

```text
snabby/
│
├── docs/
│   ├── 01_REQUIREMENTS.md
│   ├── 02_OVERALL_SYSTEM_FLOW.md
│   ├── 03_CAPTURE_FLOW.md
│   ├── 04_SESSION_MANAGEMENT_FLOW.md
│   ├── 05_IMAGE_PROCESSING_FLOW.md
│   ├── 06_OCR_FLOW.md
│   ├── 07_STORAGE_INDEXEDDB_FLOW.md
│   ├── 08_PDF_GENERATION_FLOW.md
│   ├── 09_DOWNLOAD_FLOW.md
│   ├── 10_EXTENSION_COMMUNICATION_FLOW.md
│   ├── 11_REACT_UI_FLOW.md
│   ├── 12_DATA_MODELS.md
│   ├── 13_FUNCTION_CONTRACTS.md
│   ├── 14_ARCHITECTURE_DECISIONS.md
│   ├── 15_DATA_STORAGE_DESIGN.md
│   ├── 16_LOW_LEVEL_DESIGN.md
│   └── 17_PROJECT_STRUCTURE.md
│
├── src/
│   │
│   ├── app/
│   │   ├── App.tsx
│   │   ├── providers/
│   │   └── bootstrap/
│   │
│   ├── content/
│   │   ├── index.tsx
│   │   └── mount.tsx
│   │
│   ├── service-worker/
│   │   ├── index.ts
│   │   ├── bootstrap.ts
│   │   └── message-router.ts
│   │
│   ├── components/
│   │   ├── layout/
│   │   ├── buttons/
│   │   ├── modal/
│   │   ├── loading/
│   │   ├── error/
│   │   └── common/
│   │
│   ├── features/
│   │   ├── session/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── state/
│   │   │
│   │   ├── capture/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── state/
│   │   │
│   │   ├── preview/
│   │   └── pdf/
│   │
│   ├── domain/
│   │   ├── session/
│   │   ├── capture/
│   │   ├── image/
│   │   ├── ocr/
│   │   └── common/
│   │
│   ├── application/
│   │   ├── session/
│   │   ├── capture/
│   │   ├── ocr/
│   │   ├── pdf/
│   │   │   ├── GeneratePDF.ts
│   │   │   └── DownloadPDF.ts
│   │   └── interfaces/
│   │       ├── repositories/
│   │       ├── services/
│   │       │   ├── CapturePersistenceService.ts
│   │       │   ├── ImageProcessor.ts
│   │       │   ├── OCRService.ts
│   │       │   ├── PDFService.ts
│   │       │   └── DownloadService.ts
│   │       ├── adapters/
│   │       └── messaging/
│   │           └── MessageBus.ts
│   │
│   ├── infrastructure/
│   │   ├── indexeddb/
│   │   │   ├── database/
│   │   │   │   ├── DatabaseManager.ts
│   │   │   │   ├── schema.ts
│   │   │   │   └── migrations/
│   │   │   ├── repositories/
│   │   │   └── mappers/
│   │   │
│   │   ├── chrome/
│   │   │   ├── capture/
│   │   │   ├── downloads/
│   │   │   │   └── ChromeDownloadAdapter.ts
│   │   │   ├── tabs/
│   │   │   └── runtime/
│   │   │
│   │   ├── ocr/
│   │   │   ├── TesseractOCRAdapter.ts
│   │   │   ├── TesseractWorker.ts
│   │   │   └── offscreen/
│   │   │       ├── offscreen.html
│   │   │       └── offscreen.ts
│   │   │
│   │   ├── pdf/
│   │   │   ├── PdfLibPDFService.ts
│   │   │   └── coordinate/
│   │   │       └── CoordinateMapper.ts
│   │   │
│   │   └── messaging/
│   │       ├── MessageBus.ts (re-export)
│   │       ├── MessageTypes.ts
│   │       ├── MessageValidator.ts
│   │       └── ChromeMessageBus.ts
│   │
│   └── shared/
│       ├── constants/
│       ├── utils/
│       ├── validation/
│       ├── logging/
│       └── types/
│
├── tests/
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   └── integration/
│
├── public/
│
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
└── .gitignore
```

---

# 29. Dependency Rules

The most important project-structure rule is:

```text
features
   ↓
application
   ↓
domain
```

and:

```text
infrastructure
   ↓ implements interfaces
application
```

The following should **not** happen:

```text
❌ React → IndexedDB
❌ React → Tesseract
❌ React → pdf-lib
❌ Domain → Chrome API
❌ Domain → IndexedDB
❌ Application → chrome.storage.local
```

---

# 30. Feature vs Infrastructure

A useful distinction:

### Feature

Answers:

> "What does the user do?"

Examples:

```text
session
capture
preview
pdf
```

### Infrastructure

Answers:

> "How does the computer actually do it?"

Examples:

```text
IndexedDB
Chrome APIs
Tesseract
pdf-lib
runtime messaging
```

This distinction should remain clear throughout development.

---

# 31. Avoid Overengineering

The proposed structure is intentionally modular, but we should not create abstractions just for the sake of having abstractions.

For example, we don't need:

```text
IAbstractImageProcessingFactoryProvider
```

if there is only one image-processing implementation and no meaningful reason for such an abstraction.

SOLID means **clear responsibilities and appropriate boundaries**, not maximum number of interfaces.

---

# 32. Future Phone Upload

When phone upload is eventually added, it should fit into the existing architecture rather than forcing a redesign.

Conceptually:

```text
CaptureSource
├── ChromeScreenCapture
├── CropCapture
└── PhoneCapture     ← future
```

The session/capture domain should remain unchanged.

The phone-specific infrastructure would be added later.

---

# 33. Final Structure Principle

The repository should make it possible to answer these questions simply:

> **Where is the UI?**

```text
features/ + components/
```

> **Where is business/application logic?**

```text
application/ + domain/
```

> **Where is IndexedDB?**

```text
infrastructure/indexeddb/
```

> **Where is Chrome-specific code?**

```text
infrastructure/chrome/
```

> **Where is OCR?**

```text
infrastructure/ocr/
```

> **Where is PDF generation?**

```text
infrastructure/pdf/
```

> **Where is extension messaging?**

```text
infrastructure/messaging/
```

> **Where does the service worker start?**

```text
service-worker/index.ts
```

This is the main goal of the structure.

---

# 34. Pre-Coding Architecture

At this point the planned architecture is:

```text
                       SNABBY
                          │
          ┌───────────────┴────────────────┐
          │                                │
       React UI                     Extension Runtime
          │                                │
          ▼                                ▼
       Features                     Service Worker
          │                                │
          ▼                                ▼
     Application ──────────────── Message Bus
          │                                │
          ▼                                ▼
       Domain                         Offscreen
          │                                │
          ▼                                ▼
     Interfaces                       Tesseract
          ▲
          │
    Infrastructure
    ├── IndexedDB
    ├── Chrome APIs
    ├── OCR
    └── PDF
```

---

> **Core principle:** The folder structure mirrors the architecture. A developer should be able to locate code by responsibility without needing to understand the entire project first. UI, application logic, domain logic, and technology-specific infrastructure remain separated, while the structure stays simple enough to understand and maintain.
