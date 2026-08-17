# Snabby v1 — Overall System Flow

## 1. Purpose

This document describes the complete end-to-end flow of Snabby v1.

It explains **how a user action travels through the Chrome extension, how a screenshot becomes a stored capture, how OCR is performed, and how the captures are eventually converted into a PDF and downloaded**.

This document describes the system at a flow level.

It intentionally does **not** define the final classes, interfaces, function signatures, IndexedDB schema, constants, or folder structure. Those will be designed after the subsystem flows are understood.

---

# 2. Product Flow

The primary Snabby workflow is:

```text
User
  │
  │ Ctrl + Shift + S
  ▼
Chrome Extension Command
  │
  ▼
Capture Active Tab
  │
  ▼
Create / Identify Capture Session
  │
  ▼
Create Capture
  │
  ▼
Persist Screenshot
  │
  ▼
Image Processing
  │
  ▼
OCR Processing
  │
  ▼
Persist OCR Result
  │
  ▼
Capture Available in React UI
  │
  ├───────────────┐
  │               │
  ▼               ▼
Capture Again   Manage Captures
  │               │
  │          ┌────┴─────┐
  │          ▼          ▼
  │       Reorder     Delete
  │
  └───────────────┐
                  ▼
             Download PDF
                  │
                  ▼
           Load Session Data
                  │
                  ▼
           Generate PDF
                  │
                  ▼
          Add Screenshot Pages
                  │
                  ▼
          Add OCR Text Layer
                  │
                  ▼
              PDF Blob
                  │
                  ▼
              Download
```

---

# 3. Main Architectural Contexts

Snabby runs across multiple browser/extension contexts.

At a high level:

```text
                         Chrome Browser
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
       Service Worker     Extension UI     Offscreen
             │                │             Document
             │                │                │
             │                │                ▼
             │                │            Tesseract
             │                │
             └───────┬────────┴────────────────┘
                     │
                     ▼
              Shared Application
                  Concepts
                     │
                     ▼
                 IndexedDB
```

Each context has a different responsibility.

---

# 4. Service Worker

The service worker acts as the extension's background coordinator.

Its responsibilities include:

* Receiving the keyboard shortcut command.
* Identifying the active tab.
* Coordinating screenshot capture.
* Communicating with other extension contexts when necessary.
* Responding to extension lifecycle events.
* Routing messages between extension components where required.

The service worker should **not become the location for all Snabby business logic**.

It is an extension-runtime component.

---

# 5. React Extension UI

The React UI is responsible for presenting and interacting with the user's Snabby session.

It should handle things such as:

* Displaying captures.
* Displaying capture status.
* Reordering captures.
* Deleting captures.
* Showing OCR/processing progress.
* Initiating PDF generation.
* Initiating download.
* Displaying errors.

React should not directly implement:

* Chrome screenshot APIs.
* Tesseract internals.
* IndexedDB low-level operations.
* PDF library internals.
* Image-processing internals.

Those responsibilities belong to their respective application/infrastructure components.

---

# 6. Offscreen Document

The offscreen document exists because some operations required by Snabby cannot be performed conveniently or directly inside the service worker.

The OCR subsystem uses the offscreen document to provide a DOM-capable environment for Tesseract.js.

Conceptually:

```text
Service Worker
      │
      │ OCR request
      ▼
Offscreen Document
      │
      ▼
Tesseract.js
      │
      ▼
OCR Result
      │
      ▼
Service Worker
```

The rest of the application should not need to know the implementation details of this communication.

---

# 7. Capture Flow

## 7.1 User Initiates Capture

The user presses:

```text
Ctrl + Shift + S
```

or:

```text
Cmd + Shift + S
```

Chrome invokes the extension command.

The command is handled by the service worker.

```text
Keyboard Shortcut
       │
       ▼
Chrome Command
       │
       ▼
Service Worker
```

---

## 7.2 Identify Active Tab

The service worker determines which tab is currently active.

Conceptually:

```text
Service Worker
      │
      ▼
Active Tab
      │
      ├── tab ID
      ├── URL
      └── other available metadata
```

Only information that is actually required should be retained.

---

## 7.3 Capture Screenshot

The extension invokes the appropriate Chrome screenshot capability.

```text
Active Tab
    │
    ▼
Chrome Capture API
    │
    ▼
Screenshot
```

The screenshot is initially represented as image data.

The exact Chrome API contract will be documented in the capture subsystem design.

---

## 7.4 Create Capture

The screenshot becomes a Snabby `Capture`.

Conceptually:

