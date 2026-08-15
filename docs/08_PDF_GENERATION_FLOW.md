# 08 — PDF Generation Flow

## 1. Purpose

This document defines how Snabby converts a capture session into a PDF.

The PDF generator takes the user's **ordered captures**, loads their images and OCR results, creates one PDF page per capture, places the screenshot on each page, and adds an invisible OCR text layer.

```text
Session
   ↓
Ordered Captures
   ↓
Load Image + OCR
   ↓
Create PDF Page
   ↓
Add Screenshot
   ↓
Add OCR Text Layer
   ↓
Finalize PDF
   ↓
PDF Blob
```

---

# 2. Responsibilities

The PDF subsystem is responsible for:

* Loading the data required for PDF generation.
* Creating the PDF document.
* Creating one page per capture.
* Placing screenshots on pages.
* Transforming OCR coordinates.
* Adding the OCR text layer.
* Finalizing the PDF.
* Returning the generated PDF.

It is **not** responsible for:

* Screenshot capture.
* OCR computation.
* Session management.
* IndexedDB implementation.
* Browser downloading.

---

# 3. Input

Conceptually:

```text
PDFGenerationInput
│
├── session
└── ordered captures
      │
      ├── image
      └── OCR result (optional)
```

The captures must already be ordered by the session.

The PDF generator should not independently determine capture order.

---

# 4. Overall Flow

```text
User clicks Download
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
Create PDF Document
        │
        ▼
For Each Capture
        │
        ├── Load Image
        ├── Load OCR Result
        ├── Create Page
        ├── Calculate Image Placement
        ├── Add Screenshot
        └── Add OCR Text Layer
        │
        ▼
Finalize PDF
        │
        ▼
PDF Blob
```

---

# 5. Session Validation

Before generation begins, the application should verify:

```text
Session exists
        +
Session contains captures
        +
Captures are valid
        +
Images are available
```

OCR does not necessarily have to be available.

A screenshot remains a valid capture even if OCR failed.

The exact behavior for missing OCR will be finalized during the requirements/LLD phase.

---

# 6. Capture Ordering

The session determines PDF page order.

For example:

```text
Session

0 → Capture A
1 → Capture C
2 → Capture B
3 → Capture D
```

produces:

```text
PDF

Page 1 → A
Page 2 → C
Page 3 → B
Page 4 → D
```

Therefore:

> **Persisted session order = PDF page order.**

---

# 7. PDF Page Creation

Each capture produces one page.

```text
Capture 1 → Page 1
Capture 2 → Page 2
Capture 3 → Page 3
```

For every page:

```text
Create Page
    ↓
Determine dimensions
    ↓
Calculate image placement
    ↓
Draw screenshot
    ↓
Add OCR text
```

---

# 8. Page Dimensions

The screenshot and PDF page may have different dimensions.

For example:

```text
Image:
W × H

PDF:
PW × PH
```

The screenshot therefore needs to be transformed to fit the PDF page.

Conceptually:

```text
Screenshot
┌───────────────────┐
│                   │
│     Webpage       │
│                   │
└───────────────────┘
          ↓
       Scale
          ↓
PDF Page
┌───────────────────┐
│     Webpage       │
└───────────────────┘
```

The exact page-size policy will be decided during LLD.

---

# 9. Image Placement

The PDF generator calculates:

```text
scale
x
y
renderedWidth
renderedHeight
```

Conceptually:

```text
Image
  │
  ▼
Calculate scale
  │
  ▼
Calculate rendered dimensions
  │
  ▼
Calculate page position
  │
  ▼
Draw image
```

A typical contain-style calculation is:

```text
scaleX = pageWidth / imageWidth
scaleY = pageHeight / imageHeight

scale = min(scaleX, scaleY)
```

Then:

```text
renderedWidth  = imageWidth × scale
renderedHeight = imageHeight × scale
```

Whether Snabby uses this exact strategy will be confirmed against the existing implementation.

---

# 10. OCR Text Layer

The PDF should contain two conceptual layers:

```text
PDF Page
│
├── Screenshot Layer
│
└── OCR Text Layer
```

The screenshot provides the visual appearance.

The OCR layer provides searchable/selectable text.

The OCR text should normally be invisible so that it does not visually duplicate the screenshot.

---

# 11. OCR Word Placement

OCR provides a word and its image-space bounding box.

Example:

```text
Word: "Snabby"

x = 100
y = 200
width = 120
height = 30
```

The PDF generator must transform this into PDF coordinates.

```text
OCR Bounding Box
       │
       ▼
Image → PDF Transformation
       │
       ▼
PDF Bounding Box
       │
       ▼
Place Invisible Text
```

---

# 12. Coordinate Transformation

