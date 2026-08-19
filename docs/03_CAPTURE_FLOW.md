# Snabby v1 — Capture Flow

## 1. Purpose

This document defines how Snabby captures a screenshot from the currently active browser tab and turns it into a Snabby capture.

The capture subsystem is the **entry point of the main Snabby workflow**.

Its responsibility ends when a valid screenshot has been captured and handed over to the application pipeline for persistence and further processing.

It does not own:

* OCR
* PDF generation
* IndexedDB implementation
* React UI rendering
* PDF downloading

Those are separate subsystems.

---

# 2. Capture Responsibility

The capture subsystem is responsible for:

1. Receiving a capture request.
2. Identifying the target browser tab.
3. Validating whether the target can be captured.
4. Requesting a screenshot from Chrome.
5. Receiving the screenshot image data.
6. Validating the captured image.
7. Creating a Snabby capture representation.
8. Associating the capture with a session.
9. Handing the capture to the persistence/application pipeline.
10. Reporting success or failure.

The capture subsystem should not decide how OCR or PDF generation works.

---

# 3. Capture Entry Points

For v1, the primary entry point is the keyboard shortcut.

```text
Windows / Linux

Ctrl + Shift + S
```

```text
macOS

Cmd + Shift + S
```

The high-level flow is:

```text
User
 │
 │ Keyboard Shortcut
 ▼
Chrome Command
 │
 ▼
Service Worker
 │
 ▼
Capture Request
 │
 ▼
Capture Active Tab
```

The shortcut is therefore only the **trigger**.

The actual screenshot capture is performed through the extension's capture pipeline.

---

# 4. High-Level Capture Flow

```text
┌───────────────────────────┐
│           User            │
└─────────────┬─────────────┘
              │
              │ Ctrl/Cmd + Shift + S
              ▼
┌───────────────────────────┐
│     Chrome Extension      │
│         Command           │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│       Service Worker      │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│     CaptureScreenshot     │
│         Use Case          │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│      CaptureAdapter       │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│   ChromeCaptureAdapter    │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│   chrome.tabs.capture-    │
│       VisibleTab()        │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│    AcquiredScreenshot     │
└───────────────────────────┘
```

---

# 5. Capture Request

The capture subsystem begins with a capture request.

Conceptually:

```text
CaptureRequest
```

contains the information necessary to determine what should be captured.

At minimum, the system needs to know the target tab.

The request schema is defined by the input properties of the capture use case.

---

# 6. Keyboard Shortcut Flow

The keyboard shortcut is registered as a Chrome extension command.

The flow is:

```text
Keyboard
   │
   ▼
Chrome
   │
   ▼
Extension Command
   │
   ▼
Service Worker Event Handler
   │
   ▼
Capture Use Case
```

The service worker acts as the bridge between the browser's extension command system and Snabby's application capture flow.

The command handler should remain small.

It should primarily:

1. Receive the command.
2. Determine the relevant tab.
3. Invoke the capture operation.
4. Handle/report errors.

It should not contain the entire capture implementation.

---

# 7. Identifying the Active Tab

After receiving the capture request, Snabby must determine the currently active browser tab.

Conceptually:

```text
Capture Request
      │
      ▼
Get Active Tab
      │
      ▼
Active Tab
```

The tab may provide information such as:

```text
Tab
├── tab ID
├── window ID
├── URL
├── title
└── other Chrome metadata
```

Only metadata required by Snabby should be retained.

The exact metadata stored with a capture will be decided during the data-model design.

---

# 8. Target Tab Validation

Before requesting the screenshot, the capture flow should verify that the target tab is a valid capture target.

Possible invalid situations include browser/extension pages or other pages where Chrome does not permit the requested capture operation.

The important architectural rule is:

> **Capture availability must be determined by the actual Chrome capture operation and its permissions/capabilities rather than by assumptions in the UI.**

If the target cannot be captured, the capture operation should fail cleanly.

No incomplete capture should be persisted.

---

# 9. Screenshot Capture

Once the target tab has been identified and validated, Snabby requests the screenshot from Chrome.

