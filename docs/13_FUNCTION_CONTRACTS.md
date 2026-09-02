# 13 — Function Contracts

## 1. Purpose

This document defines the **main application functions/use cases** Snabby needs and what each function accepts and returns.

The goal is not to write implementation code yet.

We want to establish:

```text
Function
   ↓
Input
   ↓
Processing responsibility
   ↓
Output
   ↓
Possible failure
```

Exact TypeScript interfaces will be created later during the LLD phase.

---

# 2. Function Layering

Functions should be organized by responsibility:

```text
UI
 ↓
Application Use Cases
 ↓
Domain / Repository / Service Interfaces
 ↓
Browser / IndexedDB / Libraries
```

A React component should generally call a **use case**, rather than directly calling infrastructure.

---

# 3. Session Functions

## 3.1 Create Session

### Purpose

Create and persist a new Snabby session.

### Input

```text
CreateSessionInput
├── name
```

### Output

```text
Session
```

### Flow

```text
Create Session
     ↓
Validate name
     ↓
Generate Session ID
     ↓
Create timestamps
     ↓
Persist Session
     ↓
Return Session
```

### Possible failures

```text
InvalidSessionName
StorageError
```

---

## 3.2 Get Session

### Input

```text
sessionId
```

### Output

```text
Session | null
```

Used when restoring an existing session.

---

## 3.3 Delete Session

### Input

```text
sessionId
```

### Output

```text
void
```

The operation must also handle dependent captures, images, and OCR data.

```text
Delete Session
      ↓
Delete Captures
      ↓
Delete Images / OCR
      ↓
Delete Session
```

---

## 3.4 Update Session

### Input

```text
sessionId
+
UpdateSessionInput
```

Possible updates include:

```text
name
updatedAt
```

### Output

```text
Session
```

---

# 4. Capture Functions

## 4.1 Capture Screenshot

This is the main capture use case.

### Input

```text
CaptureInput
├── sessionId
└── captureMode
```

Where:

```text
captureMode =
    FULL_SCREEN
    | CROP_REGION
```

### Output

Conceptually:

```text
CaptureResult
├── capture
├── image
└── processing information
```

### Flow

```text
Capture Request
      ↓
Chrome Capture
      ↓
Screenshot
      ↓
Image Processing
      ↓
Persist Image + Capture
      ↓
Start OCR
      ↓
Return capture state
```

The exact asynchronous behavior will be finalized in the LLD.

---

# 5. Create Capture Record

This is an atomic application/infrastructure operation orchestrated by `CapturePersistenceService`:

```typescript
export interface CapturePersistenceService {
  save(capture: Capture, image: ImageAsset): Promise<void>;
}
```

Which opens a single readwrite transaction over both `captures` and `images` stores to commit both records atomically.

### Output

```text
Capture
```

This function should not itself perform screenshot capture.

---

# 6. Get Captures

### Input

```text
sessionId
```

### Output

```text
Capture[]
```

Requirements:

* Only captures belonging to the session are returned.
* Captures are returned in persisted order.

```text
getCaptures(sessionId)
        ↓
[A, C, B, D]
```

not arbitrary IndexedDB order.

---

# 7. Delete Capture

### Input

```text
captureId
```

### Output

```text
void
```

The operation should clean up:

```text
Capture
ImageAsset
OCRResult
```

and update session ordering if necessary.

---

# 8. Reorder Captures

### Input

```text
sessionId
orderedCaptureIds[]
```

Example:

```text
Before:

[A, B, C, D]

After:

[D, A, C, B]
```

### Output

```text
Capture[]
```

The ordering becomes persistent.

---

# 9. Image Processing Functions

## 9.1 Process Image

### Input

```text
ImageProcessingInput
├── image
└── processing options
```

### Output

```text
ProcessedImage
├── data
├── width
├── height
└── mimeType
```

Responsibilities may include:

