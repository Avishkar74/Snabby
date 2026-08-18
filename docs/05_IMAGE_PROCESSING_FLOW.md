# Snabby v1 — Image Processing Flow

## 1. Purpose

This document defines how Snabby processes a captured screenshot before it is passed to the OCR subsystem and later used for PDF generation.

The image-processing subsystem sits between **screenshot capture** and **OCR**.

Its primary responsibility is to take a raw captured image and produce a **validated, normalized, OCR-ready image representation** while preserving the information required by downstream systems.

```text
Raw Screenshot
      ↓
Image Validation
      ↓
Image Decoding
      ↓
Image Normalization
      ↓
Orientation Handling
      ↓
Dimension Validation
      ↓
OCR-Ready Image
      ↓
OCR
```

This subsystem does **not** perform OCR itself.

It does **not** generate PDFs.

It does **not** own IndexedDB persistence.

It does **not** render images in React.

---

# 2. Why Image Processing Exists

The screenshot returned by the browser is not necessarily in the exact representation that every downstream subsystem needs.

Different parts of Snabby have different requirements:

```text
Capture
  ↓
Raw browser image
  ↓
Image processing
  ↓
OCR-compatible image
  ↓
OCR
```

The image-processing layer provides a stable boundary between the browser's capture output and the OCR system.

Without this boundary, OCR code would need to understand:

* browser-specific image formats
* image decoding
* orientation
* dimensions
* scaling
* invalid image data
* image conversion

That would mix unrelated responsibilities.

---

# 3. Responsibilities

The image-processing subsystem is responsible for:

1. Receiving captured image data.
2. Validating that image data exists.
3. Decoding the image.
4. Determining image dimensions.
5. Handling image orientation where necessary.
6. Normalizing the image into a predictable representation.
7. Preserving the correct visual content.
8. Producing an OCR-ready image.
9. Providing dimensions required by downstream systems.
10. Reporting image-processing failures.

It should not be responsible for:

* OCR recognition.
* OCR result parsing.
* IndexedDB operations.
* Session management.
* PDF construction.
* Browser downloads.
* React rendering.

---

# 4. Position in the Overall Pipeline

The image-processing subsystem fits into the overall capture pipeline as follows:

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
Create ImageAsset / Capture
        │
        ▼
Atomic persistence
        │
        ▼
OCR
```

The same normalized image may later be used by PDF generation.

---

# 5. High-Level Flow

```text
┌─────────────────────────────┐
│       Raw Screenshot        │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│       Validate Input        │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│       Decode Image          │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│     Read Image Metadata     │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│    Normalize Orientation    │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│     Normalize Dimensions    │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│      Create OCR Input       │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│       OCR-Ready Image       │
└─────────────────────────────┘
```

---

# 6. Input

The image-processing subsystem receives a captured image.

Conceptually:

```text
ImageInput
│
├── image data
├── source dimensions if available
└── source metadata if required
```

The exact TypeScript schema will be defined later.

The subsystem should not require the caller to know how image normalization works.

---

# 7. Image Representation

The system may encounter several representations during the pipeline.

Conceptually:

```text
Browser Capture
      │
      ▼
Data URL / Encoded Image
      │
      ▼
Blob
      │
      ▼
Decoded Image
      │
      ▼
Canvas / Pixel Representation
      │
      ▼
Normalized Image
```

We should not force every stage to use the same representation.

The representation should be selected according to the responsibility of each stage.

For example:

* A browser API may return encoded image data.
* IndexedDB may store a `Blob`.
* Canvas may be useful for transformation.
* OCR may accept a `Blob`, image element, canvas, or other supported representation.

The final representation contracts will be established during the schema and LLD phases.

---

# 8. Input Validation

Before doing any processing, the image-processing subsystem validates its input.

At minimum:

```text
Image exists
Image data is not empty
Image data can be decoded
```

Conceptually:

```text
Raw Image
   │
   ▼
Validate
   │
 ┌─┴────────────┐
 │              │
Valid          Invalid
 │              │
 ▼              ▼
Continue       Error
```

Invalid image data must not silently continue through the pipeline.

---

# 9. Decode Image

The encoded screenshot must be decoded into a representation that can be inspected and transformed.

Conceptually:

```text
Encoded Image
      │
      ▼
