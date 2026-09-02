# 11 — React UI Flow

## 1. Purpose

This document defines how the **existing finalized Snabby UI** will be implemented using React and how it communicates with the application layer.

The UI design itself is already finalized. This document focuses on:

* React component responsibilities.
* UI state.
* User interactions.
* Communication with application services.
* Loading persisted data.
* Showing capture/OCR/PDF states.
* Handling errors.

The UI must **not contain business logic or direct IndexedDB/Chrome API calls**.

---

# 2. UI Architecture

The intended flow is:

```text
React Components
       ↓
UI State / Hooks
       ↓
Application Use Cases
       ↓
Services
       ↓
Repositories / Browser Adapters
       ↓
IndexedDB / Chrome APIs
```

For example:

```text
Click "Start Capture"
        ↓
React Event Handler
        ↓
Capture Use Case
        ↓
Chrome Capture Adapter
        ↓
Screenshot
```

---

# 3. Final UI States

The existing UI essentially has two major screens/states.

### New Session

```text
┌─────────────────────────┐
│        Snabby            │
├─────────────────────────┤
│ Start a New Session      │
│                          │
│ Session Name             │
│ [.....................]  │
│                          │
│ [ Start Capture Session ]│
│                          │
│ Full Screen | Crop       │
└─────────────────────────┘
```

### Active Session

```text
┌─────────────────────────┐
│        Snabby            │
├─────────────────────────┤
│ session name             │
│ X captured               │
│                          │
│ [ Upload ] [Capture]     │
│                          │
│ Capture cards            │
│                          │
│ [ Download PDF ]         │
└─────────────────────────┘
```

For v1:

```text
Phone Upload
     ❌
```

The upload/phone functionality is postponed.

The existing UI layout and visual design remain unchanged otherwise.

---

# 4. React Component Structure

The exact folder structure will be defined later, but conceptually:

```text
App
│
├── Header
│
├── NewSessionView
│   ├── SessionNameInput
│   ├── CaptureModeSelector
│   └── StartSessionButton
│
└── ActiveSessionView
    ├── SessionHeader
    ├── CaptureControls
    ├── CaptureList
    │   └── CaptureCard
    └── DownloadButton
```

Additional components may exist for:

* Capture preview/lightbox.
* Delete confirmation.
* Loading states.
* Error states.
* OCR/PDF operation status.

These are implementation details, not new UI designs.

---

# 5. React State

React should maintain **temporary UI/application state**, not become the permanent data store.

Conceptually:

```text
React State
│
├── current screen
├── session data
├── capture list
├── selected capture
├── active operation
├── operation status
└── UI errors
```

Persistent data remains in:

```text
IndexedDB
```

---

# 6. Initial Application Flow

When the React UI opens:

```text
React Mount
    ↓
Initialize Application
    ↓
Initialize Storage
    ↓
Load Existing Session / State
    ↓
Set React State
    ↓
Render UI
```

If there is no active session:

```text
React
  ↓
No Session
  ↓
New Session Screen
```

If an active session exists:

```text
React
  ↓
Session Found
  ↓
Load Captures
  ↓
Active Session Screen
```

Session restoration policy for v1 is fixed: restore the single persisted ACTIVE session when present.

---

# 7. New Session Flow

The user enters a session name and starts a session.

```text
User enters name
       ↓
React State
       ↓
Click "Start Capture Session"
       ↓
Create Session Use Case
       ↓
Persist Session
       ↓
Update React State
       ↓
Active Session UI
```

The React component does not directly create an IndexedDB record.

---

# 8. Capture Mode Selection

The finalized UI provides capture modes such as:

```text
Full Screen
Crop Region
```

React only maintains the selected mode:

```text
captureMode = FULL_SCREEN
```

or:

```text
captureMode = CROP_REGION
```

When the user captures:

```text
React
  ↓
Capture Use Case
  ↓
Selected Capture Mode
  ↓
Service Worker / Chrome APIs
```

The actual screenshot logic remains outside React.

---

# 9. Capture Flow From React