```text
Decode
 ↓
Normalize
 ↓
Resize / transform if required
 ↓
Encode
 ↓
Return processed image
```

The exact processing steps come from the existing implementation and will be finalized before coding.

---

# 10. OCR Functions

## 10.1 Start OCR

### Input

```text
OCRInput
├── captureId
└── image
```

### Output

```text
OCRResult
```

The function is asynchronous.

```text
startOCR()
      ↓
Offscreen Document
      ↓
Tesseract
      ↓
OCR Result
```

---

# 11. OCR Status Check

The UI needs a download-decision check, not OCR percentage streaming.

### Input

```text
CheckOCRStatusInput
├── sessionId
```

### Output

```text
CheckOCRStatusResult
├── pendingCount
└── totalCount
```

This supports the Wait vs Download Now decision before EXPORT_PDF.

---

# 12. Save OCR Result

### Input

```text
OCRResult
```

### Output

```text
void
```

The result is persisted through the OCR repository.

---

# 13. Get OCR Result

### Input

```text
captureId
```

### Output

```text
OCRResult | null
```

Used by:

* UI where required.
* PDF generation.
* Future search/copy functionality.

---

# 14. OCR Result Normalization

Tesseract's raw result should not become the application's permanent data contract.

Conceptually:

```text
Tesseract Result
       ↓
OCR Normalizer
       ↓
Snabby OCRResult
```

### Input

```text
TesseractResult
```

### Output

```text
OCRResult
```

This creates a boundary between the external OCR library and Snabby's internal model.

---

# 15. PDF Functions

## 15.1 Generate PDF Usecase

### Component Location
- planned for Stage 5B: `src/application/pdf/GeneratePDF.ts`

### Input
```typescript
interface GeneratePDFInput {
  sessionId: string;
  skipPendingOcr: boolean;
}
```

### Output
```typescript
type PDFBlob = Blob;
```

### Exceptions
- `SessionNotFoundError`: Session does not exist in DB.
- `NoCapturesError`: Session has no captures.
- `PDFGenerationError`: Internal failure during page creation, scaling, or document finalization (wraps any database or pdf-lib exceptions).

### Orchestration Flow
1. Load `Session` from `SessionRepository`.
2. Load all `Capture`s from `CaptureRepository` using `sessionId` (re-sort using `order` property).
3. If `skipPendingOcr = false`, check for any captures in `PENDING` or `PROCESSING` state and poll the database until they transition to `COMPLETED` or `FAILED`.
4. Call `PDFService.generate(session, captures)` to compile the document bytes.
5. Return the resulting `Blob`.

---

## 15.2 PDFService Interface

### Component Location
- already implemented: `src/application/interfaces/services/PDFService.ts`

### Interface Contract
```typescript
export interface PDFService {
  generate(session: Session, captures: Capture[]): Promise<Blob>;
}
```

---

# 16. Download PDF Usecase

## 16.1 Download PDF

### Component Location
- planned for Stage 5B: `src/application/pdf/DownloadPDF.ts`

### Input
```typescript
interface DownloadPDFInput {
  pdfBlob: Blob;
  filename: string;
}
```

### Output
```typescript
type DownloadResult = void;
```

### Exceptions
- `DownloadFailedError`: Triggers when Chrome Downloads API rejects the file write or download fails.

### Orchestration Flow
1. Delegate to `DownloadService.download(pdfBlob, filename)`.

---

## 16.2 DownloadService Interface

### Component Location
- planned for Stage 5B: `src/application/interfaces/services/DownloadService.ts`

### Interface Contract
```typescript
export interface DownloadService {
  download(pdfBlob: Blob, filename: string): Promise<void>;
}
```


# 17. Generate Filename

### Input

```text
FilenameInput
├── sessionName
└── optional timestamp
```

### Output

```text
string
```

Example:

```text
Snabby_My_Notes.pdf
```

This function should also sanitize invalid filename characters.

---

# 18. Storage Functions

