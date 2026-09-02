# Snabby

**Snabby** is a browser extension that allows a user to capture screenshots from webpages across multiple browser tabs and combine those captures into a single PDF.

Each captured screenshot can be processed using OCR so that text contained within the screenshot can be extracted and used when generating the PDF.

### Core flow

```text
User
 │
 │ Ctrl + Shift + S
 │
 ▼
Capture Active Webpage
 │
 ▼
Create / Update Capture Session
 │
 ▼
Store Screenshot
 │
 ▼
Process Screenshot
 │
 ▼
OCR
 │
 ▼
Store OCR Result
 │
 ▼
Show Capture in Snabby UI
 │
 │
 ├── Capture another tab/page
 ├── Reorder captures
 ├── Delete captures
 │
 ▼
Download
 │
 ▼
Generate PDF
 │
 ├── Screenshot image
 └── OCR text layer
 │
 ▼
Download PDF
```

---

# 2. Scope of v1

## 2.1 Included

Snabby v1 will support:

1. Capturing screenshots from webpages.
2. Capturing screenshots across multiple browser tabs.
3. Managing multiple screenshots as a single capture session.
4. Persisting sessions and captures locally.
5. Using IndexedDB for persistent application data.
6. Displaying captured screenshots in the Snabby UI.
7. Reordering captures.
8. Removing captures.
9. Processing captured images.
10. Running OCR on captured images.
11. Extracting text from screenshots.
12. Extracting OCR positional information/bounding boxes.
13. Generating a PDF from captured screenshots.
14. Using OCR information when generating the PDF.
15. Downloading the generated PDF.
16. Handling capture/OCR/storage/PDF errors.
17. Maintaining application state across extension UI lifecycle changes where persistent state is required.

## 2.2 Explicitly excluded from v1

### Phone upload

The phone-upload workflow is **not part of this version**.

There will be no:

```text
QR code
phone pairing
phone → desktop upload
remote capture
socket-based phone transfer
```

in v1.

However, the architecture should not make adding another capture source later unnecessarily difficult.

Future:

```text
             Capture Sources
                  │
        ┌─────────┴─────────┐
        ↓                   ↓
   Browser Capture      Phone Upload
        │                   │
        └─────────┬─────────┘
                  ↓
          Common Capture
             Pipeline
```

---

# 3. Requirement: Start a Capture

The user must be able to start Snabby's capture process using the browser keyboard shortcut.

### Primary interaction

```text
Ctrl + Shift + S
```

on Windows/Linux.

```text
Cmd + Shift + S
```

on macOS.

### Expected behavior

When the shortcut is triggered:

1. Snabby identifies the active browser tab.
2. Snabby initiates screenshot capture.
3. The captured image becomes a Snabby capture.
4. The capture is associated with the appropriate capture session.
5. The capture is persisted locally.
6. Processing can then continue through the capture pipeline.

### Requirement

The shortcut must **not require the user to manually open the extension popup first**.

---

# 4. Requirement: Capture a Webpage

Snabby must capture the currently active webpage using the browser's screenshot capability.

A capture should contain enough information to identify and process it later.

Conceptually:

```text
Capture
├── id
├── sessionId
├── image
├── source information
├── dimensions
├── timestamp
├── processing state
└── OCR state
```

The exact schema will be designed later.

### Capture metadata

We should preserve useful metadata such as:

* Capture ID
* Session ID
* Source tab information where available
* Page URL where available/appropriate
* Page title where available
* Capture timestamp
* Image dimensions
* Capture order

We will decide later which metadata is actually persisted.

---

# 5. Requirement: Support Multiple Tabs

This is one of Snabby's core features.

The user should be able to:

```text
Tab A → Capture
Tab B → Capture
Tab C → Capture
Tab A → Capture again
Tab D → Capture
```

and have all of these captures belong to the same logical session when appropriate.

Example:

```text
Session
│
├── Capture 1 — Tab A
├── Capture 2 — Tab B
├── Capture 3 — Tab C
├── Capture 4 — Tab A
└── Capture 5 — Tab D
```

The PDF should preserve the user's intended capture order.

---

# 6. Requirement: Capture Sessions

Snabby needs the concept of a **capture session**.

A session represents a collection of screenshots that the user intends to process/export together.

Conceptually:

```text
Session
│
├── Capture 1
├── Capture 2
├── Capture 3
└── Capture 4
```

A session should have:

* Unique ID
* Creation timestamp
* Last-modified timestamp
* Ordered list/relationship of captures
* Session status

The exact storage representation will be decided during the data-model design.

---

# 7. Requirement: Persist Captures

Captured screenshots must not exist only in React state or temporary JavaScript objects.

They need persistent local storage.

### New architecture

```text
Application
     ↓
Repository
     ↓
IndexedDB
```

IndexedDB becomes the **persistent local data store** for Snabby.

We are intentionally **not using `chrome.storage.local` as the primary application database** in this version.

---

# 8. Requirement: Persist Image Data

The screenshot itself must be persisted so that the user can later:

* reopen/view the capture
* perform OCR
* reorder it
* delete it
* generate a PDF from it

The storage design must support binary image data efficiently.

We will determine later whether the image is stored directly as a `Blob` or through another asset abstraction.

---

# 9. Requirement: Display Captures

The React UI must display the captures belonging to the current session.

The user should be able to visually identify:

```text
Capture 1
Capture 2
Capture 3
...
```

The UI should not need to know how the image was stored.

Conceptually:

```text
IndexedDB
    ↓
Repository
    ↓
Application
    ↓
React
    ↓
Capture Preview
```

---

# 10. Requirement: Reorder Captures

The user must be able to change the order of captures.

Example:

```text
Before:

1 → A
2 → B
3 → C

After:

1 → C
2 → A
3 → B
```

The resulting PDF must follow the new order.

Therefore, capture ordering is **business data**, not merely a UI concern.

---

# 11. Requirement: Delete Capture

The user must be able to remove an individual capture from a session.

For example:

```text
Session
├── A
├── B  ← delete
└── C
```

becomes:

```text
Session
├── A
└── C
```

Deleting a capture should also clean up associated data where appropriate, including:

* image data
* OCR result
* associated metadata

The exact cleanup strategy will be defined during the IndexedDB design.

---

# 12. Requirement: Image Processing

Captured screenshots may need preprocessing before OCR.

The image-processing pipeline is responsible for preparing the image for downstream processing.

Conceptually:

```text
Captured Image
      ↓
Image Validation
      ↓
Image Normalization
      ↓
Orientation / Dimension Handling
      ↓
OCR-ready Image
```

The existing implementation contains image normalization/orientation-related logic, so this behavior needs to be preserved where it contributes to correct OCR.

Image processing should be independent from OCR itself.

---

# 13. Requirement: OCR

Snabby must extract text from captured screenshots.

The OCR pipeline should:

1. Receive a captured image.
2. Prepare the image if necessary.
3. Send the image to the OCR subsystem.
4. Run Tesseract OCR.
5. Receive the recognition result.
6. Normalize the raw OCR result into Snabby's internal format.
7. Persist the result.
8. Make the result available to PDF generation.

---

# 14. OCR Must Preserve Positional Information

The OCR result should not be reduced to only:

```text
"some extracted text"
```

The existing system works with OCR word-level information, including bounding boxes.

Conceptually:

```text
OCRResult
│
├── fullText
│
└── words
     │
     ├── text
     ├── confidence
     └── boundingBox
          ├── x
          ├── y
          ├── width
          └── height
```

This information is important for creating an OCR-enabled/searchable PDF.

---

# 15. OCR Architecture Requirement

OCR should be isolated from the rest of the application.

The application should conceptually request:

```text
OCRService
    ↓
extractText(image)
```

It should not directly know about:

```text
Tesseract
worker
offscreen document
Tesseract configuration
```

Those are infrastructure details.

The existing Chrome extension architecture uses an **offscreen document** for OCR-related processing. We should preserve that where required by Chrome/Tesseract, but hide it behind a clean OCR abstraction.

---

# 16. OCR Progress / Status

OCR is potentially asynchronous and expensive.

Therefore, a capture needs an OCR state.

Conceptually:

```text
NOT_STARTED
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

The UI should be able to distinguish:

```text
Screenshot captured
OCR still running
OCR completed
OCR failed
```

rather than treating all of these as the same state.

---

# 17. OCR Failure Handling

If OCR fails:

* The screenshot itself should not automatically be lost.
* The capture should remain available.
* The OCR failure should be represented explicitly.
* PDF generation behavior must be defined.

For example, a capture could potentially still be included as an image-only PDF page even if OCR failed.

**We'll make the exact behavior a design decision during the detailed PDF/OCR specification.**

---

# 18. Requirement: Generate PDF

The user must be able to download the current capture session as a PDF.

Input:

```text
Capture Session
```

Output:

```text
PDF Blob / File
```

The PDF should contain the captured screenshots in the selected order.

---

# 19. PDF Page Ordering

The PDF page order must match the capture order in the session.

Example:

```text
Session:

1 → Screenshot A
2 → Screenshot C
3 → Screenshot B
```

PDF:

```text
Page 1 → A
Page 2 → C
Page 3 → B
```

---

# 20. OCR-enabled PDF

Where OCR information is available, the generated PDF should contain an OCR text layer corresponding to the screenshot.

Conceptually:

```text
PDF Page
│
├── Screenshot Image
│
└── Invisible / searchable OCR text
       │
       ├── Word A
       ├── Word B
       └── Word C
```

The OCR coordinates must be transformed appropriately from image coordinates to PDF coordinates.

This will be a detailed subsystem design later.

---

# 21. PDF Generation Must Be Independent

The application layer should not directly manipulate PDF-library APIs.

Instead:

```text
Application
    ↓
PDF Generator Interface
    ↓
PDF Implementation
    ↓
PDF Library
```

This keeps PDF-specific logic isolated.

---

# 22. Download PDF

After PDF generation succeeds, Snabby must allow the resulting PDF to be downloaded by the user.

Flow:

```text
Generate PDF
     ↓
PDF Blob
     ↓
Download
```

The download mechanism should be isolated from PDF generation.

Generating a PDF and downloading a PDF are **two separate responsibilities**.

---

# 23. Application State

Snabby needs to track the state of the current workflow.

At a high level:

```text
Session State
     ↓
Capture State
     ↓
Processing State
     ↓
OCR State
     ↓
PDF State
```

We should avoid allowing unrelated booleans to create impossible states.

For example:

```text
isCapturing = false
isProcessing = true
isOCR = true
isGeneratingPDF = true
```

could become difficult to reason about.

We'll design proper state models later.

---

# 24. Extension Communication

Because Snabby is a Chrome extension, different execution contexts may be involved.

Conceptually:

```text
Service Worker
     │
     ├── Chrome APIs
     │
     ├── Capture coordination
     │
     └── Message routing
             │
             ↓
       Offscreen Document
             │
             ↓
          Tesseract
```

Communication between these contexts must use explicit message contracts.

We will later define:

```text
Message Type
Request Schema
Response Schema
Error Schema
```

---

# 25. React UI Requirements

React will be used for Snabby's application interface.

React should provide:

* Capture/session view
* Capture previews
* Capture ordering controls
* Delete controls
* Processing/OCR status
* Download action
* Error feedback
* Appropriate loading states

React should **not** directly contain:

* IndexedDB implementation
* Tesseract implementation
* Chrome screenshot implementation
* PDF library implementation
* low-level image processing

Those belong to other layers.

---

# 26. Data Consistency

Snabby must maintain consistency between:

```text
Session
Capture
Image
OCR Result
```

For example, deleting a capture should not leave an orphaned OCR result indefinitely.

Similarly:

```text
Capture exists
but
Image doesn't exist
```

should be treated as an invalid/corrupted state and handled appropriately.

This becomes particularly important with IndexedDB transactions.

---

# 27. Error Handling

The system needs explicit error categories.

At minimum:

```text
Capture Error
Storage Error
Image Processing Error
OCR Error
PDF Generation Error
Download Error
Communication Error
```

Errors should be:

* identifiable
* meaningful
* recoverable where possible
* separated from user-facing messages

For example:

```text
Infrastructure Error
       ↓