Image Decoder
      │
      ▼
Decoded Image
```

The decoder should provide enough information to determine:

* width
* height
* orientation where applicable
* whether the image is actually valid

If decoding fails, the image-processing operation fails.

---

# 10. Image Dimensions

Image dimensions are important throughout Snabby.

The system needs to know:

```text
width
height
```

because dimensions affect:

* OCR coordinates
* bounding boxes
* image scaling
* PDF page construction
* OCR-to-PDF coordinate mapping

Conceptually:

```text
Image
 │
 ├── width
 └── height
```

The dimensions should represent the **normalized image** once processing is complete.

---

# 11. Orientation

Image orientation must be handled correctly.

An image can contain orientation information that affects how its pixels should be interpreted or displayed.

The existing Snabby implementation contains image normalization/orientation handling, so this behavior must be preserved where required for correct downstream processing.

The goal is:

```text
Source Image
      ↓
Orientation Handling
      ↓
Correctly Oriented Image
```

The OCR system should receive the image in its intended visual orientation.

---

# 12. Why Orientation Matters for OCR

Consider an image where the pixels and intended display orientation differ.

If OCR receives the image without normalization:

```text
Image orientation incorrect
        ↓
OCR
        ↓
Incorrect text recognition / coordinates
```

Instead:

```text
Image
  ↓
Normalize orientation
  ↓
Correct visual orientation
  ↓
OCR
```

This also ensures that OCR bounding boxes correspond to the same coordinate system used by later PDF generation.

---

# 13. Normalization

The purpose of normalization is to establish a predictable image representation.

Conceptually:

```text
Raw Image
   │
   ├── Decode
   ├── Orientation
   ├── Dimensions
   └── Format handling
          │
          ▼
   Normalized Image
```

Normalization should be deterministic.

Given the same valid input and the same processing configuration, the subsystem should produce the same normalized representation.

---

# 14. Normalized Image Contract

The output should conceptually provide:

```text
ProcessedImage
│
├── image data
├── width
├── height
└── relevant metadata
```

The exact schema will be defined later.

The important requirement is that downstream consumers do not need to understand how the image was normalized.

---

# 15. Image Scaling

Image scaling needs to be treated carefully.

The default principle should be:

> **Do not unnecessarily reduce the resolution of captured screenshots before OCR.**

OCR quality depends partly on the amount of visual information available.

If scaling is required for:

* memory constraints
* OCR performance
* browser limitations
* PDF page constraints

it should be an explicit design decision rather than an accidental side effect.

For v1, the processing pipeline should preserve the original capture dimensions unless there is a demonstrated reason to transform them.

---

# 16. Image Quality

The processing pipeline should avoid transformations that unnecessarily reduce OCR quality.

Examples of potentially harmful transformations include:

* excessive resizing
* aggressive compression
* loss of text detail
* incorrect color conversion
* incorrect rotation

The objective is:

```text
Capture quality
      ↓
Preserve useful information
      ↓
OCR
```

not:

```text
Capture
      ↓
Heavy transformation
      ↓
Lower-quality OCR
```

---

# 17. Color / Pixel Handling

The image-processing subsystem should preserve the visual information required for OCR.

The system should avoid unnecessary:

* color conversion
* transparency changes
* compression
* filtering

unless a specific OCR or PDF requirement justifies them.

If preprocessing such as grayscale conversion or thresholding is introduced later, it should be treated as an explicit OCR optimization rather than hidden inside generic image processing.

---

# 18. Canvas-Based Processing

Some image transformations may require a canvas-capable environment.

Conceptually:

```text
Image
  ↓
Decode
  ↓
Canvas
  ↓
Transform
  ↓
Export
  ↓
Processed Image
```

If canvas is required for a specific operation, that implementation detail should remain inside the image-processing infrastructure.

The rest of the application should only see the resulting processed-image contract.

---

# 19. Browser Context

Image processing may occur in different extension contexts depending on the API requirements.

Potential contexts include:

```text
Service Worker
Extension UI
Offscreen Document
```

The exact placement of each image-processing operation will be decided during the LLD.

The architectural rule is:

> The application should depend on an image-processing capability, not on a specific browser context.

---

# 20. Relationship With the Offscreen Document

The existing Snabby architecture uses an offscreen document for OCR-related processing.

If image operations require DOM/canvas capabilities unavailable in the service worker, those operations may also be performed through the offscreen environment.

Conceptually:

```text
Service Worker
      │
      ▼