Repositories will expose persistence operations.

### Session Repository

```text
create()
getById()
update()
delete()
```

### Capture Repository

```text
create()
getById()
getBySessionId()
update()
delete()
```

### Image Repository

```text
save()
getById()
delete()
```

### OCR Repository

```text
save()
getByCaptureId()
update()
delete()
```

These are **repository contracts**, not necessarily the public application API.

---

# 19. Browser Adapter Functions

Chrome APIs should also be hidden behind adapters.

Conceptually:

### Capture Adapter

The application-facing capture adapter contract is conceptually defined as:

```typescript
export interface CaptureAdapter {
  capture(source: CaptureSource): Promise<Blob>;
}
```

Note: `chrome.tabs.captureVisibleTab()` is an infrastructure-specific implementation detail, not the application contract.

### Download Adapter

```text
download()
```

### Offscreen Adapter

```text
ensureOffscreenDocument()
sendOCRRequest()
```

The exact methods depend on the existing implementation.

---

# 20. Message Functions

The extension communication layer needs functions such as:

```text
sendMessage()
handleMessage()
validateMessage()
createRequest()
resolveRequest()
rejectRequest()
```

These are infrastructure-level functions.

They should not contain OCR/PDF business logic.

The authoritative v1 command/event catalog is defined in:

```text
18_command.message_catalog.schemas.md
```

No OCR progress message is required in the React-facing v1 contract.

---

# 21. React-facing Functions

React should interact mainly with application-level operations.

Conceptually:

```text
useSession()
├── createSession()
├── loadSession()
└── deleteSession()

useCapture()
├── capture()
├── deleteCapture()
└── reorderCaptures()

usePDF()
└── downloadPDF()
```

These hooks are not finalized yet.

---

# 22. Function Dependency Example

### Capture

```text
capture()
   ↓
Capture Service
   ↓
Chrome Capture Adapter
   ↓
Image Processor
   ↓
Capture Repository
   ↓
OCR Service
```

### PDF

```text
downloadPDF()
   ↓
Generate PDF
   ↓
Session Repository
   ↓
Capture Repository
   ↓
Image Repository
   ↓
OCR Repository
   ↓
PDF Builder
   ↓
Download Service
```

---

# 23. Input Validation

Validation should happen at the appropriate boundary.

For example:

```text
createSession()
    ↓
Validate name
```

```text
reorderCaptures()
    ↓
Validate sessionId
Validate capture IDs
Validate ordering
```

```text
generatePDF()
    ↓
Validate session
Validate captures
Validate images
```

Infrastructure-level validation should additionally validate external data.

---

# 24. Error Contract

Functions should return either:

```text
Success
```

or:

```text
Known Application Error
```

rather than exposing arbitrary library exceptions.

Conceptually:

```text
try operation
      │
      ├── success → Result
      │
      └── failure → ApplicationError
```

For example:

```text
Tesseract Error
      ↓
OCR_ENGINE_ERROR
```

```text
IndexedDB Error
      ↓
STORAGE_ERROR
```

The application and domain error classes are categorized as:
- Domain Errors (extending `DomainError`): `ValidationError`, `SessionNotFoundError`
- Persistence/Infrastructure Errors (extending `DomainError`): `DatabaseError`
- Application Capture Errors (extending native `Error`): `CaptureError`

---

# 25. Async Functions

Most major operations are asynchronous:

```text
createSession()
capture()
processImage()
runOCR()
generatePDF()
downloadPDF()
```

Therefore, the contracts should use asynchronous results conceptually:

```text
Promise<Result>
```

rather than synchronous returns.

---

# 26. Function Naming Principles

Functions should describe **what the application wants to accomplish**, not implementation details.

Prefer:

```text
generatePdf()
saveCapture()
getSession()
runOcr()
```

over:

```text
indexedDbPutCapture()
tesseractRecognize()
chromeDownloadBlob()
```

The latter belong inside infrastructure implementations.