The transformation must account for:

* Image scaling.
* Image position on the PDF page.
* PDF coordinate-system differences.
* Image dimensions.
* Text placement.

Conceptually:

```text
Image Coordinate
       │
       ▼
Apply Scale
       │
       ▼
Apply Page Offset
       │
       ▼
Convert Coordinate System
       │
       ▼
PDF Coordinate
```

The important invariant is:

> OCR text must be positioned over the same visual location where the corresponding text appears in the screenshot.

---

# 13. Coordinate-System Difference

Image coordinates are commonly represented with the origin near the top-left:

```text
(0,0)
 ┌──────────────────────→ X
 │
 │
 │
 ↓
 Y
```

PDF libraries may use a different coordinate convention.

Therefore, the PDF generator may need to transform the Y coordinate.

Conceptually:

```text
imageY
   ↓
scale
   ↓
page-relative Y
   ↓
PDF Y coordinate
```

The exact formula depends on the selected PDF library and its coordinate system.

This will be specified in the LLD rather than duplicated across the codebase.

---

# 14. OCR Font Size

The OCR text layer needs a font size corresponding approximately to the height of the recognized text.

For example:

```text
OCR bounding box height
          ↓
Estimate text size
          ↓
PDF text size
```

The goal is not to make the OCR text visually readable because it is hidden.

The goal is to make its text geometry approximately match the screenshot.

This improves:

* text selection
* search positioning
* copy behavior
* text extraction

The exact font-size calculation will be determined during implementation.

---

# 15. OCR Text Content

Each OCR word is placed individually or as an appropriately grouped text segment.

Conceptually:

```text
OCR Result
│
├── "Student"
├── "Name:"
├── "Avishkar"
├── "Roll"
└── "No:"
```

The PDF generator uses these recognized words to construct the text layer.

The exact grouping strategy will be decided based on the existing OCR output and PDF library capabilities.

---

# 16. Missing OCR

A capture may have no OCR result:

```text
Capture
├── Image ✓
└── OCR ✗
```

The PDF generator should still be able to create the screenshot page.

Therefore:

```text
Image available
     +
OCR unavailable
     ↓
Image-only PDF page
```

The exact user-facing behavior will be documented separately.

---

# 17. Empty OCR

OCR can also complete successfully but produce no text:

```text
OCR Status = COMPLETED

fullText = ""
words = []
```

This is different from an OCR failure.

The PDF page can simply contain the screenshot with no OCR text layer.

---

# 18. PDF Generation Does Not Run OCR

The PDF generator should never do this:

```text
PDF Generator
      ↓
Tesseract
```

Instead:

```text
OCR
 ↓
Persist Result
 ↓
PDF Generator
```

This prevents PDF generation from becoming computationally expensive and tightly coupled to the OCR engine.

---

# 19. PDF Generation Does Not Modify OCR

The OCR result is treated as input.

The PDF generator transforms its coordinates for the PDF but should not modify the stored OCR result.

For example:

```text
Stored OCR:
x = 100
y = 200

PDF:
x = 50
y = 100
```

The stored OCR remains:

```text
x = 100
y = 200
```

The transformed coordinates exist only within the PDF-generation operation.

---

# 20. Per-Capture PDF Flow

For one capture:

```text
Capture
   │
   ├── Load Image
   │
   └── Load OCR
         │
         ▼
    Create PDF Page
         │
         ▼
    Calculate Placement
         │
         ▼
    Draw Screenshot
         │
         ▼
    If OCR available
         │
         ▼
    Transform Word Coordinates
         │
         ▼
    Add Invisible Text
         │
         ▼
    Page Complete
```

This operation is repeated for every capture.

---

# 21. Complete Example

Suppose the session contains:

```text
Capture 1
Image: 1920 × 1080
OCR: available

Capture 2
Image: 1366 × 768
OCR: available

Capture 3
Image: 1920 × 1080
OCR: failed
```

The PDF flow becomes:

```text
Create PDF
   │
   ├── Page 1
   │     ├── Screenshot
   │     └── OCR text
   │
   ├── Page 2
   │     ├── Screenshot
   │     └── OCR text
   │
   └── Page 3
         └── Screenshot
```

The third page remains valid even though OCR failed.

---

# 22. PDF Finalization

After all captures have been processed:

```text
Last Page
   │
   ▼
Finalize PDF
   │
   ▼
Generate PDF Bytes
   │
   ▼
Create Blob
```

Conceptually:

```text
PDF Generator
     ↓
PDF Binary Data
     ↓
Blob
```

The resulting Blob is passed to the download subsystem.

---

# 23. PDF Generation and Download Boundary

Generating a PDF and downloading it are separate operations.

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