Conceptually:

```text
Active Tab
    │
    ▼
Chrome Capture API
    │
    ▼
Image Data
```

The exact Chrome API and its parameters will be documented in the infrastructure design.

The capture implementation should be isolated behind a Snabby-level abstraction.

Conceptually:

```text
Application
     │
     ▼
Screenshot Capture Interface
     │
     ▼
Chrome Capture Adapter
     │
     ▼
Chrome API
```

This prevents the rest of the application from directly depending on Chrome APIs.

---

# 10. Why an Adapter Is Used

The application should not contain code such as:

```text
Application Logic
      ↓
chrome.tabs....
      ↓
chrome.tabs.captureVisibleTab(...)
```

Instead:

```text
Application Logic
      ↓
Capture Interface
      ↓
Chrome Capture Adapter
      ↓
Chrome API
```

This creates a boundary between:

* Snabby application logic
* Chrome-specific implementation

It also makes the capture subsystem easier to test.

---

# 11. Screenshot Result

The Chrome capture operation returns image data.

The captured image becomes the raw input to Snabby's capture pipeline.

Conceptually:

```text
Chrome
  │
  ▼
Raw Screenshot
  │
  ├── image data
  └── dimensions / metadata derived as needed
```

The exact representation of the image at each stage will be defined later.

We should avoid deciding prematurely that every stage must use the same representation.

For example:

```text
Data URL
Blob
ImageBitmap
Canvas
```

may each be appropriate at different stages.

The subsystem design will establish the correct boundaries.

---

# 12. Image Validation

After receiving the screenshot, Snabby should verify that the result is usable.

Validation should ensure that:

* image data exists
* the image can be decoded/processed
* dimensions are valid
* the capture is not obviously empty/corrupt

Conceptually:

```text
Screenshot Data
      │
      ▼
Validate
      │
   ┌──┴──┐
   │     │
Valid   Invalid
   │     │
   ▼     ▼
Continue Error
```

An invalid image must not be persisted as a successful capture.

---

# 13. Creating the Capture

A successful screenshot is transformed into a Snabby capture.

The capture is a domain-level concept.

Conceptually:

```text
Screenshot
    │
    ▼
Capture
```

A capture should contain or reference information such as:

```text
Capture
│
├── id
├── sessionId
├── image reference
├── source information
├── capturedAt
├── dimensions
├── order
├── processing status
└── OCR status
```

This is a conceptual model only.

