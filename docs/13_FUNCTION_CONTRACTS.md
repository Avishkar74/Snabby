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

This is a lower-level persistence/application operation.

### Input

```text
CreateCaptureInput
├── sessionId
├── imageId
├── order
├── source
└── metadata
```

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

## 15.1 Generate PDF

### Input

```text
GeneratePDFInput
├── sessionId
└── skipPendingOcr
```

The PDF generator can retrieve everything else through repositories.

```text
skipPendingOcr = false
   Wait for/run pending OCR before finalizing.

skipPendingOcr = true
   Generate immediately and omit only OCR that is not ready.
   Completed OCR is still included.
```

### Output

```text
PDFBlob
```

### Flow

```text
sessionId
    ↓
Load Session
    ↓
Load Ordered Captures
    ↓
Load Images
    ↓
Load OCR Results
    ↓
Create PDF
    ↓
Return Blob
```

---

# 16. Download PDF

### Input

```text
DownloadPDFInput
├── pdfBlob
└── filename
```

### Output

```text
DownloadResult
```

Potentially:

```text
DownloadResult
├── success
└── downloadId
```

The exact result depends on how much Chrome download state we expose.

---

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

# 28. Main Public Use Cases

The core Snabby application API should conceptually expose:

```text
Session
├── createSession
├── getSession
├── updateSession
└── deleteSession

Capture
├── capture
├── getCaptures
├── deleteCapture
└── reorderCaptures

OCR
├── runOCR
└── getOCRResult

PDF
├── generatePDF
└── downloadPDF
```

This is the first-level contract we will design the LLD around.

---

# 29. Function Dependency Graph

```text
                     React
                       │
              ┌────────┼─────────┐
              ▼        ▼         ▼
           Session   Capture     PDF
           Use Case  Use Case   Use Case
              │        │         │
              │        │         ├── Image Repository
              │        │         ├── OCR Repository
              │        │         └── PDF Builder
              │        │
              │        ├── Capture Adapter
              │        ├── Image Processor
              │        └── OCR Service
              │
              ▼
         Session Repository
              │
              ▼
           IndexedDB
```

---

# 30. What Is Not Final Yet

These contracts deliberately do **not** freeze:

* Exact TypeScript types.
* Exact parameter names.
* Exact return DTOs.
* Exact error classes.
* Exact repository interfaces.
* Exact Chrome adapter APIs.
* Exact Tesseract adapter API.
* Exact PDF library interface.

Those belong in the LLD and external-contract documents.

---

# 31. Critical Reference Check Before LLD

There is one important thing I **don't want to guess** from the old project:

The exact existing implementation contracts for:

```text
Capture metadata
Image processing output
OCR result structure
Tesseract communication
PDF generator inputs
Current chrome.storage.local structure
```

Since you said you can provide the current implementation whenever needed, **before we freeze the final schemas and LLD, we should inspect those files**.

That is especially important because we're rebuilding the project while preserving the existing behavior.

So the next document, `14_CONSTANTS_AND_CONFIGURATION.md`, can be drafted from the architecture we already established, but **before `15_EXTERNAL_CONTRACTS.md` and `16_LLD.md`, I recommend you provide the relevant current implementation files so we can replace these conceptual contracts with the actual behavior of Snabby.**
