# Snabby v1 — OCR Flow

## 1. Purpose

This document defines how Snabby extracts text from captured screenshots and converts the OCR output into a stable internal representation that can be stored, displayed, and later used for searchable PDF generation.

OCR is one of the most important processing pipelines in Snabby.

The high-level flow is:

```text
Captured Image
      ↓
Image Processing
      ↓
OCR-ready Image
      ↓
OCR Service
      ↓
Offscreen Document
      ↓
Tesseract.js
      ↓
Tesseract Worker
      ↓
Text Recognition
      ↓
Raw Tesseract Result
      ↓
Result Normalization
      ↓
Snabby OCR Result
      ↓
IndexedDB
```

The OCR subsystem is responsible for **recognizing text and its position**.

It is not responsible for:

* Capturing screenshots.
* General image normalization.
* Session management.
* IndexedDB implementation.
* PDF generation.
* Browser downloading.
* React rendering.

---

# 2. Why Snabby Needs OCR

A screenshot normally contains only pixels.

For example:

```text
┌───────────────────────────────┐
│                               │
│   Student Name: Avishkar      │
│   Roll No: 42                 │
│   Subject: Computer Science   │
│                               │
└───────────────────────────────┘
```

Without OCR, the PDF only knows about the image.

With OCR, Snabby can additionally understand:

```text
Student Name: Avishkar
Roll No: 42
Subject: Computer Science
```

This allows the generated PDF to contain an OCR text layer.

The important distinction is:

```text
Screenshot
   ↓
Visual content

OCR
   ↓
Machine-readable text + positions
```

Snabby therefore retains both.

---

# 3. OCR Responsibilities

The OCR subsystem is responsible for:

1. Receiving an OCR-ready image.
2. Creating an OCR request.
3. Executing OCR in the appropriate browser context.
4. Running Tesseract.js.
5. Receiving recognition results.
6. Extracting recognized text.
7. Extracting word-level information.
8. Extracting confidence values.
9. Extracting bounding boxes.
10. Normalizing raw Tesseract output.
11. Returning a stable Snabby OCR result.
12. Persisting the OCR result through the application/storage layer.
13. Reporting OCR completion/failure state changes.
14. Handling OCR failures.
15. Supporting retry where appropriate.

It should not be responsible for deciding how the resulting PDF is constructed.

---

# 4. OCR Position in the Snabby Pipeline

The complete relationship is:

```text
AcquiredScreenshot
   ↓
Image Processing
   ↓
Persist Image + Capture
   ↓
OCR
   ↓
Persist OCR Result
   ↓
React UI
   ↓
PDF Generation
```

OCR therefore sits between image preparation and document generation.

---

# 5. High-Level OCR Flow

```text
┌──────────────────────────────┐
│       OCR-ready Image        │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│         OCR Request          │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│          OCR Service         │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│        Service Worker        │
└──────────────┬───────────────┘
               │
               │ message
               ▼
┌──────────────────────────────┐
│       Offscreen Document      │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│          Tesseract.js         │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│        Tesseract Worker       │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│       OCR Recognition         │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│      Raw OCR Result           │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│      Result Normalization      │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│       Snabby OCR Result       │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│           IndexedDB           │
└──────────────────────────────┘
```

---

# 6. OCR Input

The OCR subsystem receives an image that has already passed through the image-processing pipeline.

Conceptually:

```text
ProcessedImage
│
├── image data
├── width
└── height
```

The image should already have:

* Valid image data.
* Valid dimensions.
* Correct orientation.
* A stable coordinate system.

OCR should not have to perform these responsibilities again.

---

# 7. OCR Request

The application creates an OCR request for a specific capture.

Conceptually:

```text
OCRRequest
│
├── captureId
├── image
├── image dimensions
└── OCR configuration
```

The exact schema will be defined later.

The important point is that the OCR operation is associated with a specific capture.

This allows the result to be stored against the correct capture.

---

# 8. OCR Service Boundary

The rest of the application should interact with OCR through a high-level capability.

Conceptually:

```text
Application
     │
     ▼
OCR Service
     │
     ▼
OCR Adapter
     │
     ▼
Tesseract / Offscreen Infrastructure
```

