# Snabby v1 — Session Management Flow

## 1. Purpose

This document defines how Snabby creates, identifies, manages, updates, and completes a **capture session**.

A session is the logical container that groups screenshots the user intends to export together as a PDF.

The session-management subsystem is responsible for:

* Creating sessions.
* Identifying the current session.
* Associating captures with a session.
* Maintaining capture ordering.
* Updating session metadata.
* Removing captures from sessions.
* Determining when a session is ready for export.
* Persisting session state through the storage layer.
* Providing session state to the application/UI.

It does **not** own:

* Screenshot capture.
* OCR.
* Image processing.
* PDF generation.
* IndexedDB implementation details.
* React rendering.

---

# 2. What Is a Session?

A Snabby session represents one logical document-building workflow.

For example, a user may want to capture:

```text
Tab A → Screenshot 1
Tab B → Screenshot 2
Tab C → Screenshot 3
Tab A → Screenshot 4
```

and eventually create:

```text
PDF
 ├── Page 1 → Screenshot 1
 ├── Page 2 → Screenshot 2
 ├── Page 3 → Screenshot 3
 └── Page 4 → Screenshot 4
```

All four captures belong to the same session.

Conceptually:

```text id="8ypl5h"
Session
│
├── Capture 1
├── Capture 2
├── Capture 3
└── Capture 4
```

The session is therefore the central object connecting:

```text
Capture
   ↓
Processing
   ↓
OCR
   ↓
Ordering
   ↓
PDF
```

---

# 3. Session Responsibilities

The session subsystem manages the lifecycle of a capture session.

Its responsibilities are:

```text id="r7f0y4"
Session Management
│
├── Create session
├── Identify session
├── Load session
├── Add capture
├── Remove capture
├── Reorder captures
├── Update session metadata
├── Persist session changes
├── Validate session
└── Prepare session for export
```

The subsystem should provide these capabilities through application-level operations.

---

# 4. Session Does Not Represent a Browser Tab

A critical distinction:

> A session is not a browser tab.

A session can contain captures from many tabs.

```text id="u7m5cq"
Browser Tab A
      │
      └── Capture 1 ──┐
                      │
Browser Tab B         │
      │               │
      └── Capture 2 ──┤
                      ├──→ Session 1
Browser Tab C         │
      │               │
      └── Capture 3 ──┤
                      │
Browser Tab A         │
      │               │
      └── Capture 4 ──┘
```

The tab is capture-source metadata.

The session represents the user's document-building workflow.

---

# 5. Session Lifecycle

The high-level session lifecycle is:

```text id="8g6f4n"
No Session
    │
    │ First Capture
    ▼
Create Session
    │
    ▼
Active Session
    │
    ├── Add Capture
    ├── Remove Capture
    ├── Reorder Captures
    └── Continue Capturing
    │
    ▼
Ready for Export
    │
    ▼
PDF Generation
    │
    ▼
Completed / Retained
```

For v1, the lifecycle rules are explicit:

```text
1) Exactly one session is active at a time.
2) Extension/browser restart restores the existing active session.
3) Starting a new session marks the previous active session inactive.
4) Sessions are not auto-deleted after export.
5) Empty sessions are retained until explicit user deletion.
```

---

# 6. Creating a Session

A session is normally created when the user performs the first capture and there is no suitable existing session.

Flow:

```text id="rj4c2u"
Capture Request
      │
      ▼
Find Current Session
      │
      X
No Session
      │
      ▼
Create Session
      │
      ▼
Create Session ID
      │
      ▼
Initialize Session
      │
      ▼
Persist Session
      │
      ▼
Add Capture
```

The first capture therefore creates the initial session context.

---

# 7. Session Identity

Every session requires a unique identifier.

Conceptually:

```text id="i3f4rq"
Session ID
```

The ID must not depend on:

* Browser tab ID.
* Capture order.
* Page URL.
* Timestamp alone.

The session ID allows all related captures and operations to refer to the same session.

The exact identifier format will be decided during the schema design.

---

# 8. Session Metadata

A session should contain metadata useful for managing its lifecycle.

Conceptually:

```text id="c5zqg7"
Session
│
├── id
├── createdAt
├── updatedAt
├── status
└── other session-level metadata
```