Offscreen Document
      │
      ├── Image Processing
      │
      └── Tesseract
```

However, we should not move all image processing into the offscreen document simply because OCR already uses it.

Each operation should live in the context where it is technically required.

---

# 21. Processing Before Persistence vs After Persistence

There are two conceptual possibilities:

### Option A

```text
Capture
  ↓
Process
  ↓
Persist
```

### Option B

```text
Capture
  ↓
Persist
  ↓
Process
  ↓
Persist processed state
```

The overall architecture currently favors **image processing before persistence**, so that only valid, normalized image assets are saved to IndexedDB.

Therefore:

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
```

is the primary flow.

This provides an important validation property:

> If image decoding or validation fails, the transaction is not committed and no corrupted/broken records are persisted.

---

# 22. Handling Processing Failure

Suppose:

```text
AcquiredScreenshot
  ↓
Image Processing
  ↓
Failure (e.g. invalid format/corrupt)
```

The save step is not reached, the transaction is never opened, and the use case aborts immediately by propagating an `ImageProcessingError`.

This means the image can potentially be processed again.

---

# 23. Processing Status

A capture should have enough state to distinguish whether image processing has occurred.

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

The exact state model will be designed later.

We should avoid storing redundant states if they can be derived reliably.

---

# 24. Processing and OCR Boundary

The key boundary is:

```text
Image Processing
       │
       │ OCR-ready image
       ▼
      OCR
```

Image processing answers:

> "Is this image in a reliable representation for OCR?"

OCR answers:

> "What text is present in this image, and where is that text located?"

These are different responsibilities.

---

# 25. OCR Input

The image-processing subsystem should produce an OCR input that satisfies the OCR subsystem's contract.

Conceptually:

```text
ProcessedImage
│
├── image
├── width
└── height
```

The OCR subsystem should not need to perform another orientation correction.

That would create ambiguity around which coordinate system the OCR bounding boxes belong to.

---

# 26. Coordinate System

The normalized image establishes the coordinate system used by OCR.

For example:

```text
Normalized Image

(0,0)
  ┌─────────────────────────────→ X
  │
  │
  │       Text
  │      ┌───────────┐
  │      │           │
  │      └───────────┘
  │
  ↓
  Y
```

OCR bounding boxes will refer to this coordinate system.

Therefore, normalization must happen **before OCR coordinates are generated**.

---

# 27. Coordinate Preservation Invariant

Once image processing is complete:

> **The dimensions and orientation of the image must remain consistent with the coordinate system used by OCR.**

For example:

```text
Processed Image
width  = W
height = H

        ↓

OCR bounding box

x, y, width, height

        ↓

PDF coordinate transformation
```

If the image is rotated or resized after OCR, the stored OCR coordinates would no longer correctly map to the image.

Therefore, the pipeline must either:

1. Complete all transformations before OCR, or
2. Explicitly transform the OCR coordinates whenever the image changes.

For v1, the preferred design is:

```text
Capture
  ↓
All required image normalization
  ↓
OCR
  ↓
No coordinate-changing image transformations afterward
```

---

# 28. Image Processing and PDF Generation

PDF generation also needs image dimensions.

The flow is:

```text
Normalized Image
      │
      ├──────────────► OCR
      │
      └──────────────► PDF
```

The PDF generator should use the same normalized image representation or a representation derived from it.

This reduces the risk of OCR coordinates and PDF images referring to different dimensions.

---

# 29. Avoiding Duplicate Processing

The system should avoid unnecessarily processing the same image repeatedly.

Conceptually:

```text
Capture
  │
  ▼
Processing Status
  │
  ├── Already processed → Reuse
  │
  └── Not processed → Process
```

Whether processed images are persisted separately or regenerated when needed will be decided during the storage design.

We should not introduce duplicate storage unless it provides a clear benefit.

---