The application should not directly call:

```text
Tesseract.recognize(...)
```

from arbitrary application code.

This keeps Tesseract-specific details isolated.

---

# 9. Why Tesseract Is an Infrastructure Detail

Snabby currently uses Tesseract.js.

However, the application's conceptual requirement is:

> Extract text and positional information from an image.

It should not be:

> Call Tesseract.js directly everywhere.

Therefore:

```text
Snabby Application
       ↓
OCR Interface
       ↓
Tesseract Implementation
```

If the OCR engine changes in the future, the application-level OCR contract should remain stable.

---

# 10. Chrome Execution Contexts

The existing Snabby implementation uses multiple Chrome extension contexts.

The important OCR-related contexts are:

```text
Service Worker
       │
       ▼
Offscreen Document
       │
       ▼
Tesseract.js
       │
       ▼
Tesseract Worker
```

The reason for this architecture is that the service worker is not a normal DOM page.

Tesseract.js and related image-processing functionality may require capabilities that are more naturally available inside a document/offscreen environment.

The offscreen document therefore acts as the execution environment for OCR.

---

# 11. Service Worker Responsibility

The service worker should coordinate OCR rather than implement OCR itself.

Conceptually:

```text
Service Worker
│
├── Receive OCR request
├── Ensure OCR environment exists
├── Send OCR message
├── Wait for response
├── Handle timeout/error
└── Return normalized result
```

It should not contain the Tesseract recognition algorithm.

---

# 12. Offscreen Document Responsibility

The offscreen document acts as the OCR execution host.

Conceptually:

```text
Offscreen Document
│
├── Receive OCR request
├── Prepare Tesseract
├── Execute recognition
├── Receive progress
├── Return result
└── Report errors
```

The offscreen document is an infrastructure component.

The rest of the application should not depend directly on DOM-specific details of the offscreen page.

---

# 13. Tesseract.js

Tesseract.js provides the OCR engine used by Snabby.

Conceptually:

```text
OCR Request
     ↓
Tesseract.js
     ↓
Tesseract Worker
     ↓
Text Recognition
```

Tesseract performs the actual recognition work.

Snabby is responsible for:

* Preparing the input.
* Managing the OCR execution environment.
* Normalizing the result.
* Persisting the result.
* Using the result downstream.

---

# 14. Tesseract Worker

Tesseract.js uses a worker-based architecture for OCR processing.

Conceptually:

```text
Offscreen Document
      │
      ▼
Tesseract.js API
      │
      ▼
Tesseract Worker
      │
      ▼
OCR Engine
      │
      ▼
Recognition Result
```

This prevents the heavy recognition work from being performed directly in the UI thread.

The exact worker-loading and asset-loading implementation will be handled by the OCR infrastructure implementation.

---

# 15. OCR Worker Lifecycle

The OCR worker lifecycle should be treated as a managed resource.

Conceptually:

```text
OCR Request
    │
    ▼
Initialize / Reuse Worker
    │
    ▼
Load Language / Configuration
    │
    ▼
Recognize
    │
    ▼
Result
    │
    ▼
Reuse / Cleanup
```

The final lifecycle strategy needs to balance:

* OCR startup cost.
* Memory usage.
* Multiple OCR requests.
* Extension lifecycle.
* Reliability.

We will determine whether the worker is reused between requests or recreated during the LLD.

---

# 16. OCR Language

OCR requires a language configuration.

The language configuration must be explicit rather than scattered through the code.

Conceptually:

```text
OCR Configuration
│
└── language
```

For v1, the supported OCR language(s) will be determined from the existing implementation and product requirements.

Language configuration belongs to OCR configuration, not to the capture/session domain.

---

# 17. OCR Recognition

Once Tesseract receives the normalized image:

```text
OCR-ready Image
      │
      ▼
Tesseract
      │
      ▼
Recognition
      │
      ▼
Raw OCR Result
```

Recognition may produce:

* Full text.
* Blocks.
* Paragraphs.
* Lines.
* Words.
* Confidence.
* Coordinates.

Snabby's internal model does not need to preserve every raw Tesseract structure.

It should retain the information required by Snabby's product behavior.