Application Error
       ↓
UI-friendly Error Message
```

---

# 28. No Backend Dependency for Core Workflow

The core Snabby workflow should work locally:

```text
Capture
   ↓
Process
   ↓
OCR
   ↓
Store
   ↓
Generate PDF
   ↓
Download
```

No server should be required for this core flow.

The data remains local to the user's browser/extension environment.

---

# 29. Privacy Requirement

Because screenshots may contain sensitive webpage information, Snabby should process the core workflow locally.

The v1 architecture should avoid sending captured screenshots/OCR content to an external server.

This is also one of the reasons the local IndexedDB architecture makes sense.

---

# 30. Future Extensibility Requirement

Although phone upload isn't implemented, the architecture should allow additional capture sources later.

The important principle is:

```text
Capture Source
      ↓
Common Capture Model
      ↓
Common Processing Pipeline
```

not:

```text
Phone Capture
     ↓
completely separate Snabby system
```

This is an architectural requirement, **not a v1 feature**.

---

# 31. Requirement: Page Editing and Vector Annotation

Users must be able to visually annotate captured page screenshots using an integrated vector editor (Excalidraw).

Requirements:
1. Users can launch the editor by clicking the **Edit** action on any captured page card in the side panel.
2. The editor must display the original screenshot as a locked background element at position `(0, 0)`.
3. Users can draw, write, and add vector shapes over the screenshot.
4. Annotation data (`Page.annotationData`) must be serialized as Excalidraw element JSON and stored separately from the background screenshot.
5. Reopening the editor for an annotated page must restore all previous vector drawings in an editable state.
6. The editor UI must run inside Snabby's Shadow DOM as a full-screen modal overlay.

---

# 32. Requirement: Bounded Rendered Image Persistence & Display Fallback

The vector annotations must be composited into a flattened visual image for display in side panel previews, lightboxes, and generated PDFs.

Requirements:
1. **Bounded Compositing**: Drawings made outside the original screenshot dimensions (`width` × `height`) must be strictly cropped out of the final rendered image (`renderBoundedPageImage`).
2. **Rendered Image Asset Storage**: The composited visual image (`screenshot + drawings`) must be saved to IndexedDB as a separate `ImageAsset` with a unique `renderedImageId`.
3. **Old Asset Cleanup**: Re-saving page annotations must replace and delete the previous rendered `ImageAsset` from IndexedDB to avoid storage leaks.
4. **Transparent Image Fallback**: All visual consumers (side panel, lightbox, PDF exporter) must resolve page images via `page.effectiveRenderedImageId` (`renderedImageId ?? imageId`), ensuring transparent display of the latest annotated page version.

---

# 33. High-Level Requirements Summary

The entire v1 can therefore be viewed as:

```text
                    SNABBY V1
                       │
                       ▼
                Capture Session
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
       Capture      Metadata      Ordering
          │
          ▼
     Image Storage
          │
          ▼
   Image Processing
          │
          ▼
         OCR ──► Persist OCR Result
          │
          ▼
     IndexedDB
          │
          ▼
       React UI
          │
          ├── View
          ├── Reorder
          └── Delete
          │
          ▼
    Generate PDF
          │
          ├── Image
          └── OCR Text Layer
          │
          ▼
       PDF Blob
          │
          ▼
       Download
```