The exact fields are declared as `Session` inside [Session.ts](file:///d:/Resume%20projects/Snabby/src/domain/session/Session.ts).

---

# 9. Creating the First Capture

The first capture follows this flow:

```text id="r3l9pq"
User Starts Capture
       │
       ▼
Capture Screenshot
       │
       ▼
Valid Screenshot
       │
       ▼
Get Current Session
       │
       ▼
No Current Session
       │
       ▼
Create Session
       │
       ▼
Add Capture
       │
       ▼
Persist
```

The capture becomes the first member of the new session.

---

# 10. Adding Captures to an Existing Session

When a session already exists:

```text id="e9d4tk"
New Capture
     │
     ▼
Find Active Session
     │
     ▼
Existing Session
     │
     ▼
Determine Next Order
     │
     ▼
Associate Capture
     │
     ▼
Persist Changes
```

Example:

```text id="ojqf5w"
Session 1

Capture 1 → order 0
Capture 2 → order 1
Capture 3 → order 2

New capture
     ↓
Capture 4 → order 3
```

---

# 11. Session and Capture Relationship

The conceptual relationship is:

```text id="g1r7hj"
Session
   │
   ├──────────────┐
   │              │
   ▼              ▼
Capture 1       Capture 2
   │              │
   ▼              ▼
Image           Image
   │              │
   ▼              ▼
OCR             OCR
```

A capture belongs to one session in v1.

A session can contain zero or more captures.

The exact database representation of this relationship will be defined in the IndexedDB design.

---

# 12. Ordering

Ordering is a fundamental responsibility of session management.

The session must know the intended order of its captures.

Example:

```text id="e1w4vx"
Session
│
├── Capture A → order 0
├── Capture B → order 1
├── Capture C → order 2
└── Capture D → order 3
```

This ordering controls:

* UI presentation.
* PDF page order.

---

# 13. Why Ordering Belongs to the Session

Capture identity and capture order are different concepts.

For example:

```text id="9zv4ke"
Capture A
ID = capture-123
```

may originally be:

```text
order = 0
```

and later become:

```text
order = 3
```

The capture ID does not change.

Therefore:

```text id="y4w6qj"
Capture Identity
      ≠
Capture Position
```

The position is mutable.

---

# 14. Adding a Capture

When adding a capture:

```text id="u4f9o7"
Session
      │
      ▼
Get Current Ordering
      │
      ▼
Determine New Position
      │
      ▼
Assign Position
      │
      ▼
Associate Capture
      │
      ▼
Persist
```

The default behavior should append a newly captured page to the end of the current session.

Example:

```text id="3l7y0u"
Before:

A
B
C

After adding D:

A
B
C
D
```

---

# 15. Reordering Captures

The user must be able to change the order.

Example:

```text id="ps4xcr"
Before:

0 → A
1 → B
2 → C
3 → D
```

User moves `D` to the beginning:

```text id="5s9x84"
After:

0 → D
1 → A
2 → B
3 → C
```

The new ordering must be persisted.

---

# 16. Reordering Flow

```text id="1x5n3c"
User Changes Order
        │
        ▼
New Ordered Capture List
        │
        ▼
Validate Order
        │
        ▼
Update Session Ordering
        │
        ▼
Persist
        │
        ▼
Return Updated Session
        │
        ▼
React UI Updates
```

The UI should not simply maintain the new order locally and forget it.

The order is persistent application state.

---

# 17. Reordering and PDF

The PDF generator must use the session's persisted ordering.

```text id="c1b4p4"
Session Order
     │
     ▼
PDF Page Order
```

Therefore:

```text id="wz6m1a"
UI order
   =
Session order
   =
PDF order
```

This invariant should always hold.

---

# 18. Removing a Capture

The user can remove a capture from a session.

Example:

```text id="2p6h4k"
Before:

A
B
C
D

Delete B

After:

A
C
D
```

Removing a capture must update the session's ordering.

---

# 19. Delete Flow

```text id="0xqz6v"
User Selects Delete
        │
        ▼
Delete Capture Request
        │
        ▼
Validate Capture Belongs to Session
        │
        ▼
Remove Capture
        │
        ▼
Cleanup Associated Data
        │
        ▼
Recalculate Ordering
        │
        ▼
Persist
        │
        ▼
Return Updated Session
```

Associated data may include:

* Image asset.
* OCR result.
* Capture metadata.

The exact cleanup transaction will be defined in the IndexedDB subsystem.

---

# 20. Ordering After Deletion

Suppose:

```text id="u3e1h8"
0 → A
1 → B
2 → C
3 → D
```

Delete B:

```text id="h4m3r1"
0 → A
2 → C
3 → D
```

The system should normalize this to:

```text id="u9e2i1"
0 → A
1 → C
2 → D
```

There should not normally be unnecessary gaps in the persisted ordering.

---

# 21. Empty Sessions

A session can temporarily contain no captures.

For example:

```text id="h8s2ce"
Session
└── No captures
```

This can happen after deleting the final capture.

The system needs a defined policy for empty sessions.

Possible behavior:

```text id="1h3zq4"
Delete final capture
       │
       ▼
Empty Session
       │
       ├── Retain temporarily
       │
       └── Cleanup later
```

The exact policy will be finalized during storage/lifecycle design.

The important requirement is that an empty session must not result in corrupted state.

---

# 22. Loading a Session

When the React UI needs to display a session:

```text id="y0p1uo"
UI
 │
 ▼
Load Session Use Case
 │
 ▼
Session Repository
 │
 ▼
IndexedDB
 │
 ▼
Session
 │
 ▼
Load Associated Captures
 │
 ▼
Return Session View
 │
 ▼
React UI
```

The UI should receive application-level data rather than raw IndexedDB records.

---

# 23. Session Persistence

Session state is persisted through the storage abstraction.

Conceptually:

```text id="g2y4gt"
Session Use Case
       │
       ▼
Session Repository
       │
       ▼
IndexedDB Repository
       │
       ▼
IndexedDB
```

The session-management layer does not directly interact with:

```text
IDBDatabase
IDBTransaction
IDBObjectStore
```

Those belong to infrastructure.

---

# 24. Session as Persistent State

A session must survive UI lifecycle changes.

For example:

```text id="o9x0g6"
Capture
  ↓
Session persisted
  ↓
React UI closes
  ↓
React UI opens again
  ↓
Session loaded
```

The session should not disappear simply because the popup/component was closed.

This is one of the important reasons IndexedDB is the persistent source of truth.

---

# 25. Current Session

Snabby needs a way to determine which session receives a new capture.

Conceptually:

```text id="r4e2na"
New Capture
     │
     ▼
Find Current Session
     │
     ├── Found → Add Capture
     │
     └── Not Found → Create Session
```

For v1:

```text
Current session = the single persisted ACTIVE session.
```

If none exists, create one and mark it ACTIVE.

---

# 26. Session Status

A session may require a lifecycle status.

Conceptually:

```text id="w7f1xq"
Session
   │
   └── Status
```

Potential conceptual states include:

```text id="3q5m84"
ACTIVE
READY
GENERATING_PDF
COMPLETED
```

However, we should not create states simply because they sound useful.

The final state machine will be derived from actual requirements.

In particular, PDF-generation state may be application/UI state rather than persistent session state.

This distinction will be resolved during the LLD.

---

# 27. Session Modification

A session is modified when:

* A capture is added.
* A capture is removed.
* Capture ordering changes.
* Session metadata changes.

Each modification should update the session's modification timestamp if timestamps are part of the final model.

Conceptually:

```text id="t9t9f1"
Session Modification
       │
       ▼
Update Session
       │
       ▼
updatedAt = current time
       │
       ▼
Persist
```

---

# 28. Atomic Session Changes

Operations that affect multiple related records should be considered carefully.

For example, deleting a capture may involve:

```text id="u2g6x4"
Delete Capture
      │
      ├── Delete image
      ├── Delete OCR result
      ├── Remove capture from session
      └── Update ordering
```

These changes should ideally be coordinated so that Snabby does not end up in a partially updated state.

IndexedDB transaction boundaries will be defined in the storage design.

---

# 29. Session Validation

Before important operations, the session should be validated.

Examples:

### Adding capture

```text id="zj8z7r"
Session exists?
Capture valid?
Capture already associated?
```

### Reordering

```text id="t4p8v1"
All captures belong to session?
No duplicate captures?
No missing captures?
```

### Exporting

```text id="v5d3q0"
Session exists?
Has captures?
Captures have valid images?
```

Validation rules will eventually become domain/application rules.

---

# 30. Session and Capture Ownership

A capture must belong to the session it claims to belong to.

Invalid state:

```text id="9r9l4p"
Session A
   │
   └── Capture X

Capture X
   │
   └── sessionId = Session B
```

The application must prevent such inconsistent ownership.

The exact relationship representation will be decided in the data model.

---

# 31. Concurrent Operations

Snabby is a browser extension, so multiple asynchronous operations may happen close together.

For example:

```text id="7b7r4m"
Capture 1 starts
      │
Capture 2 starts
      │
Capture 1 completes
      │
Capture 2 completes
```

The session manager must ensure that captures are assigned correctly and ordering is not corrupted.

This is especially important when multiple capture requests occur rapidly.

The exact concurrency strategy will be defined during LLD.

---

# 32. Duplicate Capture Requests

The user may accidentally press the keyboard shortcut multiple times.

Example:

```text id="w2f4by"
Ctrl + Shift + S
Ctrl + Shift + S
Ctrl + Shift + S
```

The system must not accidentally corrupt the session.

The final behavior needs to define whether:

* all valid requests become captures,
* duplicate requests within a short interval are ignored,
* or concurrent capture operations are serialized.

This is an open design decision for the LLD.

---

# 33. Session and OCR

Session management does not perform OCR.

The relationship is:

```text id="eqf3v1"
Session
   │
   ├── Capture 1 → OCR
   ├── Capture 2 → OCR
   └── Capture 3 → OCR
```

Each capture independently owns its OCR processing state/result.

The session only groups the captures.

---

# 34. Session and PDF

The PDF generator consumes a session.

```text id="i0ujqz"
Session
   │
   ▼
Ordered Captures
   │
   ▼
PDF Generator
```

The session manager therefore provides the ordered collection of captures required by PDF generation.

It does not create the PDF itself.

---

# 35. Session UI Flow

The React UI observes the session.

```text id="y9b0aj"
IndexedDB
    │
    ▼
Session Repository
    │
    ▼
Application Layer
    │
    ▼
React State
    │
    ▼
Session UI
```

User operations travel in the opposite direction:

```text id="v6svw9"
React UI
    │
    ├── Add Capture
    ├── Reorder
    └── Delete
    │
    ▼
Application Use Case
    │
    ▼
Session Repository
    │
    ▼
IndexedDB
```

The UI should therefore remain a consumer of session state rather than owning the session itself.

---

# 36. Complete Add-Capture Flow

```text id="8nq8jb"
Screenshot Successfully Captured
              │
              ▼
        Create Capture
              │
              ▼
      Find Current Session
              │
       ┌──────┴──────┐
       │             │
     Found         Not Found
       │             │
       │             ▼
       │        Create Session
       │             │
       └──────┬──────┘
              ▼
      Determine Next Order
              │
              ▼
       Associate Capture
              │
              ▼
       Persist Session Data
              │
              ▼
        Updated Session
              │
              ▼
           React UI
```

---

# 37. Complete Reorder Flow

```text id="q3qg2b"
User Reorders Captures
          │
          ▼
New Capture Order
          │
          ▼
Validate Order
          │
          ▼
Update Session
          │
          ▼
Persist
          │
          ▼
Updated Session
          │
          ▼
React UI
```

The persisted order becomes the source for future PDF generation.

---

# 38. Complete Delete Flow

```text id="4n0bmv"
User Deletes Capture
          │
          ▼
Validate Ownership
          │
          ▼
Delete Capture
          │
          ├───────────────┐
          ▼               ▼
      Image Asset      OCR Result
          │               │
          └───────┬───────┘
                  ▼
          Update Session
                  │
                  ▼
          Normalize Order
                  │
                  ▼
               Persist
                  │
                  ▼
            Updated Session
                  │
                  ▼
               React UI
```

---

# 39. Complete Session-to-PDF Flow

```text id="txm9k8"
Session
   │
   ▼
Validate Session
   │
   ▼
Get Ordered Captures
   │
   ▼
Load Image + OCR Data
   │
   ▼
PDF Generation
   │
   ▼
PDF Blob
   │
   ▼
Download
```

Session management stops at providing the valid ordered capture collection.

---

# 40. Session Subsystem Boundaries

Conceptually:

```text id="6c9m1r"
                 SESSION SUBSYSTEM

             ┌─────────────────────┐
             │   Session Use Cases │
             └──────────┬──────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
       Create        Add/Remove     Reorder
       Session       Capture        Captures
          │             │             │
          └─────────────┼─────────────┘
                        ▼
                 Session Repository
                        │
                        ▼
                 IndexedDB Layer
```

Again, these are **conceptual responsibilities**, not final class names.

---

# 41. Input and Output

## Create Session

Input:

```text id="h6g5o5"
Session creation request
```

Output:

```text id="5k3p5j"
New Session
```

---

## Get Session

Input:

```text id="2s1cz7"
Session ID / current-session criteria
```

Output:

```text id="6c5x8r"
Session
```

---

## Add Capture

Input:

```text id="4f0v7r"
Session ID
+
Capture
```

Output:

```text id="2a8b5f"
Updated Session
```

---

## Reorder

Input:

```text id="v8l0yq"
Session ID
+
New capture ordering
```

Output:

```text id="2x1f7w"
Updated Session
```

---

## Delete Capture

Input:

```text id="7f0z2r"
Session ID
+
Capture ID
```

Output:

```text id="m9v3a6"
Updated Session
```

---

# 42. Important Invariants

The session subsystem should maintain these invariants.

### Invariant 1

Every capture belongs to exactly one session.

### Invariant 2

A capture ID uniquely identifies a capture.

### Invariant 3

Capture ordering is unique within a session.

### Invariant 4

The session order determines PDF page order.

### Invariant 5

Changing capture order does not change capture identity.

### Invariant 6

Deleting a capture cannot delete unrelated captures.

### Invariant 7

A session cannot reference a nonexistent capture.

### Invariant 8

A capture cannot reference a nonexistent session.

### Invariant 9

Persistent session state must not depend on React component lifetime.

### Invariant 10

A failed OCR operation does not invalidate the capture/session.

---

# 43. Error Categories

Potential session-related errors include:

```text id="8h2tca"
SessionNotFound
InvalidSession
CaptureNotInSession
CaptureAlreadyInSession
InvalidCaptureOrder
DuplicateCaptureOrder
EmptySessionExport
SessionPersistenceError
ConcurrentModificationError
```

These are conceptual error categories.

The final error classes are implemented under `src/domain/common/errors.ts` using a base `DomainError` and subclasses `ValidationError`, `SessionNotFoundError`, and `DatabaseError`.

---

# 44. Important Design Decisions

### Decision 1 — Session is the document-building unit

The session represents the collection of captures that will eventually become a PDF.

### Decision 2 — A session can contain captures from multiple tabs

Browser tabs are capture sources, not session boundaries.

### Decision 3 — Capture ordering is persistent

The ordering selected by the user is stored and reused for PDF generation.

### Decision 4 — Capture identity and order are independent

Moving a capture does not change its identity.

### Decision 5 — Session management does not perform OCR

OCR belongs to the capture-processing pipeline.

### Decision 6 — Session management does not generate PDFs

PDF generation consumes the session.

### Decision 7 — One active session at a time

At any time, only one session can be ACTIVE. Creating a new session transitions the previous ACTIVE session to INACTIVE.

### Decision 8 — No automatic session cleanup in v1

Sessions, including empty sessions and exported sessions, remain persisted until explicitly deleted by the user.

### Decision 7 — IndexedDB is accessed through repositories

Session logic should not contain IndexedDB-specific implementation.

### Decision 8 — React is not the source of persistent session state

The UI reflects application state backed by persistent storage.

---

# 45. Session Management Decisions Finalized

The following decisions are now resolved:

1. **Current Session Identification**: The UI/caller retrieves the relevant session using the use cases `GetSession` / `CreateSession`.
2. **Persistence Lifecycle**: Sessions remain persisted in IndexedDB until explicitly deleted by the user.
3. **Session Deletion Cascade**: Purging a session cascades to captures, images, and OCRResults inside the repository database transaction, preventing orphan records.
4. **Exceptions**: Missing session lookups throw a dedicated `SessionNotFoundError`.
5. **Ordering**: Represented as a numeric `order` field on Capture records and sorted natively by compound index `[sessionId, order]` in IndexedDB.

---

# 46. Final Session Management Flow

The complete conceptual flow is:

```text id="s4v9q3"
                  CAPTURE REQUEST
                        │
                        ▼
                Find Current Session
                        │
                  ┌─────┴─────┐
                  │           │
                Found       Missing
                  │           │
                  │           ▼
                  │      Create Session
                  │           │
                  └─────┬─────┘
                        ▼
                  Create Capture
                        │
                        ▼
                 Assign Capture Order
                        │
                        ▼
                Associate With Session
                        │
                        ▼
                     Persist
                        │
                        ▼
                 Updated Session
                        │
          ┌─────────────┼─────────────┐
          │             │             │
          ▼             ▼             ▼
      Add More       Reorder        Delete
      Captures       Captures       Capture
          │             │             │
          └─────────────┼─────────────┘
                        ▼
                  Persist Changes
                        │
                        ▼
                  Current Session
                        │
                        ▼
                 PDF Generation
```

The central principle is:

> **A Snabby session is the persistent, ordered collection of captures that represents one document-building workflow.**

Implementation status: Image Processing has now been finalized and implemented in document 05.