---

# 18. Full Text

The OCR result should contain the complete recognized text.

Conceptually:

```text
OCRResult
│
└── fullText
```

Example:

```text
"Student Name: Avishkar
Roll No: 42
Subject: Computer Science"
```

This provides a simple representation for:

* Search.
* Display.
* Debugging.
* Future features.

---

# 19. Word-Level OCR Data

The existing Snabby OCR implementation works with word-level information.

This should be preserved in v1.

Conceptually:

```text
OCRResult
│
└── words
     │
     ├── Word 1
     ├── Word 2
     ├── Word 3
     └── ...
```

Each word should contain enough information to locate it in the original image.

---

# 20. OCR Word

Conceptually:

```text
OCRWord
│
├── text
├── confidence
└── boundingBox
```

Example:

```text
{
    text: "Snabby",
    confidence: 96.4,
    boundingBox: {
        x: 120,
        y: 80,
        width: 110,
        height: 32
    }
}
```

This is a conceptual example only.

The exact schema will be defined in the data-model phase.

---

# 21. Bounding Boxes

Bounding boxes describe where recognized text exists within the image.

Conceptually:

```text
Image
┌─────────────────────────────────────┐
│                                     │
│      ┌─────────────────┐            │
│      │     Snabby      │            │
│      └─────────────────┘            │
│                                     │
└─────────────────────────────────────┘
       ↑
       Bounding Box
```

The box can be represented as:

```text
x
y
width
height
```

or another equivalent coordinate representation.

The final schema will be standardized later.

---

# 22. Coordinate System

OCR coordinates refer to the **normalized image** produced by the image-processing subsystem.

This establishes an important invariant:

```text
Image dimensions
       │
       ▼
OCR coordinates
       │
       ▼
PDF coordinates
```

The OCR system must not rotate or resize the image after generating coordinates.

If it did:

```text
Image transformed
       ↓
OCR coordinates no longer match
```

Therefore:

> All coordinate-affecting image normalization must happen before OCR recognition.

---

# 23. OCR Confidence

Tesseract provides confidence information for recognized text.

Snabby should preserve useful confidence information.

Conceptually:

```text
Word
│
├── text
└── confidence
```

Confidence may be useful for:

* Debugging.
* Future OCR quality features.
* Filtering uncertain words.
* Evaluating OCR quality.

The v1 PDF generation pipeline may or may not use confidence values directly.

The OCR model should preserve them if available and useful.

---

# 24. Result Normalization

Raw Tesseract output should not become the application's internal data model directly.

The flow is:

```text
Raw Tesseract Result
        │
        ▼
OCR Result Mapper
        │
        ▼
Snabby OCR Result
```

The mapper is responsible for:

* Selecting required fields.
* Normalizing coordinates.
* Normalizing text.
* Converting confidence values.
* Removing unnecessary Tesseract-specific structures.
* Producing a stable internal representation.

---

# 25. Why Result Normalization Matters

Without normalization, the rest of Snabby becomes coupled to Tesseract.

For example:

```text
PDF Generator
      ↓
Tesseract-specific result structure
```

would mean the PDF generator knows how Tesseract works.

Instead:

```text
Tesseract
   ↓
Adapter
   ↓
Snabby OCR Result
   ↓
PDF Generator
```

The PDF generator only understands Snabby's OCR model.

---

# 26. Internal OCR Model

The internal OCR representation should conceptually look like:

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

The exact fields will be finalized later.

The important property is that the model is:

* Stable.
* Engine-independent.
* Coordinate-aware.
* Serializable.
* Persistable.

---

# 27. OCR Result and Capture Relationship

An OCR result belongs to a specific capture.

Conceptually:

```text
Capture
│
├── Image
│
└── OCR Result
```

or:

```text
Capture ID
     │
     ├── Image Asset
     └── OCR Result
```

The exact IndexedDB relationship will be determined in the storage schema.

The key requirement is that OCR data must never become detached from the capture it describes.

---

# 28. OCR Persistence

After normalization:

```text
Snabby OCR Result
       │
       ▼
OCR Repository
       │
       ▼
IndexedDB
```

The OCR service should not directly manage IndexedDB.