```text
Screenshot
    │
    ▼
Capture
    │
    ├── capture ID
    ├── session ID
    ├── image
    ├── metadata
    ├── order
    └── processing status
```

The capture is then associated with the current capture session.

---

# 8. Session Flow

A session represents the group of screenshots that the user intends to export together.

If there is no active session:

```text
Capture Request
      │
      ▼
Create Session
      │
      ▼
Create Capture
```

If an active session already exists:

```text
Capture Request
      │
      ▼
Find Active Session
      │
      ▼
Create Capture
      │
      ▼
Add Capture to Session
```

Multiple tabs can therefore contribute captures to the same session.

Example:

```text
Session A
│
├── Tab 1 → Capture 1
├── Tab 3 → Capture 2
├── Tab 2 → Capture 3
└── Tab 1 → Capture 4
```

The session's capture ordering determines the eventual PDF page ordering.

---

# 9. Persistence Flow

The screenshot and its associated metadata need to survive React UI lifecycle changes and extension runtime changes.

Therefore, persistent application data is stored in IndexedDB.

The high-level flow is:

```text
Capture
   │
   ▼
Application Storage Interface
   │
   ▼
IndexedDB Repository
   │
   ▼
IndexedDB
```

The application should not directly depend on IndexedDB APIs throughout the codebase.

Instead, persistence is accessed through a storage abstraction.

---

# 10. IndexedDB as the Source of Persistent State

For v1:

> **IndexedDB is the primary persistent local storage mechanism for Snabby application data.**

We are not using `chrome.storage.local` as the main application database.

The database will eventually contain information representing concepts such as:

```text
Sessions
Captures
Image Assets
OCR Results
```

The exact object stores, indexes, keys, relationships, and transaction boundaries will be defined in the storage design document.

---

# 11. Image Processing Flow

After a screenshot is captured, it may need to be normalized before OCR.

The high-level pipeline is:

```text
Captured Image
      │
      ▼
Validate Image
      │
      ▼
Read Image Metadata
      │
      ▼
Normalize Image
      │
      ▼
Handle Orientation / Dimensions
      │
      ▼
OCR-ready Image
```

Image processing is deliberately treated as a separate subsystem.

OCR should receive an image in a predictable format instead of being responsible for arbitrary image normalization.

---

# 12. OCR Flow

Once the image is ready:

```text
OCR-ready Image
      │
      ▼
OCR Service
      │
      ▼
OCR Request
      │
      ▼
Offscreen Document
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
OCR Result Normalization
      │
      ▼
Snabby OCR Result
      │
      ▼
IndexedDB
```

---

# 13. OCR Result

The application should not directly use the raw Tesseract result.

Instead:

```text
Raw Tesseract Result
        │
        ▼
OCR Adapter / Normalizer
        │
        ▼
Snabby OCR Result
```

The normalized result should conceptually contain:

```text
OCR Result
│
├── Full Text
│
└── Words
     │
     ├── Text
     ├── Confidence
     └── Bounding Box
          ├── X
          ├── Y
          ├── Width
          └── Height
```

This creates a stable internal OCR representation independent of Tesseract's raw response format.

---

# 14. OCR Status Flow

OCR is asynchronous.

A capture therefore moves through OCR states.

Conceptually:

```text
OCR Not Started
      │
      ▼
OCR Processing
      │
      ├───────────────┐
      ▼               ▼
OCR Completed      OCR Failed
```

A failed OCR operation should not automatically destroy the underlying screenshot.

The screenshot remains a valid capture even when OCR processing fails.

---

# 15. Persist OCR Result

When OCR succeeds:

```text
OCR Result
    │
    ▼
OCR Repository
    │
    ▼
IndexedDB
```

The result should remain associated with the correct capture.

Conceptually:

```text
Capture
   │
   ├── Image Asset
   │
   └── OCR Result
```

The exact relationship will be defined in the IndexedDB schema.

---

# 16. React UI Synchronization

Once data is persisted, the React UI needs to reflect the current session.

Conceptually:

```text
IndexedDB
    │
    ▼
Repository
    │
    ▼
Application Layer
    │
    ▼
React State
    │
    ▼
UI
```

The React UI should represent persistent application state rather than becoming the permanent source of truth.

This is important because React components can mount, unmount, and remount.

---

# 17. Capture Management Flow

Once captures appear in the UI, the user can manage them.

## Reordering

```text
User drags capture
      │
      ▼
New Capture Order
      │
      ▼
Application Use Case
      │
      ▼
Update Session / Capture Ordering
      │
      ▼
IndexedDB
      │
      ▼
Updated UI
```