The PDF generator should not directly control the browser's download UI.

---

# 24. Error Handling

Potential PDF errors include:

```text
SessionNotFound
NoCaptures
MissingImage
InvalidImage
InvalidOCRData
PageCreationError
ImagePlacementError
OCRCoordinateError
PDFLibraryError
PDFFinalizationError
```

The exact error hierarchy will be defined later.

A PDF-generation failure should **not modify or delete the user's session data**.

---

# 25. Failure Recovery

If PDF generation fails:

```text
Session
   ✓
Captures
   ✓
Images
   ✓
OCR
   ✓
PDF
   ✗
```

The session remains intact.

The user should be able to retry PDF generation without capturing everything again.

---

# 26. Memory Considerations

PDF generation may involve multiple large images.

We should avoid unnecessarily loading the entire session into duplicated in-memory structures.

Conceptually:

```text
Session
   ↓
Capture 1 → process → release temporary resources
   ↓
Capture 2 → process → release temporary resources
   ↓
Capture 3 → process → release temporary resources
```

The exact batching/memory strategy will be decided during LLD.

---

# 27. PDF Subsystem Boundary

The intended boundary is:

```text
                PDF GENERATION

Application
    │
    ▼
PDF Generation Use Case
    │
    ├── Session Repository
    ├── Image Repository
    └── OCR Repository
             │
             ▼
       PDF Builder
             │
             ├── Page Builder
             ├── Image Placement
             └── OCR Text Layer
             │
             ▼
          PDF Blob
```

The exact classes/modules are intentionally not defined yet.

---

# 28. Input / Output

### Input

```text
Session
+
Ordered Captures
+
Images
+
OCR Results where available
```

### Output

```text
PDF Blob
```

### Failure

```text
PDFGenerationError
```

---

# 29. Important Invariants

1. PDF page order matches session capture order.
2. Every valid capture produces one PDF page.
3. The screenshot remains the visual source of truth.
4. OCR text is an additional invisible/searchable layer.
5. OCR coordinates are transformed using the same image scaling applied to the screenshot.
6. PDF generation does not modify persisted session/capture/OCR data.
7. OCR failure does not automatically prevent the screenshot from appearing in the PDF.
8. PDF failure does not destroy the underlying session.

---

# 30. Design Decisions

### Decision 1 — One capture = one PDF page

This keeps the relationship simple and predictable.

### Decision 2 — Session order controls page order

No independent ordering logic exists inside the PDF generator.

### Decision 3 — Screenshot remains the visual layer

The OCR layer supplements the screenshot rather than replacing it.

### Decision 4 — OCR is optional during PDF generation

A capture can still produce an image-only page.

### Decision 5 — Coordinate conversion happens only during PDF generation

Stored OCR coordinates remain in image coordinates.

### Decision 6 — PDF generation is independent of downloading

The PDF subsystem produces a Blob; another subsystem handles the browser download.

---

# 31. Open Questions

These will be resolved during LLD:

1. Which PDF library will be used?
2. Exact PDF page-size strategy.
3. Whether pages preserve exact screenshot aspect ratio.
4. Whether screenshots are scaled to fit or fill the page.
5. How page margins are handled.
6. Exact image-to-PDF scaling formula.
7. Exact PDF coordinate conversion.
8. OCR font-size calculation.
9. How invisible text is implemented.
10. Whether OCR words or lines are placed individually.
11. PDF metadata such as title/filename.
12. How large sessions are processed.
13. Whether PDF generation should stream or build entirely in memory.
14. Exact behavior when OCR is unavailable.
15. Exact error and retry behavior.

---

# 32. Final PDF Generation Flow

```text
                    SESSION
                       │
                       ▼
               Ordered Captures
                       │
                       ▼
                 Create PDF
                       │
                       ▼
              ┌────────────────┐
              │ For each Capture│
              └───────┬────────┘
                      │
              ┌───────┴────────┐
              ▼                ▼
           Load Image       Load OCR
              │                │
              └───────┬────────┘
                      ▼
                 Create Page
                      │
                      ▼
              Calculate Scaling
                      │
                      ▼
               Draw Screenshot
                      │
                      ▼
               OCR Available?
                 /       \
               Yes        No
                │          │
                ▼          │
        Transform OCR      │
         Coordinates       │
                │          │
                ▼          │
        Add Invisible Text │
                │          │
                └────┬─────┘
                     ▼
                 Next Capture
                     │
                     ▼
                Finalize PDF
                     │
                     ▼
                  PDF Blob
                     │
                     ▼
               Download Flow
```

> **Core principle:** PDF generation combines the persisted screenshot and its OCR data without modifying either. The screenshot provides the visual page, while the OCR result provides the searchable text layer.