The application/storage architecture should remain:

```text
OCR Use Case
     ↓
OCR Repository Interface
     ↓
IndexedDB Repository
```

This separates OCR logic from persistence.

---

# 29. Why OCR Should Be Persisted

OCR can be computationally expensive.

If the user has already processed an image:

```text
Screenshot
   ↓
OCR
   ↓
Result
```

there is no reason to repeat OCR every time the UI opens or the PDF is generated.

Instead:

```text
Screenshot
   ↓
OCR once
   ↓
Persist result
   ↓
Reuse result
```

This is particularly important for large sessions.

---

# 30. OCR Status

Each capture needs an OCR processing state.

Conceptually:

```text
PENDING
      ↓
PROCESSING
     ↓
COMPLETED
```

Failure path:

```text
PROCESSING
     ↓
FAILED
```

These are the v1 internal OCR states.

The application should be able to distinguish:

```text
OCR hasn't started
OCR is running
OCR succeeded
OCR failed
```

---

# 31. Why OCR Status Matters

OCR is asynchronous.

Without status, the UI cannot reliably determine whether:

```text
No OCR result
```

means:

* OCR hasn't started.
* OCR is still running.
* OCR failed.
* OCR returned empty text.
* OCR data was deleted/corrupted.

Therefore, OCR status and OCR result should be logically distinguishable.

---

# 32. OCR Progress

Tesseract may emit internal progress logs, but v1 does not expose OCR percentage/progress to React UI.

For v1 communication:

```text
Use state events such as OCR_COMPLETED / OCR_FAILED.
Do not expose OCR_PROGRESS to the UI contract.
```

Progress remains infrastructure/runtime detail and is not persisted.

---

# 33. OCR Completion

When OCR succeeds:

```text
Tesseract
   │
   ▼
Raw Result
   │
   ▼
Normalize
   │
   ▼
Snabby OCR Result
   │
   ▼
Persist
   │
   ▼
OCR Status = COMPLETED
```

The UI can then indicate that the capture is OCR-ready.

---

# 34. Empty OCR Result

OCR may complete successfully but detect no useful text.

This is different from an OCR failure.

For example:

```text
OCR Status = COMPLETED
fullText = ""
words = []
```

versus:

```text
OCR Status = FAILED
```

The application should preserve this distinction.

An image containing no text is not necessarily an OCR error.

---

# 35. OCR Failure

If Tesseract fails:

```text
OCR Request
     │
     ▼
Tesseract
     │
     X
Failure
     │
     ▼
OCR Error
     │
     ▼
OCR Status = FAILED
```

The original screenshot remains valid.

The capture should not be deleted.

---

# 36. OCR Retry

A failed OCR operation may be retried.

Conceptually:

```text
OCR FAILED
    │
    ▼
Retry
    │
    ▼
OCR PROCESSING
    │
    ▼
OCR COMPLETED
```

Retry should reuse the persisted screenshot rather than requiring the user to capture the webpage again.

This is one of the major benefits of persisting captures before processing.

---

# 37. OCR Communication Flow

The detailed runtime communication is:

```text
┌────────────────────┐
│   Application      │
└─────────┬──────────┘
          │
          │ OCR Request
          ▼
┌────────────────────┐
│   Service Worker   │
└─────────┬──────────┘
          │
          │ Chrome Message
          ▼
┌────────────────────┐
│ Offscreen Document │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│    Tesseract.js    │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Tesseract Worker   │
└─────────┬──────────┘
          │
          ▼
      Recognition
          │
          ▼
┌────────────────────┐
│   Raw OCR Result   │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Offscreen Document │
└─────────┬──────────┘
          │
          │ OCR Response
          ▼
┌────────────────────┐
│   Service Worker   │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Result Normalizer  │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│  Snabby OCR Result │
└────────────────────┘
```

---

# 38. Message Boundary

The service worker and offscreen document communicate using explicit messages.

Conceptually:

```text
OCR_REQUEST
```

and:

```text
OCR_RESULT
```

along with progress/error messages where required.

The exact message schema will be defined later.

The message contract should contain only the information needed by the recipient.

---

# 39. External vs Internal OCR Contracts

