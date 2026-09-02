# 18 — Extension Communication Flow & Message Contracts

## 1. Purpose

This document defines the **exact cross-context command and event catalog for Snabby v1**.

The current project contains several message types that are unused, related to removed phone/P2P functionality, or represent older OCR ideas. We will **not carry those messages forward blindly**.

Snabby v1 has three relevant runtime contexts:

```text
React UI / Content Script
        ↕
Service Worker
        ↕
Offscreen Document
```

Phone upload and WebRTC/P2P communication are **not part of v1**.

---

# 2. Communication Rules

There are two types of messages.

### Commands

A command requests an operation and receives a response.

```text
React
  ↓
Service Worker
  ↓
Response
```

Examples:

```text
START_SESSION
GET_SESSION
DELETE_CAPTURE
EXPORT_PDF
```

### Events

An event informs another context that something happened.

```text
Service Worker
      ↓
React
```

Events do not require a response.

Examples:

```text
CAPTURE_COMPLETE
SESSION_UPDATED
SESSION_RESTORED
OCR_COMPLETED
OCR_FAILED
ACTIVATION_CHANGED
SHOW_TOAST
```

Events do not require a response.

---

# 3. Standard Response Schema

All command responses follow this general structure:

### Success

```ts
{
  success: true,
  data?: T
}
```

### Failure

```ts
{
  success: false,
  error: {
    code: string,
    message: string,
    operation: string,
    details?: unknown
  }
}
```

The UI should never receive raw Chrome, IndexedDB, or Tesseract exceptions.

---

# 4. Session Commands

## `GET_SESSION`

### Direction

```text
React → Service Worker
```

### Request

```ts
{
  type: "GET_SESSION"
}
```

### Response

```ts
{
  success: true,
  data: {
    session: Session | null,
    settings: Settings
  }
}
```

The current implementation returns session, activation state, and settings from this request. 

For v1, activation state may remain part of the application bootstrap response if the UI still needs it.

---

# 5. `START_SESSION`

### Direction

```text
React → Service Worker
```

### Request

```ts
{
  type: "START_SESSION",
  name: string
}
```

### Success

```ts
{
  success: true,
  data: {
    session: Session
  }
}
```

### Failure

```text
SESSION_ACTIVE
```

The current implementation creates an active session and rejects the request if another session is active. 

---

# 6. `CONFIRM_OVERWRITE`

### Direction

```text
React → Service Worker
```

Used after the user confirms:

> End current session and start a new one.

### Request

```ts
{
  type: "CONFIRM_OVERWRITE",
  name: string
}
```

### Response

```ts
{
  success: true,
  data: {
    session: Session
  }
}
```

The current implementation uses this to discard the current session and create a fresh one. 

---

# 7. `END_SESSION`

### Direction

```text
React → Service Worker
```

### Request

```ts
{
  type: "END_SESSION"
}
```

### Response

```ts
{
  success: true
}
```

For v1, the exact session cleanup behavior follows the decisions in the session/storage documents.

---

# 8. Capture Commands

## `SET_CAPTURE_MODE`

### Direction

```text
React → Service Worker
```

### Request

```ts
{
  type: "SET_CAPTURE_MODE",
  mode: "VISIBLE" | "REGION"
}
```

### Response

```ts
{
  success: true,
  data: {
    mode: "VISIBLE" | "REGION"
  }
}
```

The existing implementation stores the selected capture mode in settings. 

---

# 9. Capture Trigger

Screenshot capture from the keyboard shortcut is **not a runtime message**.

It starts through the Chrome Commands API:

```text
Ctrl + Shift + S
        ↓
Chrome command
        ↓
Service Worker
        ↓
Capture
```

The service worker checks the active session and capture mode before performing the capture. 

Therefore we do **not** need a:

```text
CAPTURE_SCREEN
```

runtime message just to represent the keyboard shortcut.

---

# 10. `SAVE_REGION_CAPTURE`

### Direction

```text
React/Content Script → Service Worker
```

Used after the user selects and crops a region.

### Request

```ts
{
  type: "SAVE_REGION_CAPTURE",
  dataUrl: string
}
```

### Response

```ts
{
  success: true,
  data: {
    captureId: string
  }
}
```