The new ordering must be persisted.

---

## Deletion

```text
User selects Delete
      │
      ▼
Delete Capture Use Case
      │
      ├── Remove capture
      ├── Remove/cleanup image
      └── Remove/cleanup OCR data
      │
      ▼
IndexedDB
      │
      ▼
Updated Session
      │
      ▼
Updated UI
```

Cleanup behavior will be formally specified in the storage subsystem design.

---

# 18. Multiple Capture Flow

The user can repeat the capture operation:

```text
Capture 1
   ↓
Capture 2
   ↓
Capture 3
   ↓
Capture 4
   ↓
...
```

Each capture goes through the common pipeline:

```text
AcquiredScreenshot
  ↓
Image Processing
  ↓
ProcessedImage
  ↓
Persist Image + Capture
  ↓
OCR
  ↓
Persist OCR
  ↓
Available in Session
```

The captures can originate from different browser tabs.

Example:

```text
Tab A
  ↓
Capture 1

Tab B
  ↓
Capture 2

Tab C
  ↓
Capture 3

Tab A
  ↓
Capture 4
```

All can belong to one session.

---

# 19. Download Flow

When the user chooses to download the session:

```text
User
 │
 │ Download
 ▼
React UI
 │
 ▼
Generate PDF Use Case
 │
 ▼
Load Session
 │
 ▼
Load Ordered Captures
 │
 ▼
Load Images
 │
 ▼
Load OCR Results
 │
 ▼
PDF Generation
```

---

# 20. PDF Generation Flow

The PDF subsystem receives the session data required to construct the document.

```text
Capture Session
      │
      ▼
Ordered Captures
      │
      ▼
For Each Capture
      │
      ├── Load Image
      │
      ├── Load OCR Result
      │
      ├── Create PDF Page
      │
      ├── Add Screenshot
      │
      └── Add OCR Text Layer
      │
      ▼
Finalize PDF
      │
      ▼
PDF Blob
```

The capture order becomes the PDF page order.

---

# 21. OCR-to-PDF Coordinate Flow

OCR bounding boxes originate in image coordinates.

The PDF uses its own coordinate system.

Therefore:

```text
OCR Bounding Box
      │
      ▼
Image Coordinates
      │
      ▼
Coordinate Transformation
      │
      ▼
PDF Coordinates
      │
      ▼
OCR Text Placement
```

This transformation is an important part of the PDF subsystem.

It must account for the relationship between:

* Screenshot dimensions
* PDF page dimensions
* Image scaling
* Position
* Text size
* Coordinate-system differences

The exact mathematical transformation will be documented separately.

---

# 22. PDF Result

When PDF generation succeeds:

```text
PDF Generator
      │
      ▼
PDF Blob
      │
      ▼
Download Service
      │
      ▼
Browser Download
```

PDF generation and file downloading are separate responsibilities.

---

# 23. Error Flow

Every major subsystem can fail.

The system should not silently fail.

High-level error flow:

```text
Subsystem
    │
    ▼
Error
    │
    ▼
Error Classification
    │
    ▼
Application Error
    │
    ▼
UI
    │
    ▼
User Feedback
```

Potential categories include:

```text
Capture Error
Storage Error
Image Processing Error
OCR Error
Extension Communication Error
PDF Generation Error
Download Error
```

The underlying technical error should be separated from the user-facing message.

---

# 24. Capture Failure

If screenshot capture fails:

```text
Capture Request
      │
      ▼
Chrome Capture
      │
      X
Capture Error
      │
      ▼
Application Error
      │
      ▼
UI Error State
```

No invalid capture should be persisted.

---

# 25. Storage Failure

If IndexedDB fails:

```text
Application
      │
      ▼
Repository
      │
      X
IndexedDB Error
      │
      ▼
Storage Error
      │
      ▼
Application
      │
      ▼
UI
```

The application should not assume that a successful in-memory operation means persistence succeeded.

---

# 26. OCR Failure

If OCR fails:

```text
Screenshot
    │
    ├── Image remains available
    │
    └── OCR → Failed
```

The capture should remain usable.

The exact PDF behavior when OCR is unavailable will be defined in the OCR/PDF subsystem requirements.

---

# 27. PDF Failure

If PDF generation fails:

```text
Session
   │
   ▼
PDF Generator
   │
   X
PDF Error
   │
   ▼
Application Error
   │
   ▼
UI
```

The capture session and its screenshots should remain intact.