There should be a clear separation between:

### External OCR contract

Communication with:

* Tesseract.
* Offscreen document.
* Chrome runtime messaging.

### Internal OCR contract

Used by:

* Application layer.
* PDF generation.
* UI.
* Persistence.

The transformation is:

```text
External OCR Data
       ↓
Adapter / Mapper
       ↓
Internal OCR Data
```

This prevents external implementation details from leaking into the application.

---

# 40. OCR Request Message

Conceptually:

```text
OCR_REQUEST
│
├── message type
├── request ID
├── capture ID
├── image data
└── OCR configuration
```

The request ID is useful for correlating asynchronous requests and responses.

The exact schema will be defined later.

---

# 41. OCR Response Message

Conceptually:

```text
OCR_RESULT
│
├── message type
├── request ID
├── capture ID
└── raw OCR result
```

Alternatively, the offscreen layer may normalize the result before returning it.

The exact responsibility boundary will be finalized during LLD.

The important requirement is:

> Every OCR response must be correlated with the request that produced it.

---

# 42. Request Correlation

Because OCR is asynchronous, the system should not assume:

```text
Request 1
   ↓
Response 1
   ↓
Request 2
   ↓
Response 2
```

always happens sequentially.

Multiple OCR operations may eventually exist.

Therefore:

```text
Request ID
     ↓
Response ID
```

should allow the system to identify which response belongs to which request.

---

# 43. Multiple OCR Operations

A session may contain many captures:

```text
Capture 1 → OCR
Capture 2 → OCR
Capture 3 → OCR
Capture 4 → OCR
```

The system must correctly associate:

```text
OCR Result 1 → Capture 1
OCR Result 2 → Capture 2
OCR Result 3 → Capture 3
OCR Result 4 → Capture 4
```

No OCR result may be attached to the wrong capture.

---

# 44. OCR Concurrency

OCR is computationally expensive.

For v1, OCR runs with a single-lane queue:

```text
OCR Queue
   │
   ├── Capture 1 → Processing
   │
   ├── Capture 2 → Waiting
   │
   └── Capture 3 → Waiting
```

Capture persistence never waits for OCR. Each capture is persisted immediately, then queued for OCR.

---

# 45. OCR Memory Management

Images can be large.

Tesseract processing may also require significant memory.

Therefore, the OCR subsystem should avoid unnecessarily keeping:

* duplicate image buffers.
* duplicate OCR results.
* unused workers.
* temporary image objects.

The exact cleanup strategy will be defined during implementation design.

---

# 46. OCR and IndexedDB

The relationship is:

```text
OCR Result
    │
    ▼
OCR Repository
    │
    ▼
IndexedDB
```

IndexedDB should store the normalized application-level OCR representation rather than raw Tesseract objects.

This gives us:

```text
Tesseract
   ↓
Raw Result
   ↓
Normalizer
   ↓
Snabby OCR Result
   ↓
IndexedDB
```

rather than:

```text
Tesseract
   ↓
IndexedDB
```

---

# 47. OCR and React

React should not directly interact with Tesseract.

The UI observes application state.

```text
Tesseract
    ↓
OCR Service
    ↓
Application State
    ↓
React
```

For example:

```text
OCR Processing
```

can become:

```text
React UI
"Processing..."
```

while:

```text
OCR Completed
```

can become:

```text
React UI
"OCR Ready"
```

The UI does not need to know how Tesseract works.

---

# 48. OCR and PDF Generation

The PDF generator consumes the normalized OCR result.

```text
OCR Result
    │
    ├── full text
    └── words + bounding boxes
             │
             ▼
       PDF Generator
```

The PDF generator does not need access to Tesseract.

This is a critical architectural boundary.

---

# 49. OCR-to-PDF Relationship

The full relationship is:

```text
Processed Image
      │
      ├───────────────────┐
      ▼                   ▼
     OCR                 PDF
      │                   │
      ▼                   │
OCR Bounding Boxes        │
      │                   │
      └─────────┬─────────┘
                ▼
        Coordinate Mapping
                │
                ▼
         Searchable PDF
```

The OCR subsystem provides the data.

The PDF subsystem decides how that data is placed into the PDF.