The current implementation receives the cropped image from the content script and passes it to `SessionManager.addScreenshot()`. 

In v1, the underlying persistence will use IndexedDB rather than the old storage layer.

---

# 10.5. `CAPTURE_REQUEST`

### Direction

```text
React → Service Worker
```

Used when the user triggers screenshot acquisition via the capture button in the React popup interface.

### Request

```ts
{
  type: "CAPTURE_REQUEST"
}
```

### Response

```ts
{
  success: true,
  data: {
    capture: Capture
  }
}
```

The Service Worker will execute visible tab capture, perform image scaling/processing, persist records to IndexedDB, and return the populated Capture object.

---

# 11. `DELETE_CAPTURE`

### Direction

```text
React → Service Worker
```

### Request

```ts
{
  type: "DELETE_CAPTURE",
  captureId: string
}
```

The old implementation uses a screenshot index. The new implementation will use a stable `captureId`, matching the new data model.

### Response

```ts
{
  success: true
}
```

Deletion includes the associated:

```text
Image
OCR Result
Capture
```

according to the IndexedDB storage design.

---

# 12. `GET_ALL_THUMBNAILS`

### Direction

```text
React → Service Worker
```

### Request

```ts
{
  type: "GET_ALL_THUMBNAILS"
}
```

### Response

```ts
{
  success: true,
  data: {
    captures: CapturePreview[]
  }
}
```

The current implementation returns thumbnail information from the current session. 

The v1 implementation will load image data through the IndexedDB image repository.

---

# 13. PDF Commands

## `CHECK_OCR_STATUS`

### Direction

```text
React → Service Worker
```

### Request

```ts
{
  type: "CHECK_OCR_STATUS"
}
```

### Response

```ts
{
  success: true,
  data: {
    pendingCount: number,
    totalCount: number
  }
}
```

The current implementation already exposes this concept by counting screenshots without completed/attempted OCR. 

### Important UI rule

This information is **not displayed as OCR progress**.

It is only used when determining whether the download decision dialog is necessary.

---

# 14. `EXPORT_PDF`

### Direction

```text
React → Service Worker
```

### Request

```ts
{
  type: "EXPORT_PDF",
  filename: string,
  skipPendingOcr: boolean
}
```

### Meaning

```text
skipPendingOcr = false
```

Wait for/run pending OCR before generating the PDF.

```text
skipPendingOcr = true
```

Generate immediately and omit OCR only for captures whose OCR is not available.

Already completed OCR is still included.

The existing implementation already uses `skipPendingOcr` for this behavior. 

### Success

```ts
{
  success: true
}
```

### Failure

```ts
{
  success: false,
  error: {
    code: "PDF_GENERATION_FAILED",
    message: string,
    operation: "EXPORT_PDF"
  }
}
```

---

# 15. OCR-incomplete Download Flow

The message protocol does **not** expose OCR percentage/progress.

Instead:

```text
React
  │
  │ CHECK_OCR_STATUS
  ▼
Service Worker
  │
  ▼
pendingCount
```

If:

```text
pendingCount === 0
```

React sends:

```text
EXPORT_PDF
skipPendingOcr: false
```

If:

```text
pendingCount > 0
```

React asks the user:

```text
OCR is still processing.

[ Wait for OCR ]   [ Download Now ]
```

### Wait

```text
EXPORT_PDF
skipPendingOcr: false
```

### Download Now

```text
EXPORT_PDF
skipPendingOcr: true
```

There is **no OCR progress event sent to React**.

---

# 16. Background → React Events

## `CAPTURE_COMPLETE`

Sent after a capture has been successfully persisted.

### Payload

```ts
{
  type: "CAPTURE_COMPLETE",
  captureId: string,
  count: number
}
```

The current implementation sends the capture count and optionally a memory warning. 

Since v1 has no storage-limit UI, the memory-warning field is not required.

---

# 17. `SESSION_RESTORED`

### Direction

```text
Service Worker → React
```

### Payload

```ts
{
  type: "SESSION_RESTORED",
  session: Session
}
```

This informs the UI that the persisted active session has been restored.

The current implementation already sends this when an active session is found after activation/tab loading. 

---

# 18. `SESSION_UPDATED`

### Direction

```text
Service Worker → React
```

### Payload