# 30. Processing Idempotency

Where practical, image processing should be idempotent.

Meaning:

```text
Process(Image A)
```

and then processing the same normalized input again should not produce inconsistent results.

This is useful for retries.

Example:

```text
Processing
    ↓
Failure
    ↓
Retry
    ↓
Same normalized image
```

The exact implementation depends on the chosen image-processing APIs.

---

# 31. Processing Error Categories

Potential errors include:

```text
InvalidImageData
ImageDecodeError
UnsupportedImageFormat
InvalidDimensions
OrientationError
ImageTransformationError
ImageExportError
ProcessingEnvironmentError
```

These are conceptual categories.

The final error hierarchy will be defined later.

---

# 32. Error Flow

```text
Raw Image
    │
    ▼
Validation
    │
    ├───────────────┐
    ▼               ▼
Valid            Invalid
    │               │
    ▼               ▼
Decode           Error
    │
    ├───────────────┐
    ▼               ▼
Success          Failure
    │               │
    ▼               ▼
Normalize        Error
    │
    ▼
OCR-ready Image
```

Errors should be propagated through an application-level error boundary rather than exposing raw browser exceptions to the UI.

---

# 33. Image Processing Does Not Own Storage

Image processing should not directly call IndexedDB.

Instead:

```text
Application
    │
    ▼
Image Processing Service
    │
    ▼
Processed Image
    │
    ▼
Application
    │
    ▼
Repository
    │
    ▼
IndexedDB
```

This keeps image transformation and persistence separate.

---

# 34. Image Processing Does Not Own OCR

Similarly:

```text
Image Processing
      │
      ▼
Processed Image
      │
      ▼
OCR Service
```

The image-processing subsystem should never need to know:

```text
Tesseract language
Tesseract worker
OCR confidence
OCR words
OCR bounding boxes
```

Those belong to the OCR subsystem.

---

# 35. Image Processing Does Not Own PDF Generation

The PDF generator consumes the image.

```text
Processed Image
      │
      ├─────────────► OCR
      │
      └─────────────► PDF
```

The image-processing layer doesn't need to know what the image will eventually be used for.

---

# 36. Image Processing Does Not Own React

The React UI may display the image, but that does not make image processing a UI responsibility.

```text
Image Processing
      │
      ▼
Application Data
      │
      ▼
React
```

The UI should receive a suitable image representation from the application layer.

---

# 37. Complete Successful Flow

```text
Captured Screenshot
        │
        ▼
Validate Input
        │
        ▼
Decode Image
        │
        ▼
Read Dimensions
        │
        ▼
Normalize Orientation
        │
        ▼
Normalize Representation
        │
        ▼
Validate Final Dimensions
        │
        ▼
Create OCR-ready Image
        │
        ▼
Send to OCR
```

---

# 38. Complete Failure Flow

```text
Captured Screenshot
        │
        ▼
Validate
        │
        X
Invalid
        │
        ▼
Image Processing Error
```

or:

```text
Captured Screenshot
        │
        ▼
Decode
        │
        X
Decode Failure
        │
        ▼
Image Processing Error
```

or:

```text
Captured Screenshot
        │
        ▼
Normalize
        │
        X
Transformation Failure
        │
        ▼
Image Processing Error
```

In all cases, the previously persisted original capture remains available.

---

# 39. End-to-End Relationship With Capture

The relationship between the two subsystems is:

```text
             CAPTURE SUBSYSTEM
                     │
                     │ Valid Screenshot
                     ▼
             ┌───────────────┐
             │    Capture    │
             └───────┬───────┘
                     │
                     │ persisted
                     ▼
             ┌───────────────┐
             │    IMAGE      │
             │  PROCESSING   │
             └───────┬───────┘
                     │
                     │ OCR-ready image
                     ▼
             ┌───────────────┐
             │      OCR      │
             └───────────────┘
```

---

# 40. Image Processing Subsystem Boundary

Conceptually:

```text
                  IMAGE PROCESSING

       ┌───────────────────────────────┐
       │     Image Processing Service   │
       └───────────────┬───────────────┘
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
      Image Validator      Image Transformer
             │                   │
             └─────────┬─────────┘
                       ▼
                Processed Image
                       │
                       ▼
                 OCR Interface
```