---

# 50. OCR Coordinate Invariant

The following must always remain true:

```text
OCR bounding box
        ↓
refers to
        ↓
the exact image representation
        ↓
used as the PDF page image
```

If the image changes after OCR:

```text
Resize
Rotate
Crop
```

then the OCR coordinates must also be transformed.

For v1, the preferred design is to avoid coordinate-changing image transformations after OCR.

---

# 51. OCR Result Versioning

Because OCR data is derived from an image, the system should be able to determine whether an OCR result corresponds to the current image representation.

Conceptually:

```text
Image Version
      │
      ▼
OCR Result Version
```

If the image is changed in a future feature:

```text
Image changes
      ↓
Existing OCR becomes stale
      ↓
OCR must be rerun
```

The exact versioning strategy will be decided later.

For v1, the simpler assumption is:

> A capture's normalized image remains unchanged after OCR.

---

# 52. OCR Data Lifecycle

The OCR data lifecycle is:

```text
Capture
   │
   ▼
Image Processing
   │
   ▼
OCR Not Started
   │
   ▼
OCR Processing
   │
   ▼
Raw Tesseract Result
   │
   ▼
Normalized OCR Result
   │
   ▼
Persisted OCR Result
   │
   ▼
Reusable OCR Data
   │
   ├── React
   └── PDF Generator
```

Failure:

```text
OCR Processing
      │
      X
      ▼
OCR Failed
      │
      ▼
Retry possible
```

---

# 53. Successful OCR Flow

```text
OCR-ready Image
      │
      ▼
Create OCR Request
      │
      ▼
Send to Service Worker
      │
      ▼
Send to Offscreen Document
      │
      ▼
Initialize / Reuse Tesseract
      │
      ▼
Run Recognition
      │
      ▼
Receive Raw Result
      │
      ▼
Normalize Result
      │
      ▼
Validate OCR Result
      │
      ▼
Persist OCR Result
      │
      ▼
Mark OCR Completed
      │
      ▼
Notify Application
```

---

# 54. OCR Failure Flow

```text
OCR-ready Image
      │
      ▼
OCR Request
      │
      ▼
Tesseract
      │
      X
      ▼
OCR Failure
      │
      ▼
Classify Error
      │
      ▼
Mark OCR Failed
      │
      ▼
Persist Failure State if required
      │
      ▼
Notify Application
      │
      ▼
Capture Remains Valid
```

---

# 55. OCR Timeout

For v1, there is no application-level hard timeout for OCR.

OCR runs until it reaches:

```text
COMPLETED
```

or:

```text
FAILED
```

The operation must not leave the capture permanently stuck in:

```text
PROCESSING
```

If an actual OCR error occurs, transition to FAILED and keep the capture valid.

---

# 56. Communication Failure

The offscreen communication itself may fail.

For example:

```text
Service Worker
      │
      │ OCR_REQUEST
      X
Offscreen Document unavailable
```

This is different from:

```text
Tesseract recognition failed
```

Therefore, the system should distinguish:

```text
Communication Error
```

from:

```text
OCR Engine Error
```

This distinction is valuable for debugging and retry behavior.

---

# 57. Tesseract Initialization Failure

Tesseract may fail before recognition starts.

For example:

```text
OCR Request
     ↓
Initialize Worker
     X
Initialization Failure
```

This should be classified separately from a recognition failure where appropriate.

Potential conceptual categories:

```text
WorkerInitializationError
LanguageInitializationError
RecognitionError
CommunicationError
TimeoutError
ResultNormalizationError
```

The final hierarchy will be defined later.

---

# 58. Result Validation

After receiving the raw result, Snabby should verify that the result can be safely converted into its internal model.

For example:

```text
Raw OCR Result
      │
      ▼
Validate Required Fields
      │
      ▼
Normalize
      │
      ▼
Validate Internal Result
```

This prevents malformed external data from entering the application's persistent state.

---

# 59. OCR Result Normalization Rules

The normalization layer should:

* Extract required text.
* Extract word-level results.
* Normalize confidence values.
* Normalize bounding boxes.
* Ensure dimensions are known.
* Remove unnecessary engine-specific structures.
* Ensure coordinates are valid.
* Associate the result with the correct capture.