```ts
{
  type: "SESSION_UPDATED",
  session: Session
}
```

Used when session-level data changes and the UI needs to refresh.

The exact events that trigger this should remain limited; the UI should not receive an event for every internal database write.

---

# 19. `OCR_COMPLETED`

### Direction

```text
Service Worker → React
```

### Payload

```ts
{
  type: "OCR_COMPLETED",
  captureId: string
}
```

This event exists for **state synchronization**, not progress display.

React can use it to refresh the relevant capture if necessary.

It does **not** contain:

```text
percentage
progress
current/total
```

---

# 20. `OCR_FAILED`

### Direction

```text
Service Worker → React
```

### Payload

```ts
{
  type: "OCR_FAILED",
  captureId: string,
  error: {
    code: string,
    message: string,
    operation: "OCR"
  }
}
```

The UI may choose how to represent the failure, but no OCR progress UI is required.

---

# 21. `PDF_GENERATION_COMPLETED`

### Direction

```text
Service Worker → React
```

### Payload

```ts
{
  type: "PDF_GENERATION_COMPLETED"
}
```

The event is optional if the `EXPORT_PDF` request itself remains open until completion.

For v1, the preferred design is:

```text
EXPORT_PDF request
        ↓
await operation
        ↓
response
```

Therefore a separate completion event is **not required** for the initial implementation.

---

# 22. `SHOW_TOAST`

### Direction

```text
Service Worker → React
```

This existed in the current implementation for background capture errors. 

For v1, prefer returning structured errors from commands and allowing React to decide how to display them.

Therefore:

> **`SHOW_TOAST` is not part of the required v1 communication contract.**

The UI owns presentation.

---

# 23. `ACTIVATION_CHANGED`

This event exists in the current extension and is related to turning Snabby on/off from the extension action. 

For v1:

```ts
{
  type: "ACTIVATION_CHANGED",
  activated: boolean
}
```

It remains an extension lifecycle event rather than an application/session command.

---

# 24. Offscreen OCR Protocol

The service worker communicates with the offscreen document separately from the React ↔ Service Worker protocol.

These messages use a discriminated object with a `target` field:

```ts
{
  target: "offscreen",
  action: string,
  ...payload
}
```

The offscreen document filters incoming messages by `message.target === 'offscreen'`.

The **v1-active** offscreen actions are:

```text
ocr      ← primary action, used by TesseractOCRAdapter
ping     ← infrastructure health check
```

The following actions exist in the codebase but are **not currently dispatched in v1** (retained for completeness):

```text
normalize
thumbnail
```

---

# 25. `ocr` — Offscreen Command

### Request

```ts
{
  target: "offscreen",
  action: "ocr",
  dataUrl: string
}
```

### Success

```ts
{
  success: true,
  text: string,
  confidence: number,
  words: OCRWord[],
  imageWidth: number,
  imageHeight: number
}
```

### Failure

```ts
{
  success: false,
  error: string,
  text: "",
  confidence: 0,
  words: [],
  imageWidth: 0,
  imageHeight: 0
}
```

This matches the actual offscreen OCR contract. 

---

# 26. OCR Word Schema

The **raw** offscreen response contains Tesseract-format bounding boxes:

```ts
// Returned by the offscreen document (Tesseract raw format)
type OffscreenOCRWord = {
  text: string,
  confidence: number,
  bbox: {
    x0: number,  // left
    y0: number,  // top
    x1: number,  // right
    y1: number   // bottom
  }
}
```

The `TesseractOCRAdapter` **normalizes** this into the domain `OCRWord` format before saving:

```ts
// Domain model (stored in IndexedDB)
type OCRWord = {
  text: string,
  confidence: number,
  boundingBox: {
    x: number,       // = bbox.x0
    y: number,       // = bbox.y0
    width: number,   // = bbox.x1 - bbox.x0
    height: number   // = bbox.y1 - bbox.y0
  }
}
```

The conversion from raw `x0/y0/x1/y1` to `x/y/width/height` happens in the adapter, not in the offscreen document. This keeps Tesseract internals out of the domain model. 

---

# 27. Offscreen `normalize`

The existing offscreen document supports:

```ts
{
  target: "offscreen",
  action: "normalize",
  dataUrl: string
}
```

with:

```ts
{
  success: true,
  dataUrl: string,
  width: number,
  height: number
}
```

However, this is an **internal infrastructure capability**, not a React-facing command.

The v1 OCR adapter may use it internally or perform normalization as part of its OCR operation.

---

# 28. Offscreen `thumbnail`

The existing implementation also supports:

```ts
{
  target: "offscreen",
  action: "thumbnail",
  dataUrl: string,
  maxDim?: number
}
```

with:

```ts
{
  success: true,
  thumbnailDataUrl: string,
  width: number,
  height: number
}
```

Again, this is not a public application message.

Whether v1 uses this exact operation will be determined by the image/preview implementation.

---

# 29. Offscreen `ping`

Internal health check:

```ts
{
  target: "offscreen",
  action: "ping"
}
```

Response:

```ts
{
  success: true,
  status: "ready"
}
```

This is infrastructure-level communication.

---

# 30. Messages Explicitly Removed From v1

The current `constants.js` contains several messages that we will **not carry into v1**.

### Phone upload

```text
CREATE_UPLOAD_SESSION
CLOSE_UPLOAD_SESSION
PHONE_IMAGE_RECEIVED
STOP_UPLOAD_POLLING
GET_UPLOAD_POLLING_STATE
```

Phone upload is deferred to a future version.

### WebRTC/P2P

```text
CREATE_P2P_SESSION
CLOSE_P2P_SESSION
P2P_IMAGE_RECEIVED
P2P_CONNECTION_STATE
GET_P2P_STATE
```

These are not part of v1.

The old constants contain both groups. 

---

# 31. Legacy OCR Messages Removed

The old constants also declare:

```text
OCR_REQUEST
OCR_RESULT
OCR_PROGRESS
```

But the actual OCR implementation does **not** use these as its communication protocol.

The real service-worker → offscreen protocol is:

```text
target: "offscreen"
action: "ocr"
```

with a direct response. 

Therefore these legacy OCR messages will **not** be carried into v1.

---

# 32. OCR Progress Messages Removed

The current implementation contains `OCR_PROGRESS` in constants, but v1 will not use it.

There will be:

```text
❌ OCR_PROGRESS
❌ OCR percentage
❌ OCR progress bar
❌ OCR current/total UI
```

The internal OCR worker can still log its own progress for debugging; that is not application communication.

The current Tesseract logger already produces console progress information. 

---

# 33. Export Progress Removed From UI Contract

The old implementation sends:

```text
EXPORT_PROGRESS
```

during export OCR processing. 

For v1 this should **not be part of the UI communication contract**.

The user does not need to see OCR progress.

If PDF generation needs an internal progress mechanism later, that can be implemented independently without exposing it as UI OCR progress.

---

# 34. Final v1 Command Catalog

### React → Service Worker

```text
GET_SESSION
START_SESSION
CONFIRM_OVERWRITE
END_SESSION
SET_CAPTURE_MODE
SAVE_REGION_CAPTURE
DELETE_CAPTURE
GET_ALL_THUMBNAILS
CHECK_OCR_STATUS
CAPTURE_REQUEST
EXPORT_PDF
```

The keyboard capture shortcut is handled by Chrome Commands rather than this catalog.

---

# 35. Final v1 Event Catalog

### Service Worker → React

```text
ACTIVATION_CHANGED
SESSION_RESTORED
SESSION_UPDATED
CAPTURE_COMPLETE
OCR_COMPLETED
OCR_FAILED
```

Not included:

```text
OCR_PROGRESS
EXPORT_PROGRESS
SHOW_TOAST
PHONE_IMAGE_RECEIVED
POLLING_STATE_CHANGED
```

unless a later requirement specifically introduces them.

---

# 36. Communication Overview

```text
                     React UI
                        │
          ┌─────────────┴──────────────┐
          │                            │
       Commands                       Events
          │                            ▲
          ▼                            │
                Service Worker
                        │
                        │
                  OCR command
                        │
                        ▼
                Offscreen Document
                        │
                        ▼
                   Tesseract
```

---

# 37. Example — Normal Capture

```text
User
 │
 │ Ctrl + Shift + S
 ▼
Chrome Commands API
 │
 ▼
Service Worker
 │
 ├── captureVisibleTab()
 │
 ├── save Capture/Image
 │
 └── queue OCR
 │
 └──────────────→ React
                  CAPTURE_COMPLETE
```