The failure of PDF generation should not destroy the user's captured data.

---

# 28. End-to-End Successful Flow

Putting everything together:

```text
┌───────────────────────────────┐
│             USER              │
└───────────────┬───────────────┘
                │
                │ Ctrl + Shift + S
                ▼
┌───────────────────────────────┐
│       Chrome Command          │
└───────────────┬───────────────┘
                ▼
┌───────────────────────────────┐
│        Service Worker         │
└───────────────┬───────────────┘
                │
                │ Active Tab
                ▼
┌───────────────────────────────┐
│       Screenshot Capture      │
└───────────────┬───────────────┘
                ▼
┌───────────────────────────────┐
│       Image Processing        │
└───────────────┬───────────────┘
                ▼
┌───────────────────────────────┐
│      Persist Image + Capture  │
│          (IndexedDB)          │
└───────────────┬───────────────┘
                ▼
┌───────────────────────────────┐
│          OCR Service          │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│       Offscreen Document       │
│          Tesseract.js          │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│       Normalize OCR Result     │
└───────────────┬───────────────┘
                ▼
┌───────────────────────────────┐
│           IndexedDB           │
│        Persist OCR Result      │
└───────────────┬───────────────┘
                ▼
┌───────────────────────────────┐
│           React UI             │
│       Display Capture          │
└───────────────┬───────────────┘
                │
                │ User captures more
                │ / reorders / deletes
                │
                ▼
┌───────────────────────────────┐
│        Capture Session         │
└───────────────┬───────────────┘
                │
                │ Download
                ▼
┌───────────────────────────────┐
│        Load Session Data       │
└───────────────┬───────────────┘
                ▼
┌───────────────────────────────┐
│         PDF Generator          │
│                               │
│ Image + OCR Text Layer        │
└───────────────┬───────────────┘
                ▼
┌───────────────────────────────┐
│            PDF Blob             │
└───────────────┬───────────────┘
                ▼
┌───────────────────────────────┐
│       Browser Download         │
└───────────────────────────────┘
```

---

# 29. Responsibility Boundaries

At the end of this flow, the responsibilities can be summarized as:

| Component          | Primary Responsibility                      |
| ------------------ | ------------------------------------------- |
| Chrome Command     | Detect keyboard shortcut                    |
| Service Worker     | Extension-level coordination                |
| Capture Service    | Capture active webpage                      |
| Session Management | Manage capture sessions                     |
| Image Processing   | Prepare captured images                     |
| OCR Service        | Extract and normalize text                  |
| Offscreen Document | Provide OCR execution environment           |
| Tesseract          | Perform OCR recognition                     |
| Storage Layer      | Persist application data                    |
| IndexedDB          | Local persistent storage                    |
| React UI           | Present and interact with application state |
| PDF Generator      | Build PDF document                          |
| Download Service   | Download generated PDF                      |

These boundaries will later become the foundation for the LLD.

---

# 30. Data Flow Summary

The major data transformations are:

```text
Webpage
  ↓
Screenshot Image
  ↓
Image Processing
  ↓
Processed Image
  ↓
Stored Capture & Image
  ↓
OCR Request
  ↓
Raw OCR Result
  ↓
Normalized OCR Result
  ↓
Stored OCR Result
  ↓
Capture Session
  ↓
PDF Input
  ↓
PDF Blob
  ↓
Downloaded File
```

---

# 31. Architectural Principles Established by This Flow

The following principles are established before moving to LLD:

### 1. IndexedDB is persistent application storage

Snabby's persistent local state is stored in IndexedDB.

### 2. React is the UI layer

React is responsible for presentation and user interaction, not low-level infrastructure.

### 3. OCR is a separate subsystem

OCR implementation details are isolated behind an application-level abstraction.

### 4. Tesseract is an infrastructure detail

The rest of Snabby should not depend directly on Tesseract's raw API.

### 5. Chrome APIs are infrastructure

Application/domain logic should not be tightly coupled to Chrome API calls.

### 6. PDF generation is separate from downloading

Creating a PDF and downloading a PDF are different responsibilities.

### 7. Persistent state is not React state

React state represents the UI's current view of application data; IndexedDB is the persistent source of truth.

### 8. Captures survive processing failures

An OCR or PDF failure should not destroy the original screenshot.

### 9. Capture ordering is persistent application data

The order selected by the user must determine PDF page order.

### 10. Future capture sources should fit the same pipeline

Phone upload is not implemented in v1, but the capture pipeline should not fundamentally depend on screenshots being the only possible future input.

---