It should not:

* Generate a PDF.
* Save directly to IndexedDB.
* Update React components.

---

# 60. OCR Result Integrity

A valid OCR result should satisfy:

```text
captureId is valid
imageWidth > 0
imageHeight > 0
words are valid
bounding boxes are within image bounds where expected
confidence values are valid
```

The exact validation rules will be formalized in the schema design.

---

# 61. Bounding Box Validation

For an image:

```text
width = W
height = H
```

a word bounding box should generally fall within the image coordinate system.

Conceptually:

```text
0 ≤ x ≤ W
0 ≤ y ≤ H
width ≥ 0
height ≥ 0
```

The exact tolerance and normalization behavior will be defined later.

This validation is particularly important because the coordinates are eventually used for PDF text placement.

---

# 62. OCR Result Persistence Strategy

The preferred conceptual flow is:

```text
Raw Tesseract Result
       ↓
Normalize
       ↓
Validate
       ↓
Persist Internal OCR Result
```

We should not persist raw Tesseract output simply because it is convenient.

The persisted representation should be the stable Snabby model.

---

# 63. OCR Result Reuse

Once persisted, OCR should not need to run again merely because:

* React UI reopened.
* User reordered captures.
* PDF generation was triggered again.
* Extension popup reopened.

The flow should instead be:

```text
IndexedDB
    ↓
Stored OCR Result
    ↓
Reuse
```

OCR should only be rerun when the image is considered stale or when the user explicitly requests reprocessing.

---

# 64. OCR Reprocessing

If reprocessing is needed:

```text
Stored Image
     │
     ▼
Image Processing
     │
     ▼
OCR
     │
     ▼
Replace / Update OCR Result
```

The old OCR result should not be mixed with the new result.

The final transaction/update strategy will be defined in the storage design.

---

# 65. OCR Subsystem Boundary

Conceptually:

```text
                         OCR SUBSYSTEM

       ┌───────────────────────────────────┐
       │           OCR Application         │
       └──────────────────┬────────────────┘
                          │
                          ▼
                   OCR Service
                          │
                          ▼
                  OCR Infrastructure
                          │
                          ▼
                  Service Worker
                          │
                          ▼
                  Offscreen Document
                          │
                          ▼
                      Tesseract
                          │
                          ▼
                  Raw OCR Result
                          │
                          ▼
                   Result Mapper
                          │
                          ▼
                   Snabby OCR Model
                          │
                          ▼
                   OCR Repository
                          │
                          ▼
                      IndexedDB
```

The exact module/class names will be defined during LLD.

---

# 66. Internal vs External Contracts

## External contracts

These include:

* Tesseract.js API.
* Tesseract worker communication.
* Chrome runtime messages.
* Offscreen document messages.

These are infrastructure-facing contracts.

## Internal contracts

These include:

* `OCRRequest`
* `OCRResult`
* `OCRWord`
* `BoundingBox`
* OCR status
* OCR errors

These belong to Snabby's application/domain model.

The boundary is:

```text
External Data
      ↓
Adapter / Mapper
      ↓
Internal Data
```

---

# 67. Input and Output

## OCR Input

Conceptually:

```text
OCRInput
│
├── captureId
├── processed image
├── width
├── height
└── OCR configuration
```

## OCR Output

Conceptually:

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

## Failure

```text
OCRError
```

The exact schemas will be defined in the next design phase.

---

# 68. Important Invariants

### Invariant 1

Every OCR result belongs to exactly one capture.

### Invariant 2

OCR coordinates refer to the normalized image.

### Invariant 3

Image transformations affecting coordinates occur before OCR.

### Invariant 4

OCR failure does not invalidate the screenshot.

### Invariant 5

Raw Tesseract structures do not leak into the application domain.

### Invariant 6

Persisted OCR data uses the internal Snabby model.

### Invariant 7

A successful OCR result has valid image dimensions.

### Invariant 8

Word bounding boxes belong to the same coordinate system as the image.

### Invariant 9

An empty OCR result is different from an OCR failure.

### Invariant 10

The same persisted OCR result can be reused by the UI and PDF generator.