No React → Service Worker capture command is necessary for the keyboard shortcut.

---

# 38. Example — Region Capture

```text
User
 │
 │ Ctrl + Shift + S
 ▼
Service Worker
 │
 ▼
START_REGION_SELECT
 │
 ▼
React / Content Script
 │
 │ user selects region
 │
 ▼
SAVE_REGION_CAPTURE
 │
 ▼
Service Worker
 │
 ├── save capture
 └── queue OCR
 │
 ▼
CAPTURE_COMPLETE
```

---

# 39. Example — OCR Completion

```text
Capture
   ↓
OCR Queue
   ↓
Service Worker
   ↓
Offscreen
   ↓
Tesseract
   ↓
OCR Result
   ↓
IndexedDB
   ↓
OCR_COMPLETED
   ↓
React refreshes capture
```

The event tells React **that OCR is available**. It does not expose OCR progress.

---

# 40. Example — Download With Pending OCR

```text
User clicks Download
        ↓
CHECK_OCR_STATUS
        ↓
pendingCount > 0
        ↓
React shows choice
      /       \
   WAIT      DOWNLOAD NOW
     │            │
     ▼            ▼
EXPORT_PDF    EXPORT_PDF
skip=false    skip=true
     │            │
     └──────┬─────┘
            ▼
        Service Worker
            ↓
        PDF Generator
            ↓
          Download
```

---

# 41. Contract Principle

The message layer should transport **application intent and results**, not implementation details.

Good:

```ts
{
  type: "EXPORT_PDF",
  filename: "notes.pdf",
  skipPendingOcr: true
}
```

Bad:

```ts
{
  type: "RUN_TESSERACT_AND_THEN_USE_PDFLIB..."
}
```

The first describes **what the application wants**.

The second exposes **how it happens**.

---

# 42. Final Decision

The new communication architecture is intentionally smaller than the old one.

```text
OLD
Many commands
+ phone upload
+ WebRTC
+ legacy OCR messages
+ progress messages
+ UI toast events

NEW
Focused application commands
+ focused state events
+ separate internal OCR protocol
```

This is deliberate.

---

# 43. Page Editor Message Schemas

### 43.1 `GET_PAGE_EDITOR_IMAGE`

#### Request
```ts
{
  type: "GET_PAGE_EDITOR_IMAGE",
  pageId: string,
  requestId?: string
}
```

#### Response (Success)
```ts
{
  success: true,
  data: {
    pageId: string,
    imageId: string,
    dataUrl: string,      // Raw base64 data URL of original screenshot background
    width: number,        // Original image width in pixels
    height: number,       // Original image height in pixels
    mimeType: string,     // 'image/png' or 'image/jpeg'
    annotationData: string | null // Serialized Excalidraw element JSON string if present
  }
}
```

#### Response (Failure)
```ts
{
  success: false,
  error: {
    code: "PAGE_OR_IMAGE_NOT_FOUND",
    message: string,
    operation: "GET_PAGE_EDITOR_IMAGE"
  }
}
```

---

### 43.2 `SAVE_PAGE_ANNOTATIONS`

#### Request
```ts
{
  type: "SAVE_PAGE_ANNOTATIONS",
  pageId: string,
  annotationData: string | null, // Serialized Excalidraw vector elements JSON
  renderedImageData?: string | null, // Base64 data URL of bounded composite image
  requestId?: string
}
```

#### Response (Success)
```ts
{
  success: true
}
```

#### Response (Failure)
```ts
{
  success: false,
  error: {
    code: "OPERATION_FAILED",
    message: string,
    operation: "SAVE_PAGE_ANNOTATIONS"
  }
}
```

#### Side Effects
- Upon successful execution with `renderedImageData`, Service Worker broadcasts `SESSION_UPDATED` event to all UI contexts to trigger thumbnail refreshes.

---

> **The communication layer should contain only messages that represent real v1 behavior. Unused, legacy, phone-upload, P2P, and OCR-progress messages are not carried into the new architecture.**


This gives us a stable communication contract to implement against while keeping the React, Service Worker, and Offscreen responsibilities clearly separated.