```text
Click Capture
      ↓
React Event Handler
      ↓
Capture Use Case
      ↓
Service Worker
      ↓
Chrome Capture API
      ↓
Screenshot
      ↓
Image Processing
      ↓
Persist Capture + Image (Atomic)
      ↓
OCR
      ↓
Application State Update
      ↓
React Re-render
```

React only coordinates the user action and displays the resulting state.

---

# 10. Capture List

The active session displays captures as cards.

Conceptually:

```text
ActiveSession
    │
    ▼
CaptureList
    │
    ├── CaptureCard #1
    ├── CaptureCard #2
    ├── CaptureCard #3
    └── ...
```

Each card can display information such as:

* Screenshot preview.
* Capture number.
* Page/title information where available.
* Relevant capture metadata.

The card should receive data through props rather than querying IndexedDB itself.

---

# 11. Capture Preview

When the user opens a capture:

```text
Capture Card
     ↓
Select Capture
     ↓
React State
     ↓
Preview / Lightbox
```

The preview is a UI concern.

The underlying image remains stored independently.

---

# 12. Delete Capture

When a user deletes a capture:

```text
Click Delete
      ↓
React Event
      ↓
Delete Capture Use Case
      ↓
Repository
      ↓
IndexedDB
      ↓
Success
      ↓
Update React State
      ↓
Capture disappears
```

React should only remove the capture from its displayed state **after the persistence operation succeeds**.

---

# 13. Session Deletion

The session delete action follows a similar flow:

```text
Delete Session
      ↓
React
      ↓
Delete Session Use Case
      ↓
IndexedDB
      ↓
Remove Session + Dependencies
      ↓
React State Reset
      ↓
New Session Screen
```

The UI should not manually delete individual database records.

---

# 14. Capture Updates

After a capture is successfully persisted:

```text
Capture Created
      ↓
Application State Updated
      ↓
React receives new state
      ↓
CaptureList re-renders
```

React should not need to reload the entire application unnecessarily.

---

# 15. OCR State in UI

OCR is asynchronous.

The UI may therefore represent states such as:

```text
OCR_NOT_STARTED
OCR_PROCESSING
OCR_COMPLETED
OCR_FAILED
```

For example:

```text
Capture
   │
   ├── Image ✓
   └── OCR Processing...
```

or:

```text
Capture
   │
   ├── Image ✓
   └── OCR Ready
```

The exact visual representation is part of the finalized UI/UX and should not be redesigned during implementation.

---

# 16. OCR Progress

For v1, OCR percentage/progress is not displayed in the React UI.

React synchronizes via meaningful state events, for example:

```text
CAPTURE_COMPLETE
OCR_COMPLETED
OCR_FAILED
SESSION_UPDATED
```

When the user clicks Download PDF and OCR is incomplete, React presents the Wait vs Download Now decision flow.

---

# 17. PDF Generation From React

When the user clicks:

```text
Download PDF
```

the UI initiates:

```text
React
   ↓
Generate PDF Use Case
   ↓
Load Session Data
   ↓
PDF Generator
   ↓
PDF Blob
   ↓
Download Service
   ↓
Browser Download
```

The React component should not construct the PDF.

---

# 18. PDF Button State

The download button should reflect the operation state.

Conceptually:

```text
READY
  ↓
GENERATING
  ↓
DOWNLOADING
  ↓
COMPLETED
```

Failure:

```text
GENERATING
     ↓
FAILED
```

The exact labels/visual feedback should follow the already-finalized UI.

---

# 19. Loading State

React needs to distinguish between:

```text
Application is loading
```

and:

```text
Application has no data
```

For example:

```text
Loading
   ↓
IndexedDB read
   ↓
No session
```

is different from immediately assuming:

```text
No session
```

before the database has finished loading.

---

# 20. Error State

Errors should travel upward as application-level errors.

Example:

```text
IndexedDB Error
      ↓
Storage Service
      ↓
Application Error
      ↓
React
      ↓
User-facing Error State
```

React should not need to interpret raw:

```text
DOMException
```

or:

```text
Tesseract error object
```

---

# 21. React and IndexedDB

The relationship should be:

```text
React
  ↓
Use Case
  ↓
Repository
  ↓
IndexedDB
```

Never:

```text
React
  ↓
indexedDB.open()
```

This keeps components simple and testable.

---

# 22. React and Chrome APIs

Similarly:

```text
React
  ↓
Use Case
  ↓
Chrome Adapter
  ↓
Chrome API
```

React should not directly depend on:

```text
chrome.tabs
chrome.runtime
chrome.downloads
chrome.offscreen
```

except where a very small integration boundary explicitly requires it.

The preferred architecture keeps these browser APIs in infrastructure adapters.

---

# 23. React Hooks

Hooks can be used to connect React components to application services.

Conceptually:

```text
useSession()
useCaptures()
useCapture()
usePdfGeneration()
```

Their purpose is to expose application state/actions to components without putting business logic inside components.

For example:

```text
Component
    ↓
useSession()
    ↓
Session Use Case
```

Exact hooks will be defined during the LLD.

---

# 24. State Ownership

A useful ownership rule is:

### Component state

For purely local UI state:

```text
selected capture
input value
modal open/closed
```

### Application state

For session-level state:

```text
current session
captures
processing states
PDF generation state
```

### IndexedDB

For persistent data:

```text
sessions
captures
images
OCR results
```

---

# 25. Data Flow Direction

The preferred direction is:

```text
User Action
     ↓
React Event
     ↓
Use Case
     ↓
Infrastructure
     ↓
Persistent State
     ↓
Application State
     ↓
React
```

Not:

```text
Component
   ↕
IndexedDB
   ↕
Chrome APIs
   ↕
Other Component
```

This keeps the architecture understandable.

---

# 26. React Re-rendering

React should re-render when relevant application state changes.

For example:

```text
Before:

0 captures
```

After successful capture:

```text
1 capture
```

The state update causes:

```text
CaptureList
     ↓
Re-render
     ↓
New CaptureCard
```

The component should not manually manipulate DOM elements to display the new capture.

---

# 27. UI State vs Domain State

This distinction is important.

Example:

```text
isDeleteDialogOpen = true
```

is UI state.

Whereas:

```text
capture.status = "OCR_COMPLETED"
```

is application/domain state.

They should not be mixed into one giant state object.

---

# 28. Final React Flow

```text
                         React UI
                            │
                ┌───────────┼───────────┐
                │           │           │
                ▼           ▼           ▼
             Session      Capture       PDF
             Actions      Actions      Actions
                │           │           │
                └───────────┼───────────┘
                            ▼
                     Application Layer
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
          Storage         Capture          PDF
          Repos           Services        Service
             │              │              │
             ▼              ▼              ▼
         IndexedDB      Chrome APIs      PDF/Download
```

---

# 29. Important Invariants

1. React does not directly access IndexedDB.
2. React does not directly perform OCR.
3. React does not construct PDFs.
4. React does not directly manage Chrome infrastructure.
5. Persistent data lives in IndexedDB.
6. UI state lives in React/application state.
7. Capture order displayed by React comes from persisted session order.
8. Failed persistence operations must not be represented as successful UI state.
9. OCR/PDF progress is runtime state unless there is a specific reason to persist it.
10. The existing UI design remains unchanged.

---

# 30. V1 UI Scope

The following are explicitly implemented and supported in current v1:

```text
✓ New session
✓ Session naming
✓ Full-screen / visible viewport capture
✓ Crop-region capture (interactive drag overlay + DPR coordinate scaling)
✓ Single active session per browser profile
✓ Multiple captures with order tracking
✓ Capture previews & thumbnail grid
✓ Lightbox preview with keyboard navigation (Arrows / Esc)
✓ Capture deletion
✓ Session deletion / termination
✓ PDF generation (pdf-lib, 1:1 image sizing with 10pt border)
✓ PDF download (Chrome Downloads API)
✓ Session auto-termination upon confirmed download
✓ OCR processing (Tesseract.js in Offscreen Document)
✓ OCR completion/failure real-time badge updates
✓ OCR pending decision modal (Export now vs Wait for OCR vs Cancel)
✓ Page vector editing & annotation modal (Excalidraw inside Shadow DOM)
✓ Bounded image rendering & side panel thumbnail auto-refresh
✓ Shadow DOM CSS isolation (#wsn-root)
✓ Floating draggable mascot button
✓ Right-side sliding panel
```