These are conceptual responsibilities, not final class names.

---

# 41. Input and Output Contract

## Input

Conceptually:

```text
CapturedImage
│
├── image data
├── source dimensions if available
└── metadata if required
```

## Output

Conceptually:

```text
ProcessedImage
│
├── normalized image data
├── width
├── height
└── processing metadata if required
```

## Failure

```text
ImageProcessingError
```

The exact TypeScript interfaces will be defined later.

---

# 42. Important Invariants

The image-processing subsystem should maintain the following invariants.

### Invariant 1

A successful processing operation always produces a valid image.

### Invariant 2

The output image has known dimensions.

### Invariant 3

The image orientation is normalized before OCR.

### Invariant 4

OCR coordinates refer to the normalized image coordinate system.

### Invariant 5

Image transformations required for OCR occur before OCR starts.

### Invariant 6

Image processing does not mutate the original capture in a way that makes recovery impossible.

### Invariant 7

A processing failure does not delete the original screenshot.

### Invariant 8

The same normalized image should be usable by both OCR and PDF generation.

### Invariant 9

Image processing does not depend on React.

### Invariant 10

Image processing does not directly depend on IndexedDB.

---

# 43. Design Decisions

## Decision 1 — Normalize before OCR

All required orientation and representation transformations occur before OCR so that OCR coordinates have a stable reference frame.

## Decision 2 — Preserve original capture

The original screenshot remains available even if processing fails.

## Decision 3 — Avoid unnecessary resizing

Captured resolution should be preserved unless a concrete requirement justifies scaling.

## Decision 4 — Separate transformation from OCR

Image processing prepares the image; OCR interprets it.

## Decision 5 — Keep browser-specific details out of application logic

Browser/canvas/image APIs are infrastructure concerns.

## Decision 6 — Use a stable processed-image contract

OCR and PDF generation should consume a predictable image representation.

## Decision 7 — Do not duplicate storage unnecessarily

A processed image should only be persisted separately if the later storage design demonstrates a real benefit.

---

# 44. Open Questions

The following decisions remain intentionally open until the later schema and LLD phases:

1. What exact image representation should be used between subsystems?
2. Should captures be stored as the original screenshot or the normalized image?
3. Should the normalized image also be persisted?
4. Should image processing happen in the service worker or offscreen document?
5. Which image APIs should be used?
6. Should `Blob`, `ImageBitmap`, canvas, or another representation be the internal standard?
7. Should any image resizing be performed?
8. Should grayscale/threshold preprocessing be supported?
9. How should unusually large screenshots be handled?
10. Which image formats must be supported?
11. How should corrupted image data be detected?
12. Should processing results be cached?
13. How should retries be implemented?
14. Should processing status be persisted?
15. What exact metadata should accompany a processed image?
16. How should image-memory cleanup be handled?
17. What exact image representation should PDF generation consume?

These decisions will be resolved after the OCR and storage flows are documented because those subsystems place constraints on the image contract.

---

# 45. Final Image Processing Flow

The complete conceptual flow is:

```text
                    CAPTURE
                       │
                       ▼
                Raw Screenshot
                       │
                       ▼
              Validate Image Data
                       │
                 ┌─────┴─────┐
                 │           │
               Valid       Invalid
                 │           │
                 ▼           ▼
            Decode Image    Error
                 │
                 ▼
            Read Dimensions
                 │
                 ▼
          Normalize Orientation
                 │
                 ▼
          Normalize Image Data
                 │
                 ▼
          Validate Final Image
                 │
                 ▼
            Processed Image
                 │
          ┌──────┴──────┐
          │             │
          ▼             ▼
         OCR           PDF
```

The key principle is:

> **Image processing establishes the canonical image representation and coordinate system that downstream OCR and PDF generation can safely rely on.**

The next document should be **`06_OCR_FLOW.md`**, where we go substantially deeper into the existing Tesseract.js architecture: the OCR request, service-worker → offscreen communication, Tesseract worker, recognition, word-level bounding boxes, confidence values, result normalization, persistence, progress, failure/retry, and the exact boundary between raw Tesseract output and Snabby's internal OCR model.