---

# 27. Function Responsibility Rule

Each function should have one clear responsibility.

Avoid:

```text
captureAndProcessAndSaveAndRunOCRAndGeneratePDF()
```

Instead:

```text
capture()
processImage()
saveCapture()
runOCR()
generatePDF()
downloadPDF()
```

A use case can **orchestrate** these operations, but individual services remain focused.

---

# 28. Main Public Use Cases & Implementation Paths

The finalized Snabby application layer exposes concrete use cases organized by domain:

| Domain | File Path | Method Signature | Boundary / Dependencies |
| :--- | :--- | :--- | :--- |
| **Session** | `src/application/session/CreateSession.ts` | `execute(name?: string): Promise<Session>` | `SessionRepository` |
| **Session** | `src/application/session/GetSession.ts` | `execute(id: SessionId): Promise<Session \| null>` | `SessionRepository` |
| **Session** | `src/application/session/UpdateSession.ts` | `execute(input: UpdateSessionInput): Promise<Session>` | `SessionRepository` |
| **Session** | `src/application/session/DeleteSession.ts` | `execute(id: SessionId): Promise<void>` | `SessionRepository` |
| **Page (editor)** | `src/application/page/GetPageEditorImage.ts` | `execute(pageId: PageId): Promise<PageEditorImageData \| null>` | `PageRepository`, `ImageRepository` |
| **Page (editor)** | `src/application/page/SavePageAnnotations.ts` | `execute(pageId: PageId, annotationData: string \| null, renderedImageData?: string \| null): Promise<boolean>` | `PageRepository`, `ImageRepository` |
| **Page (active)** | `src/application/page/CreateScreenshotPage.ts` | `execute(input: CreateScreenshotPageInput): Promise<CreateScreenshotPageResult>` | `CaptureAdapter`, `ImageProcessor`, `PagePersistenceService`, `PageRepository`, `RunOCR` |
| **Capture (legacy, inactive)** | `src/application/capture/CaptureScreenshot.ts` | `execute(input: CaptureScreenshotInput): Promise<CaptureScreenshotOutput>` | `CaptureAdapter`, `ImageProcessor`, `CapturePersistenceService`, `CaptureRepository`, `RunOCR` |
| **OCR** | `src/application/ocr/RunOCR.ts` | `execute(input: RunOCRInput): Promise<OCRResult>` | `OCRService`, `OCRRepository`, `PageRepository` |
| **OCR** | `src/application/ocr/GetOCRResult.ts` | `execute(captureId: CaptureId): Promise<OCRResult \| null>` | `OCRRepository` |
| **PDF** | `src/application/pdf/GeneratePDF.ts` | `execute(input: GeneratePDFInput): Promise<Blob>` | `SessionRepository`, `CaptureRepository`, `OCRRepository`, `PDFService` |
| **PDF** | `src/application/pdf/DownloadPDF.ts` | `execute(input: DownloadPDFInput): Promise<void>` | `DownloadService` |

---

# 29. Function Dependency Graph

```text
                     React Presentation
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
         Session          Capture            PDF
        Use Cases        Use Case         Use Cases
            │                │                │
            │                │                ├── ImageRepository
            │                │                ├── OCRRepository
            │                │                └── PDFService (`PdfLibPDFService`)
            │                │
            │                ├── CaptureAdapter (`ChromeCaptureAdapter`)
            │                ├── ImageProcessor (`BrowserImageProcessor`)
            │                ├── PersistenceService (`IndexedDBCapturePersistenceService`)
            │                └── RunOCR (`TesseractOCRAdapter`)
            │
            ▼
     SessionRepository (`IndexedDBSessionRepository`)
            │
            ▼
     IndexedDB (`snabby-db`)
```

---

# 30. Implementation Status

All public application use cases, domain entities, and infrastructure adapters are implemented and verified with end-to-end unit test coverage across stages 1–5 and React presentation layer.

