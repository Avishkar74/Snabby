# 10 — Extension Communication Flow

## 1. Purpose

Snabby runs across multiple Chrome extension contexts. Each context has different capabilities and responsibilities.

The main communication architecture is:

```text
React UI
   │
   ↕
Service Worker
   │
   ↕
Offscreen Document
   │
   ↕
Tesseract.js
```

The purpose of this communication layer is to allow these contexts to work together without tightly coupling their implementations.

The exact v1 command/event catalog and payload schemas are defined in:

```text
18_command.message_catalog.schemas.md
```

---

# 2. Extension Contexts

Snabby primarily involves these contexts:

### React UI

Responsible for:

* User interaction.
* Showing sessions/captures.
* Starting capture/PDF operations.
* Showing operation status and errors.
* Maintaining temporary UI state.

### Service Worker

Acts as the **extension coordinator**.

Responsible for:

* Receiving commands from the UI.
* Interacting with Chrome extension APIs.
* Coordinating screenshot capture.
* Communicating with the offscreen document.
* Starting application workflows.

### Offscreen Document

Provides a document/DOM-capable environment for operations that cannot conveniently run in the service worker.

In the current architecture, this is primarily important for:

* Tesseract.js.
* OCR-related image processing.

### Tesseract Worker

Performs the actual OCR computation through Tesseract.js.

---

# 3. High-Level Communication

```text
┌──────────────┐
│   React UI   │
└──────┬───────┘
       │
       │ Chrome Runtime Message
       ▼
┌──────────────┐
│Service Worker│
└──────┬───────┘
       │
       │ Chrome Runtime Message
       ▼
┌──────────────┐
│   Offscreen  │
│   Document   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Tesseract   │
│    Worker    │
└──────────────┘
```

The service worker is the primary coordinator between extension contexts.

---

# 4. Why Communication Is Required

Chrome extension contexts are separate JavaScript environments.

For example:

```text
React memory
     ≠
Service Worker memory
     ≠
Offscreen Document memory
```

A variable created in React cannot simply be accessed from the service worker.

Communication therefore happens through explicit messages.

Persistent information is shared through:

```text
IndexedDB
```

while transient commands/results are communicated through:

```text
Chrome Runtime Messaging
```

This gives us two different communication mechanisms:

```text
Transient communication → Messages
Persistent state        → IndexedDB
```

---

# 5. React → Service Worker

When the user performs an extension-level action, React sends a message to the service worker.

For example:

```text
User clicks Capture
        │
        ▼
React
        │
        │ CAPTURE_REQUEST
        ▼
Service Worker
```

Other examples may include:

```text
START_SESSION
DELETE_CAPTURE
CHECK_OCR_STATUS
EXPORT_PDF
```

The exact v1 message catalog is defined in:

```text
18_command.message_catalog.schemas.md
```

---

# 6. Why React Does Not Directly Call Chrome APIs

We do not want:

```text
React
 ├── chrome.tabs
 ├── chrome.scripting
 ├── chrome.tabs.captureVisibleTab
 ├── chrome.offscreen
 └── chrome.downloads
```

scattered throughout React components.

Instead:

```text
React
   ↓
Application Use Case
   ↓
Extension API Adapter
   ↓
Chrome API
```

This keeps React focused on UI behavior.

---

# 7. Service Worker as Coordinator

The service worker coordinates operations that require extension-level privileges.

For example, capture may conceptually be:

```text
React
  ↓
CAPTURE_REQUEST
  ↓
Service Worker
  ↓
Chrome Capture API
  ↓
Screenshot
  ↓
Application Processing
```

The service worker does not need to contain every piece of business logic.

Its main role is to coordinate extension infrastructure and application workflows.

---

# 8. Service Worker → Offscreen Document

When OCR is dispatched, the `TesseractOCRAdapter` sends a message **directly** to the Offscreen Document via Chrome runtime messaging with a structured payload:

```text
TesseractOCRAdapter
      │
      │ chrome.runtime.sendMessage({
      │   target: 'offscreen',
      │   action: 'ocr',
      │   dataUrl: <image data URL>
      │ })
      ▼
Offscreen Document
```

The Offscreen Document filters incoming messages by `message.target === 'offscreen'` to process only messages intended for it.

---

# 9. Offscreen Document → Service Worker (Response)

After OCR completes, the Offscreen Document returns the result via the Chrome `sendResponse` callback on the same `onMessage` listener:

```text
Offscreen Document
      │
      │ sendResponse({
      │   words: OCRWord[],
      │   fullText: string,
      │   imageWidth: number,
      │   imageHeight: number
      │ })
      ▼
TesseractOCRAdapter (awaiting ChromeMessageBus.request())
```

The Chrome runtime pairs the response to the original request automatically via its internal request/response model. No application-level `requestId` is needed for this boundary.

---

# 10. Request/Response Correlation

Because operations are asynchronous, every important request should have a correlation identifier.

Conceptually:

```text
Request:

requestId = abc123
type = OCR_REQUEST
```

Response:

```text
requestId = abc123
type = OCR_RESULT
```

This allows the service worker to know:

```text
"This response belongs to this request."
```

rather than relying on message ordering.

---

# 11. Operation State Events

For v1, OCR progress percentages are not part of the React-facing message contract.

Use state events instead:

```text
CAPTURE_COMPLETE
OCR_COMPLETED
OCR_FAILED
SESSION_UPDATED
```

The React UI uses these events to refresh state without consuming OCR percentage streams.

---

# 12. Error Messages

Errors must also cross context boundaries.

For example:

```text
Offscreen Document
       │
       │ OCR_ERROR
       ▼
Service Worker
       │
       ▼
React
```

The raw browser/Tesseract error should ideally be converted into a Snabby-level error before reaching the UI.

For example:

```text
Tesseract exception
        ↓
OCR_ENGINE_ERROR
        ↓
React
        ↓
"Could not process this screenshot"
```

---

# 13. Message Categories

Conceptually, messages fall into these categories:

```text
Command
  ↓
"Do something"

Response
  ↓
"Here is the result"

Event
  ↓
"State changed"

Error
  ↓
"Operation failed"
```

For example:

```text
CAPTURE_REQUEST
CAPTURE_RESULT
CAPTURE_ERROR
```

and:

```text
OCR_REQUEST
OCR_RESULT
OCR_ERROR
```

The complete v1 catalogue is defined in:

```text
18_command.message_catalog.schemas.md
```

---

# 14. Message Contract

Messages should have a predictable structure.

Conceptually:

```text
Message
│
├── type
├── requestId
└── payload
```

For example:

```text
{
    type,
    requestId,
    payload
}
```

The exact TypeScript schemas will be defined in the later **External Contracts** document.

---

# 15. Message Validation

Messages cross security and architectural boundaries.

Therefore, the receiving context should not blindly trust arbitrary payloads.

Conceptually:

```text
Incoming Message
       │
       ▼
Validate Message
       │
   ┌───┴───┐
   │       │
 Valid   Invalid
   │       │
   ▼       ▼
Handle   Reject
```

This is particularly important for:

* message type
* request ID
* required payload fields
* expected data types

---

# 16. Communication vs Persistence

An important distinction:

### Messages

Used for:

```text
"Start OCR."
"Capture this tab."
"Here is the OCR result."
"Progress is 50%."
```

### IndexedDB

Used for:

```text
Session
Capture
Image
OCR Result
```

Therefore:

```text
Command/result → Messaging
Long-lived state → IndexedDB
```

The two mechanisms should not be mixed unnecessarily.

---

# 17. Example: Capture Communication

A simplified capture flow:

```text
React
  │
  │ CAPTURE_REQUEST
  ▼
Service Worker
  │
  │ Chrome API
  ▼
Screenshot
  │
  ▼
Image Processing
  │
  ▼
Persist Capture + Image (Atomic)
  │
  ▼
OCR
```

The service worker coordinates the extension-specific part, while application services handle the actual business workflow.

---

# 18. Example: OCR Communication

The actual v1 OCR communication flow:

```text
CaptureScreenshot (fires OCR fire-and-forget)
     │
     ▼
RunOCR Serial Queue
     │
     ▼
Service Worker decorator: await ensureOffscreenDocument()
     │
     ▼
TesseractOCRAdapter
     │  chrome.runtime.sendMessage({
     │    target: 'offscreen', action: 'ocr', dataUrl
     │  })
     ▼
Offscreen Document: Tesseract.recognize(dataUrl)
     │
     ▼ [sendResponse on same message]
TesseractOCRAdapter receives { words, fullText, imageWidth, imageHeight }
     │
     ▼
RunOCR normalizes into OCRResult
     │
     ▼
OCRRepository.save(result) + CaptureRepository.updateStatus(COMPLETED)
     │
     ▼
Service Worker decorator broadcasts:
broadcastMessage({ type: 'OCR_COMPLETED', captureId }) to all tabs/views
```

**On failure**, the decorator broadcasts `{ type: 'OCR_FAILED', captureId, error }` instead.

---

# 19. Example: React Receiving OCR State Change

```text
Tesseract
   ↓
OCR_RESULT or OCR_ERROR
   ↓
Offscreen Document
   ↓
Service Worker
   ↓
OCR_COMPLETED or OCR_FAILED event
   ↓
React
```

React therefore receives:

```text
OCR ready/failed state for a specific capture
```

without depending on Tesseract-specific internals.

---

# 20. Communication Failures

Communication can fail independently of the underlying operation.

For example:

```text
Service Worker
      │
      │ OCR_REQUEST
      X
Offscreen Document unavailable
```

This should be treated differently from:

```text
Offscreen Document
      │
      ▼
Tesseract
      X
Recognition failed
```

The error layer should preserve this distinction where it is useful for recovery/debugging.

---

# 21. Timeout Policy

For v1, OCR and PDF operations do not use an application-level hard timeout.

Long-running operations are handled asynchronously and conclude with either success or failure events/results.

---

# 22. Multiple Requests

The architecture should not assume that only one operation can ever exist.

For example:

```text
OCR Request A → requestId A
OCR Request B → requestId B
```

Responses must be matched using:

```text
requestId
```

rather than:

```text
"take the next response"
```

For v1 OCR execution policy, process one OCR job at a time (single-lane queue). Capture persistence still occurs immediately and does not wait for OCR.

---

# 23. IndexedDB Across Contexts

The extension contexts can access the same extension-origin IndexedDB database:

```text
React UI ──────────┐
                   │
Service Worker ────┼──→ IndexedDB
                   │
Offscreen ─────────┘
```

This is useful because the contexts do not need to send large persistent data through messages unnecessarily.

For example, instead of repeatedly transferring a large OCR result:

```text
Context A → huge message → Context B
```

we can persist it and communicate:

```text
"Capture 123 OCR is ready."
```

Then the receiving context can retrieve the data from IndexedDB when appropriate.

---

# 24. Large Data Transfer

Screenshots can be large.

Therefore, message passing should not become the default storage mechanism for large persistent data.

Prefer:

```text
Large data
   ↓
IndexedDB
```

and:

```text
Message
   ↓
ID / command / status
```

when the architecture allows it.

However, some operations may temporarily require image data to cross the offscreen boundary for OCR. That is an implementation detail that will be finalized in the LLD.

---

# 25. Communication Boundaries

The intended dependency direction is:

```text
React
  ↓
Application
  ↓
Extension Messaging Interface
  ↓
Service Worker
  ↓
Chrome APIs / Offscreen
```

The React layer should not know:

```text
How offscreen documents work
How Tesseract workers work
How Chrome runtime messaging works internally
```

It should only know the application-level operation it requested.

---

# 26. SOLID Considerations

The communication architecture supports the project's SOLID design.

### Single Responsibility

Message handling handles communication.

OCR handles OCR.

Capture handles capture.

### Dependency Inversion

Application code depends on communication abstractions rather than directly on Chrome runtime APIs.

### Interface Segregation

Different operations can expose focused interfaces rather than one giant extension API.

### Open/Closed

A different implementation of an infrastructure adapter can theoretically be introduced without changing application-level logic.

---

# 27. Communication Invariants

1. Every asynchronous request can be correlated with its response.
2. Message payloads are validated before processing.
3. Chrome-specific messaging is isolated from React components.
4. Persistent data belongs in IndexedDB, not arbitrary runtime memory.
5. Large data is not transferred through messages unnecessarily.
6. Communication failures are distinguishable from processing failures.
7. OCR and PDF do not rely on application-level hard timeouts in v1.
8. UI components do not directly depend on the offscreen document or Tesseract.

---

# 28. Remaining Implementation Details

The following implementation details are finalized:

1. **Listener registration**: The Service Worker uses `chrome.runtime.onMessage.addListener`. The Offscreen Document uses the same API, filtering by `message.target === 'offscreen'`. React uses `chrome.runtime.onMessage.addListener` for event broadcasts.
2. **Image data transport**: The `TesseractOCRAdapter` converts the image Blob to a DataURL inside the Service Worker and sends it to the Offscreen Document via `chrome.runtime.sendMessage`. No shared memory API is used.
3. **Message routing**: The Service Worker acts as a message router. React-originated commands are dispatched to use case handlers. Broadcasts are sent to all contexts via `broadcastMessage()` (iterates over `chrome.runtime.getContexts` and sends to each).
4. **Error codes**: Errors are thrown as domain exceptions (`DomainError`, `ValidationError`, `SessionNotFoundError`, etc.) and serialized to a `{ type, message }` envelope when crossing the messaging boundary.

---

# 29. Page Editor Commands

The Page Editor introduces two dedicated commands between the React UI and Service Worker:

### `GET_PAGE_EDITOR_IMAGE`
- **Direction**: React UI ──► Service Worker
- **Purpose**: Retrieves original screenshot base64 Data URL and existing `annotationData` for initializing Excalidraw.
- **Handler**: `GetPageEditorImage` use case.

### `SAVE_PAGE_ANNOTATIONS`
- **Direction**: React UI ──► Service Worker
- **Purpose**: Persists serialized vector `annotationData` and the newly rendered bounded image Data URL (`renderedImageData`).
- **Handler**: `SavePageAnnotations` use case. Triggers `SESSION_UPDATED` broadcast to refresh UI thumbnails.

---

# 30. Final Communication Flow

```text
                         ┌─────────────┐
                         │   React UI  │
                         └──────┬──────┘
                                │
                         Commands / Results
                         (Capture / Edit / PDF)
                                │
                                ▼
                      ┌──────────────────┐
                      │  Service Worker  │
                      │                  │
                      │  Coordinator     │
                      └───────┬──────────┘
                              │
                      Chrome Runtime Message
                              │
                              ▼
                      ┌──────────────────┐
                      │ Offscreen Document│
                      │                  │
                      │ OCR Environment  │
                      └───────┬──────────┘
                              │
                              ▼
                       ┌─────────────┐
                       │  Tesseract  │
                       │   Worker    │
                       └─────────────┘
```

Persistent state is separate:

```text
React ────────────┐
Service Worker ───┼──→ IndexedDB
Offscreen ────────┘
```

> **Core principle:** Chrome messaging is used for transient commands, results/events, and coordination between extension contexts, while IndexedDB remains the persistent source of truth. Each context exposes only the capabilities required by the layer above it.