The exact TypeScript representation is declared as `Capture` inside [Capture.ts](file:///d:/Resume%20projects/Snabby/src/domain/capture/Capture.ts).

---

# 14. Capture ID

Every capture must have a unique identifier.

The ID allows the rest of Snabby to refer to a particular capture without depending on:

* array position
* browser tab ID
* timestamp
* database insertion order

For example:

```text
Session
│
├── Capture ID: C1
├── Capture ID: C2
└── Capture ID: C3
```

The exact ID-generation strategy will be decided during the data-model design.

---

# 15. Capture Timestamp

Each capture should record when it was created.

This allows Snabby to distinguish:

```text
Capture A → 10:01
Capture B → 10:03
Capture C → 10:08
```

The timestamp can also be useful for:

* debugging
* session history
* ordering decisions
* future features

The timestamp should represent the actual capture event rather than a later UI operation.

---

# 16. Source Metadata

Where available and useful, the capture may retain source information such as:

```text
Source
├── tab ID
├── URL
├── page title
└── window ID
```

The purpose is to provide context about where the screenshot originated.

However, the screenshot itself remains the primary capture artifact.

We should not persist browser metadata simply because Chrome exposes it.

Only information with a clear product or debugging purpose should be retained.

---

# 17. Session Association

A capture is not an isolated object in Snabby.

It belongs to a capture session.

The flow is:

```text
Capture
   │
   ▼
Find/Create Session
   │
   ▼
Associate Capture
```

If there is an existing active session:

```text
Active Session
      │
      ▼
Add Capture
```

If no appropriate session exists:

```text
No Active Session
      │
      ▼
Create Session
      │
      ▼
Add Capture
```

Active-session rule for v1:

```text
Exactly one session is active at a time.
```

New captures are always associated with that active session. If no active session exists, one is created and then used.

---

# 18. Multiple Tabs

The capture mechanism must not assume that all screenshots come from the same tab.

Example:

```text
Tab A
 │
 └── Capture 1
        │
        ▼
     Session 1

Tab B
 │
 └── Capture 2
        │
        ▼
     Session 1

Tab C
 │
 └── Capture 3
        │
        ▼
     Session 1
```

The browser tab is the **source of the capture**, not the identity of the session.

This distinction is important.

---

# 19. Repeated Captures From One Tab

The same tab can also produce multiple captures.

Example:

```text
Tab A
 │
 ├── Capture 1
 ├── Capture 2
 └── Capture 3
```

Each capture receives its own unique identity.

The captures must not overwrite each other.

The session determines their ordering.

---

# 20. Capture Ordering

When a capture is added to a session, it receives an order position.

Example:

```text
Session 1

Order 0 → Capture A
Order 1 → Capture B
Order 2 → Capture C
```

If another capture is added:

```text
Order 3 → Capture D
```

The ordering determines:

* UI presentation order
* PDF page order

The order is application data and must eventually be persisted in IndexedDB.

---

# 21. Persistence Boundary

After the capture object has been created, it is handed to the persistence/application pipeline.

Conceptually:

```text
Capture
   │
   ▼
Capture Repository
   │
   ▼
IndexedDB
```

The capture subsystem should not directly manipulate IndexedDB internals.

Instead, the dependency should look like:

```text
Capture Use Case
      │
      ▼
Capture Repository Interface
      │
      ▼
IndexedDB Repository
```

This keeps storage implementation separate from capture behavior.

---

# 22. Capture Persistence

Persistence may involve more than one piece of data.

Conceptually:

```text
Capture
   │
   ├── Capture metadata
   │
   └── Image asset
```

Depending on the final IndexedDB design, these may be stored together or separately.

The important requirement is that they remain correctly associated.

The final transaction strategy will be defined in:

```text
07_STORAGE_INDEXEDDB_FLOW.md
```

---

# 23. Capture Persistence and Processing Flow

Once the screenshot is acquired and processed, the image and capture metadata are persisted atomically, followed by downstream OCR processing.

```text
AcquiredScreenshot
   │
   ▼
Image Processing
   │
   ▼
ProcessedImage
   │
   ▼
Persist Image + Capture
   │
   ▼
OCR
```

The capture subsystem itself does not need to know the internal implementation of those stages.

This separation allows:

```text
Capture
     ↓
Processing Pipeline
```

rather than:

```text
Capture
     ↓
Capture function contains
image processing + OCR + storage + PDF...
```

---

# 24. Why Capture and OCR Are Separate

A screenshot can exist without successful OCR.

Therefore:

```text
Screenshot Capture
```

and:

```text
OCR Processing
```

must be independent operations.

For example:

```text
Capture successful
      │
      ▼
Screenshot stored
      │
      ▼
OCR fails
```

The correct result is:

```text
Capture = valid
OCR = failed
```

not:

```text
Capture = lost
```

This separation also allows OCR to potentially be retried later.

---

# 25. Capture State

A capture moves through several conceptual states.

A simplified model is:

```text
Requested
    │
    ▼
Capturing
    │
    ├───────────────┐
    ▼               ▼
Captured          Failed
    │
    ▼
Persisted
    │
    ▼
Processing
```

The exact state machine will be defined later.

The important distinction is between:

* capture requested
* capture in progress
* capture succeeded
* capture failed
* capture persisted
* downstream processing

---

# 26. Successful Capture Flow

The successful path is:

```text
User
 │
 │ Ctrl/Cmd + Shift + S
 ▼
Chrome Command
 │
 ▼
Service Worker
 │
 ▼
Identify Active Tab
 │
 ▼
Validate Target
 │
 ▼
Chrome Capture API
 │
 ▼
Screenshot
 │
 ▼
Validate Image
 │
 ▼
Create Capture
 │
 ▼
Find/Create Session
 │
 ▼
Assign Capture Order
 │
 ▼
Persist Capture
 │
 ▼
Begin Processing Pipeline
```

At this point, the capture subsystem has completed its responsibility.

---

# 27. Capture Failure Flow

If Chrome cannot capture the target:

```text
Capture Request
      │
      ▼
Chrome Capture API
      │
      X
Capture Failure
      │
      ▼
Classify Error
      │
      ▼
Return Application Error
      │
      ▼
UI / Caller
```

No successful capture should be created from an unsuccessful screenshot operation.

---

# 28. Image Validation Failure

If Chrome returns unusable image data:

```text
Screenshot
    │
    ▼
Image Validation
    │
    X
Invalid
    │
    ▼
Capture Failure
```

The invalid image should not be persisted as a normal capture.

---

# 29. Persistence Failure

A screenshot may be successfully captured but fail to persist.

```text
Chrome Capture
      │
      ▼
Valid Screenshot
      │
      ▼
Create Capture
      │
      ▼
Persist
      │
      X
IndexedDB Error
```

This must not be reported as a fully successful capture.

The application needs to distinguish:

```text
Screenshot captured successfully
```

from:

```text
Capture successfully persisted
```

This distinction becomes particularly important because IndexedDB is now the persistent source of truth.

---

# 30. Retry Considerations

The capture subsystem should distinguish errors that are potentially retryable from errors that are not.

For example:

```text
Transient / retryable
        ↓
Try again

Invalid target
        ↓
Do not blindly retry

Invalid image
        ↓
Capture again

Storage failure
        ↓
Potential retry
```

The exact retry policy will be defined during application error-handling design.

---

# 31. Capture Does Not Generate the PDF

The capture subsystem ends before PDF generation.

The complete relationship is:

```text
Capture
   │
   ▼
Session
   │
   ▼
Processing
   │
   ▼
User Management
   │
   ▼
PDF Generation
```

This is important for maintaining single responsibility.

A capture operation should never need to know that a PDF will eventually be generated.

---

# 32. Capture Does Not Own the UI

The capture subsystem should not directly manipulate React components.

Instead:

```text
Capture Use Case
       │
       ▼
Application State
       │
       ▼
React UI
```

React observes the application state and renders the appropriate state.

This prevents browser APIs and capture logic from becoming tightly coupled to UI components.

---

# 33. Capture Does Not Own IndexedDB

Similarly:

```text
Capture Service
      │
      ▼
Repository Interface
      │
      ▼
IndexedDB Implementation
```

The capture service should not know:

```text
objectStore
transaction
IDBRequest
IDBObjectStore
```

Those belong to the IndexedDB infrastructure layer.

---

# 34. Capture Subsystem Boundaries

The capture subsystem can therefore be viewed as:

```text
                 CAPTURE SUBSYSTEM

       ┌─────────────────────────────┐
       │       Capture Use Case      │
       └──────────────┬──────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
  Active Tab Provider       Capture Interface
                                  │
                                  ▼
                         Chrome Capture Adapter
                                  │
                                  ▼
                              Chrome API
                                  │
                                  ▼
                            Screenshot
                                  │
                                  ▼
                         Image Validation
                                  │
                                  ▼
                              Capture
                                  │
                                  ▼
                         Session Association
                                  │
                                  ▼
                         Capture Repository
                                  │
                                  ▼
                             IndexedDB
```

The exact names shown here are **conceptual responsibilities**, not final class names.

---

# 35. Input and Output

At the subsystem level:

### Input

```text
Capture Request
```

which identifies the capture operation and, where necessary, the target tab.

### External Input

```text
Active Browser Tab
```

provided by Chrome.

### Output

A successfully persisted Snabby capture:

```text
Capture
    +
Associated Image
    +
Session Association
    +
Capture Order
```

### Failure Output

A classified capture error.

---

# 36. Capture Data Lifecycle

The image follows this lifecycle:

```text
Browser Page
    │
    ▼
Chrome Screenshot
    │
    ▼
Raw Image Data
    │
    ▼
Validated Image
    │
    ▼
Capture Asset
    │
    ▼
IndexedDB
    │
    ├───────────────┐
    ▼               ▼
Image Processing    React UI
    │
    ▼
OCR
```

The same persisted capture can therefore be consumed by multiple downstream parts of the application.

---

# 37. Important Design Decisions

The capture design establishes the following decisions:

### Decision 1 — Capture is a domain operation

A screenshot becomes a Snabby `Capture`, rather than remaining a raw browser image.

### Decision 2 — Chrome APIs are isolated

Chrome-specific APIs are accessed through infrastructure adapters.

### Decision 3 — Session is separate from tab

A browser tab identifies the source of a capture; it does not define the capture session.

### Decision 4 — Capture identity is independent of ordering

A capture ID identifies the capture permanently; its order can change.

### Decision 5 — Persistence happens before downstream processing

The captured image should be safely persisted before relying on later OCR/PDF operations.

### Decision 6 — OCR is independent of capture

A successful screenshot remains valid even if OCR fails.

### Decision 7 — IndexedDB owns persistence

The capture subsystem uses a repository abstraction rather than directly manipulating IndexedDB.

### Decision 8 — UI is separated from capture logic

React displays capture state but does not implement the capture mechanism.

---

# 38. Capture Decisions Finalized

The following decisions are now finalized:

1. **Capture ID Generation**: Branded nominal string IDs generated via `crypto.randomUUID()`.
2. **Session Creation Rules**: A new capture session is initialized explicitly or dynamically matching the use cases (`CreateSession` / `GetSession`).
3. **Capture Ordering**: Represented via a numeric `order` field on Capture, sorted natively using the compound index `sessionId_order`.
4. **IndexedDB Object Stores**: Conceptual structure mapped to stores: `sessions`, `captures`, `images`, and `ocrResults`.
5. **Transaction Boundaries**: Cascade transactions handled atomically within repository implementations.
6. **Error Taxonomy**: Handled via:
   - Domain validation/not-found errors (`ValidationError`, `SessionNotFoundError`)
   - Infrastructure database failures (`DatabaseError`)
   - Application capture failures (`CaptureError` extending native `Error` defined in the application layer)
7. **Chrome Screenshot API**: Finalized as `chrome.tabs.captureVisibleTab()` without `windowId`, targeting the active viewport of the current window.
8. **Permissions**: Finalized as `activeTab`.
9. **Active-Tab Resolution**: Handled natively by Chrome capture API; no separate `ActiveTabProvider` application interface is required.
10. **FULL_SCREEN Viewport**: Maps directly to the visible viewport of the active tab (not the entire scrollable webpage).
11. **Image Representation**: Data URL string from Chrome API converted directly into a binary `Blob` inside `ChromeCaptureAdapter`.

## 38.2 Open Questions and Implementation Resolution

1. **Retry Policy**: Recovery behavior for failed API screenshot attempts.

# 39. Final Capture Flow

The final conceptual flow for Snabby v1 Capture Stage 1 is:

```text
                    USER
                      │
                      │ Ctrl/Cmd + Shift + S (Popup or Shortcut Trigger)
                      ▼
              Chrome Command
                      │
                      ▼
               Service Worker
                      │
                      ▼
              Capture Request (sessionId, captureMode)
                      │
                      ▼
              CaptureScreenshot (Use Case)
                      │
                      ▼
              CaptureAdapter (Interface)
                      │
                      ▼
             ChromeCaptureAdapter (Infrastructure)
                      │
                      ▼
             chrome.tabs.captureVisibleTab()
                      │
                      ▼
              Screenshot dataUrl string
                      │
                      ▼
             Convert to binary Blob
                      │
                      ▼
             AcquiredScreenshot produced
```

The key boundary is:

> **Capture Stage 1 produces a valid, in-memory AcquiredScreenshot. Downstream persistence, processing, and OCR follow in later stages.**

Implementation status: Session Management and Image Processing have now been finalized and implemented.