### Invariant 11

OCR requests and responses can be correctly correlated.

### Invariant 12

A failed OCR operation leaves the original capture available.

---

# 69. Design Decisions

## Decision 1 — Tesseract is isolated behind an OCR abstraction

The rest of Snabby does not depend directly on Tesseract.

## Decision 2 — OCR executes through the offscreen environment

The existing offscreen architecture is retained where required by Tesseract and browser execution constraints.

## Decision 3 — OCR operates on normalized images

All coordinate-affecting image transformations occur before recognition.

## Decision 4 — Word-level information is preserved

OCR output contains text, confidence, and bounding boxes rather than only a plain text string.

## Decision 5 — Raw Tesseract output is not persisted

The application persists a normalized Snabby OCR model.

## Decision 6 — OCR results are persisted in IndexedDB

OCR does not need to be recomputed every time the UI or PDF generator needs the result.

## Decision 7 — OCR failures do not destroy captures

The screenshot remains available for retry or image-only PDF generation according to the final PDF policy.

## Decision 8 — OCR progress is runtime state

Progress should normally be communicated to the UI without unnecessarily persisting every progress update.

## Decision 9 — OCR request correlation is explicit

Asynchronous requests must be associated with their corresponding responses.

## Decision 10 — OCR and PDF generation remain separate

OCR provides structured text information; PDF generation decides how that information becomes a searchable PDF.

---

# 70. Open Questions

The following decisions remain for later stages:

1. Exact Tesseract.js version/configuration.
2. Exact OCR language(s).
3. Worker reuse strategy.
4. Tesseract initialization lifecycle.
5. Whether OCR is sequential or concurrently processed.
6. Maximum OCR concurrency.
7. Exact message types.
8. Exact request/response schemas.
9. Where result normalization occurs.
10. Whether progress messages travel through the service worker.
11. Exact OCR timeout.
12. Retry limits.
13. OCR worker cleanup policy.
14. Exact internal OCR schema.
15. Exact bounding-box representation.
16. Confidence precision.
17. OCR result versioning.
18. Whether processed images are persisted separately.
19. Whether OCR results are stored separately from captures or embedded.
20. How OCR results are invalidated when images change.
21. How malformed bounding boxes are handled.
22. Whether OCR text is displayed directly in the UI in v1.
23. Exact behavior when OCR produces no text.
24. Exact behavior when OCR fails but PDF generation is requested.

These will be resolved after the storage flow, data schemas, and LLD are designed.

---

# 71. Final OCR Flow

The complete conceptual flow is:

```text
                       CAPTURE
                          │
                          ▼
                   Persisted Image
                          │
                          ▼
                 Image Processing
                          │
                          ▼
                  OCR-ready Image
                          │
                          ▼
                     OCR Request
                          │
                          ▼
                  ┌───────────────┐
                  │ Service Worker│
                  └───────┬───────┘
                          │
                          │ Message
                          ▼
                  ┌───────────────┐
                  │   Offscreen   │
                  │   Document    │
                  └───────┬───────┘
                          │
                          ▼
                    Tesseract.js
                          │
                          ▼
                  Tesseract Worker
                          │
                          ▼
                    Recognition
                          │
                          ▼
                 Raw OCR Result
                          │
                          ▼
                 Result Normalizer
                          │
                          ▼
                  Snabby OCR Result
                          │
                          ▼
                     Validation
                          │
                          ▼
                  OCR Repository
                          │
                          ▼
                      IndexedDB
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
          React UI                PDF Generator
```

The key principle is:

> **Snabby uses Tesseract as an implementation detail to transform a normalized screenshot into a stable, persistent OCR representation containing text, confidence, and positional information.**

The next document should be **`07_STORAGE_INDEXEDDB_FLOW.md`**. This is particularly important because we have now established the main persistent entities that need to work together: **sessions, captures, image assets, and OCR results**. The storage design should determine how those entities are represented, related, persisted, updated, deleted, and recovered using IndexedDB.


one correction , we are not going to show any ocr completion percentage or related thing in the ui , just if the user hits the download button before ocr has completed then user will get a option to wait till ocr get completed or download instantly without ocr .