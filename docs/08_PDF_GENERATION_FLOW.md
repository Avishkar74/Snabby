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

The responsibilities are split between the application use case and the infrastructure service:

- **GeneratePDF Usecase (Application Layer)**:
  - Receives `GeneratePDFInput` containing `sessionId` and `skipPendingOcr`.
  - Loads the `Session` from `SessionRepository`.
  - Loads ordered `Capture`s associated with the session from `CaptureRepository`.
  - Coordinates polling of pending OCR results if `skipPendingOcr = false`.
  - Invokes `PDFService.generate(session, captures)`.
  - Returns the generated PDF `Blob`.

- **PdfLibPDFService (Infrastructure Layer)**:
  - Receives the loaded `Session` and ordered `Capture`s.
  - Sequentially loops over each capture.
  - Loads the raw screenshot `Image` Blob from `ImageRepository`.
  - Loads the `OCRResult` (if available) from `OCRRepository`.
  - Performs scaling and coordinate translation.
  - Employs `pdf-lib` to create pages, embed graphics, overlay transparent OCR text layers, and compile the final PDF `Blob`.

---

# 3. Input / Output Boundaries

- **Usecase Input**:
  - `sessionId: string`
  - `skipPendingOcr: boolean`
- **PDFService.generate Input**:
  - `session: Session`
  - `captures: Capture[]`
- **PDFService.generate Output**:
  - `Promise<Blob>` (PDF Blob data)

---

# 4. Overall Flow

```text
User clicks Download
        │
        ▼
GeneratePDF Use Case (Application)
        │
        ├── Load Session (SessionRepository)
        └── Load Ordered Captures (CaptureRepository)
        │
        ▼
PDFService.generate(session, captures) (Infrastructure)
        │
        ├── [Loop Captures]
        │     ├── Load Image (ImageRepository)
        │     ├── Load OCR Result (OCRRepository)
        │     ├── Calculate Image Scaling
        │     ├── Centered Draw Screenshot on Page
        │     └── Transform & Draw Transparent OCR Text
        │
        ▼
Finalize Document (pdf-lib)
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
A capture can still produce an image-only page if OCR failed or is omitted.

### Decision 5 — Coordinate conversion happens only during PDF generation
Stored OCR coordinates remain in image coordinates.

### Decision 6 — PDF generation is independent of downloading
The PDF subsystem produces a Blob; the download subsystem triggers the browser download.

### Decision 7 — Page Size and Scaling (A4 Contain-Fit)
To accommodate landscape and portrait captures cleanly:
- If `W >= H`, the page size is A4 landscape (`width = 842`, `height = 595`).
- If `W < H`, the page size is A4 portrait (`width = 595`, `height = 842`).
- Contain-fit uniform scaling is used:
  - `scaleX = pageWidth / W`
  - `scaleY = pageHeight / H`
  - `scale = min(scaleX, scaleY)`
  - `renderedWidth = W * scale`
  - `renderedHeight = H * scale`
- The screenshot is centered on the page:
  - `imgLeft = (pageWidth - renderedWidth) / 2`
  - `imgBottom = (pageHeight - renderedHeight) / 2`

### Decision 8 — Coordinate Transformation Formula
OCR bounding boxes `(x_img, y_img, w_img, h_img)` (with top-left origin) are mapped to PDF coordinates `(x_pdf, y_pdf)` (with bottom-left origin) using:
- `w_pdf = w_img * scale`
- `h_pdf = h_img * scale`
- `x_pdf = imgLeft + (x_img * scale)`
- `y_pdf = imgBottom + (imageHeight - y_img - h_img) * scale`

### Decision 9 — OCR Text Overlay Strategy
Text is drawn on top of the screenshot using `pdf-lib`'s `drawText` with `opacity: 0` at word-level to allow selection and searching without causing visual duplication. Font size is set to `h_pdf` to match the visual height.

### Decision 10 — OCR Status & skipPendingOcr Behavior
- **`skipPendingOcr = false`**: The GeneratePDF usecase polls the database/status until all captures are in a terminal state (`COMPLETED` or `FAILED`). If any capture's OCR is `PENDING`/`PROCESSING`, it waits.
- **`skipPendingOcr = true`**: Usecase compiles the PDF immediately. Captures with completed OCR get the overlay layer; captures with pending or failed OCR are rendered as image-only pages.

### Decision 11 — Memory Strategy
Captures are processed one at a time. The image binary is loaded, embedded into the PDF document, and intermediate ArrayBuffer/Blob resources are immediately released for garbage collection.


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