Not part of v1 (displayed options disabled or omitted):

```text
✗ Phone upload via QR
✗ Storage-limit memory bar polling
```

---

# 31. Component & Hook Architecture Map

| Component / Hook | File Path | Responsibility | Boundary / Dependencies |
| :--- | :--- | :--- | :--- |
| **Mounting Root** | `src/main.tsx` | Injects `#wsn-root`, creates open Shadow DOM, injects `App.css`, creates root React container, initializes `ChromeMessageBus`. | DOM, React, `ChromeMessageBus` |
| **Main App Container** | `src/app/App.tsx` | Hosts mascot SVG logo, coordinates active/new session view switching, lightbox, PageEditor modal, and toast container. | `useSession`, `useCaptures`, `usePdfExporter`, `MessageBusContext` |
| **Message Context** | `src/app/providers/MessageBusContext.tsx` | Supplies `MessageBus` implementation via React context. | React Context, `MessageBus` |
| **Session Hook** | `src/features/session/hooks/useSession.ts` | Dispatches `START_SESSION`, `CONFIRM_OVERWRITE`, `END_SESSION`, `SET_CAPTURE_MODE`, queries `GET_SESSION`, listens for `SESSION_UPDATED`. | `useMessageBus` |
| **Captures Hook** | `src/features/capture/hooks/useCaptures.ts` | Queries `GET_ALL_THUMBNAILS`, manages thumbnail list, sends `DELETE_CAPTURE`, listens for `CAPTURE_COMPLETE`, `OCR_COMPLETED`, `OCR_FAILED`. | `useMessageBus` |
| **PDF Exporter Hook** | `src/features/pdf/hooks/usePdfExporter.ts` | Dispatches `CHECK_OCR_STATUS` and `EXPORT_PDF` (with `skipPendingOcr` flag), manages export state (`idle`, `generating`, `completed`, `failed`). | `useMessageBus` |
| **Floating Mascot** | `src/features/capture/components/FloatingMascot.tsx` | Draggable mascot face widget fixed to viewport, toggles side panel on click. | React, DOM mouse events |
| **Active Session View** | `src/features/session/components/ActiveSessionView.tsx` | Renders session header, capture count, mode toggle, scrollable thumbnail grid, edit buttons, and bottom "Download PDF" button. | `CaptureCard`, `DecisionModal` |
| **New Session View** | `src/features/session/components/NewSessionView.tsx` | Renders session name input, mode selection cards (Full Screen vs Crop Region), and "Start Capture Session" button. | React |
| **Capture Card** | `src/features/capture/components/CaptureCard.tsx` | Thumbnail card with order badge, edit button (`onEditCapture`), delete button, and lightbox click handler. | React |
| **Lightbox Preview** | `src/features/capture/components/LightboxPreview.tsx` | Full-screen image lightbox modal with backdrop dismiss and keyboard navigation. | React, DOM keyboard events |
| **Page Editor Modal** | `src/features/page-editor/components/PageEditor.tsx` | Full-screen modal overlay hosting Excalidraw canvas. Performs scene initialization (`useMemo`), debounced auto-save, overlay event containment, and ESC shortcut. | Excalidraw, `renderBoundedPageImage`, `useMessageBus` |

---

> **Core principle:** React is the presentation layer of Snabby. It owns UI state and user interaction, while application use cases own behavior and IndexedDB/Chrome/PDF/Tesseract implementations remain behind explicit interfaces. The finalized UI preserves the original Snabby visual identity inside an isolated Shadow DOM.

