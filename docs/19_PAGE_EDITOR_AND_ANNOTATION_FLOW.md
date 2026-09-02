# 19 — Page Editor & Annotation Flow

## 1. Purpose

This document provides a comprehensive architectural and low-level specification for Snabby's **Page Editor and Annotation System**.

It covers the complete user interaction lifecycle, component architecture, data models, Excalidraw canvas integration, bounded image compositing pipeline, IndexedDB persistence, messaging contracts, and integration with side panel previews and PDF generation.

---

## 2. System Overview & Architecture

Snabby allows users to annotate captured page screenshots before generating a PDF. Annotation is performed using an integrated **Excalidraw** vector editing canvas rendered within a full-screen modal overlay inside Snabby's Shadow DOM context.

```text
User clicks Edit on Page Card
        │
        ▼
App.tsx (editingPageId state set)
        │
        ▼
PageEditor Component Mounts (Shadow DOM)
        │
        ├── Request image & existing scene data ──► Service Worker ──► GetPageEditorImage
        │                                                                   │
        │◄── Return raw dataUrl & annotationData ───────────────────────────┘
        │
        ▼
Excalidraw Scene Initialized (useMemo initialData)
        │
        ├── Background: Raw screenshot locked at (0, 0)
        └── Foreground: Restored user vector elements
        │
        ▼
User Draws / Edits Canvas (Debounced onChange)
        │
        ▼
flushPendingSave Execution
        │
        ├── 1. Serialize user elements (excluding screenshot image element) ──► Page.annotationData
        │
        ├── 2. Render bounded composited image ────────────────────────────────► renderBoundedPageImage
        │      • Export Excalidraw elements to transparent canvas (exportWithDarkMode: true)
        │      • Composite on top of raw screenshot (width × height bounds)
        │      • Crop anything drawn outside screenshot bounds
        │
        └── 3. Send SAVE_PAGE_ANNOTATIONS message ───────────────────────────► Service Worker
                                                                                    │
                                                                                    ▼
                                                                           SavePageAnnotations
                                                                                    │
                                                                                    ├── Persist annotationData
                                                                                    ├── Store new ImageAsset
                                                                                    ├── Delete old renderedImageId
                                                                                    └── Update Page.renderedImageId
        │
        ▼
Broadcast SESSION_UPDATED ──► UI Refreshes (Side Panel & Lightbox use page.effectiveRenderedImageId)
        │
        ▼
PDF Generation ──────────────► PdfLibPDFService loads page.effectiveRenderedImageId
```

---

## 3. Key Design Decisions

### 3.1 Dual Representation Model
Snabby maintains a strict separation between **editable scene data** and **rendered visual output**:

- **`Page.annotationData`**: Contains the serialized Excalidraw JSON elements array. This represents the *source of truth for editing* and enables full non-destructive re-editing at any future time.
- **`Page.renderedImageId`**: Points to a persisted `ImageAsset` representing the *flattened, bounded PNG composite* (`original screenshot + visible drawings`). This represents the *source of truth for visual display* (previews, lightboxes, PDF pages).

### 3.2 Infinite Live Canvas + Bounded Render Output
Rather than attempting to fork Excalidraw or forcibly clamp live canvas panning/zooming (which degrades user experience), Snabby adopts an **infinite live editing canvas** paired with **bounded output compositing**:
- During editing, users enjoy standard Excalidraw canvas mechanics (pan, zoom, draw freely).
- The screenshot acts as the logical page background placed at coordinate `(0, 0)`.
- During saving, `renderBoundedPageImage` strictly clips all annotations to the rectangle `(0, 0) -> (originalWidth, originalHeight)`. Any elements or strokes drawn outside these boundaries are automatically cropped out of the rendered preview and PDF.

### 3.3 Transparent Image Resolution Fallback
The `Page` domain model provides a dynamic getter:
```typescript
public get effectiveRenderedImageId(): ImageId {
  return (this.renderedImageId ?? this.imageId) as ImageId;
}
```
All consumer subsystems (side panel thumbnails, lightbox previews, PDF generation) query `page.effectiveRenderedImageId`. If the page has been annotated, `renderedImageId` is returned; otherwise, `imageId` (the raw screenshot or blank base image) is returned. This allows the entire application to transparently display the latest page state without needing Excalidraw scene parsing logic.

### 3.4 Custom Blank Page Base Asset Foundation
For custom pages (`PageType.CUSTOM`), Snabby generates a **blank white A4 canvas PNG Blob** (`1240 × 1754`) upon page creation (`CreateCustomPage`).
- **Initial State**: `Page.imageId` is set to the blank base `ImageAsset` ID, while `Page.renderedImageId` is `undefined`.
- **Pre-Editing**: `effectiveRenderedImageId` returns `imageId` (rendering a clean blank white A4 page across thumbnails, lightboxes, and PDFs).
- **Page Editor**: `GetPageEditorImage` loads `page.imageId` (the blank white PNG), establishing a 1240 × 1754 canvas background for vector drawing.
- **Post-Editing**: `SavePageAnnotations` saves the composited image as `renderedImageId`. `effectiveRenderedImageId` now returns `renderedImageId`.
- **Re-Editing**: Reopening the editor loads `page.imageId` (the original blank base asset) and restores `annotationData` vector drawings, maintaining 100% non-destructive re-editing parity with screenshot pages.

### 3.5 Dark Mode Export Consistency
Excalidraw dynamically applies color inversion when running under a dark theme (`theme="dark"`). To ensure that strokes drawn in dark mode maintain their exact visual color when flattened into the side panel preview and PDF, `renderBoundedPageImage` explicitly configures Excalidraw's canvas exporter with:
```typescript
appState: {
  exportBackground: false,
  viewBackgroundColor: 'transparent',
  exportWithDarkMode: true,
  theme: 'dark'
}
```
This guarantees 100% visual color parity between the live editor canvas and the rendered image.

---

## 4. Component Architecture & Lifecycle

### 4.1 Component Hierarchy
```text
App (Root)
├── ActiveSessionView
│   └── CaptureCard (Triggers onEditCapture(pageId))
└── PageEditor (Controlled by editingPageId state)
    └── Excalidraw (Lazy-loaded inside Shadow DOM)
```

### 4.2 Modal Rendering & Backdrop Containment
`PageEditor` renders inside Snabby's Shadow DOM context (`wsn-react-root`) as a full-screen fixed modal overlay (`zIndex: 2147483647`).

To prevent accidental unmounting or modal dismissal during drawing:
- **`App.tsx` Backdrop Guard**: The side panel backdrop (`.wsn-backdrop`) is conditionally rendered only when `panelOpen && !editingPageId`. This prevents clicks during editing from reaching the side panel backdrop and closing the extension UI.
- **Overlay Target Verification**: `PageEditor` uses an `overlayRef` and `mouseDownTargetRef`. The modal closes via overlay click **only** if both `onMouseDown` and `onMouseUp` events land directly on the dark blurred backdrop wrapper (`overlayRef.current`).
- **Event Propagation Suppression**: `onMouseDown`, `onMouseUp`, `onClick`, `onPointerDown`, and `onPointerUp` events on the overlay wrapper execute `e.stopPropagation()` to isolate all editor interactions from the host webpage.

---

## 5. End-to-End Data Flow

### Step 1: Editor Opening & Image Fetch
1. User clicks **Edit** on a `CaptureCard` in `ActiveSessionView`.
2. `App.tsx` sets `editingPageId = pageId`.
3. `<PageEditor pageId={editingPageId} onClose={...} />` mounts.
4. `PageEditor` sends message `GET_PAGE_EDITOR_IMAGE` with `{ pageId }` over `ChromeMessageBus`.
5. Service Worker handles `GET_PAGE_EDITOR_IMAGE`:
   - `GetPageEditorImage` use case fetches `Page` from `PageRepository`.
   - `GetPageEditorImage` retrieves `imageId` (`page.imageId ?? page.effectiveRenderedImageId`). Note: the background image is ALWAYS the original raw screenshot (`page.imageId`), ensuring vector annotations are drawn over clean base pixels.
   - `ImageRepository` loads the raw `ImageAsset`.
   - Service worker converts binary Blob data to a base64 Data URL.
   - Response returned to `PageEditor`: `{ pageId, imageId, dataUrl, width, height, mimeType, annotationData }`.

### Step 2: Excalidraw Scene Initialization
1. `PageEditor` constructs `initialData` synchronously via `useMemo`:
   ```typescript
   const fileId = `img_${imageData.pageId}` as FileId;
   const fileData = { id: fileId, dataURL: imageData.dataUrl, mimeType: imageData.mimeType, created: Date.now() };
   
   const screenshotElements = convertToExcalidrawElements([
     {
       type: 'image',
       id: `image_${imageData.pageId}` as any,
       x: 0, y: 0,
       width: imageData.width, height: imageData.height,
       fileId, status: 'saved', locked: true,
     }
   ]);

   const userElements = imageData.annotationData ? JSON.parse(imageData.annotationData) : [];
   ```
2. Excalidraw mounts using `initialData`, seeding `elements` with `[...screenshotElements, ...userElements]` and `files` with `{ [fileId]: fileData }`.
3. `handleExcalidrawAPI` callback invokes `api.scrollToContent()` to center and fit the screenshot within the viewport automatically.

### Step 3: Drawing & Debounced Persistence
1. As the user draws, Excalidraw's `onChange` callback fires.
2. `PageEditor` filters out the locked background image (`el.type !== 'image' && !el.isDeleted`).
3. User elements are serialized: `annotationData = userElements.length > 0 ? JSON.stringify(userElements) : null`.
4. If `annotationData` differs from `lastSavedAnnotationDataRef`, a 500ms debounce timer (`saveTimeoutRef`) is set.
5. On timer expiration (or on modal close/unmount via `flushPendingSave`):
   - `renderBoundedPageImage` composites the vector elements onto the screenshot.
   - Message `SAVE_PAGE_ANNOTATIONS` is dispatched to the Service Worker containing `{ pageId, annotationData, renderedImageData }`.

### Step 4: Bounded Compositing (`renderBoundedPageImage`)
1. Parses `annotationData` vector elements.
2. Exports user vector elements to a transparent canvas using Excalidraw's `exportToCanvas`:
   - `exportBackground: false`, `viewBackgroundColor: 'transparent'`.
   - `exportWithDarkMode: true`, `theme: 'dark'`.
3. Calculates element bounding box origin (`minX`, `minY`).
4. Creates an HTML5 `<canvas>` sized exactly to `originalWidth × originalHeight`.
5. Draws the raw screenshot at `(0, 0)`.
6. Draws the exported Excalidraw canvas at offset `(minX - EXCALIDRAW_EXPORT_PADDING, minY - EXCALIDRAW_EXPORT_PADDING)`. (Excalidraw applies a default 10px export padding).
7. Exports the final canvas as a high-quality JPEG/PNG base64 Data URL (`toDataURL(mimeType, 0.92)`).

### Step 5: Service Worker Persistence (`SavePageAnnotations`)
1. Service worker receives `SAVE_PAGE_ANNOTATIONS`.
2. Converts `renderedImageData` base64 string to a binary `Blob`.
3. Creates a new `ImageAsset` with a freshly generated `ImageId` (`createImageId()`), inheriting `width` and `height` from the original screenshot asset.
4. Saves new `ImageAsset` to IndexedDB `images` store via `ImageRepository.save()`.
5. If an old `renderedImageId` exists (and is not equal to `page.imageId`), deletes the previous rendered `ImageAsset` from IndexedDB via `ImageRepository.delete()`.
6. Updates `Page` entity via `page.updateAnnotations(annotationData, newImageId)` (incrementing `version`).
7. Saves updated `Page` to IndexedDB `pages` store via `PageRepository.save()`.
8. Broadcasts `SESSION_UPDATED` event to all UI contexts.

---

## 6. Detailed File Responsibilities

| File | Subsystem | Responsibility |
| ---- | --------- | -------------- |
| `src/features/page-editor/components/PageEditor.tsx` | UI Feature | Main React modal component. Manages Excalidraw mounting, `initialData` memoization, scene fit, debounced auto-save, ESC shortcut, and overlay backdrop containment. |
| `src/features/page-editor/utils/renderBoundedPageImage.ts` | UI Utility | Bounded canvas compositing pipeline. Exports Excalidraw elements, offsets padding, draws raw screenshot background, and crops output to original dimensions. |
| `src/features/page-editor/types/pageEditor.types.ts` | UI Types | Type definitions for `PageEditorProps`. |
| `src/features/page-editor/index.ts` | UI Module | Barrel export for `PageEditor` component. |
| `src/application/page/GetPageEditorImage.ts` | Application Use Case | Fetches `Page` and raw screenshot `ImageAsset` for initializing the editor. |
| `src/application/page/SavePageAnnotations.ts` | Application Use Case | Handles saving annotation JSON, persisting new rendered `ImageAsset`, cleaning up old rendered images, and updating the `Page` entity. |
| `src/domain/page/Page.ts` | Domain Model | Encapsulates page state (`annotationData`, `renderedImageId`), rules for page types, and `effectiveRenderedImageId` resolution getter. |

---

## 8. Version-Aware OCR & Retry Safety Lifecycle

Snabby enforces a **version-aware OCR lifecycle** that automatically re-runs OCR when page content is edited, while strictly preventing infinite OCR loops or background retry storms:

1. **Visual Version Association (`OCRResult.processedImageId`)**:
   - `OCRResult` persists the exact `processedImageId` (matching `page.effectiveRenderedImageId`) for which OCR was performed.
   - An OCR result is considered **up-to-date** if `ocrResult.processedImageId === page.effectiveRenderedImageId`.

2. **Editing & Stale OCR Invalidation**:
   - When a user edits a page (screenshot or custom page) and saves, `SavePageAnnotations` creates a new rendered `ImageAsset` (`newImageId`).
   - `SavePageAnnotations` triggers `RunOCR` asynchronously on `newImageId`.
   - `RunOCR` processes the new rendered image, stores the resulting `OCRResult` with `processedImageId = newImageId`, and updates `Page.status`.

3. **Blank Page & Scribble/No-Text Safety**:
   - **Blank Custom Pages**: Newly created un-edited custom pages (`PageType.CUSTOM` without `renderedImageId`) skip OCR processing entirely (0 pending OCRs).
   - **Scribbles / Non-Text Content**: When OCR processes an image containing only scribbles, shapes, or diagrams, Tesseract finishes with `status: COMPLETED` and `fullText: ""`. This is marked as **COMPLETED for this image version** and will **never be retried automatically**.
   - **Genuine Failures**: System failures finish as `status: FAILED` with `processedImageId = currentImageId`. They are marked as failed for that visual version and will not loop indefinitely.

1. **Stale Async Load Protection**: `PageEditor` tracks `activePageIdRef`. If the user switches pages rapidly while a `GET_PAGE_EDITOR_IMAGE` request is in-flight, responses for outdated `pageId`s are discarded.
2. **Editor Unmount Flush**: `useEffect` cleanup and `handleClose` trigger `flushPendingSave()` synchronously, ensuring any un-saved drawings are flushed before the component unmounts.
3. **Missing Image Recovery**: `GetPageEditorImage` falls back to `page.effectiveRenderedImageId` if `page.imageId` is null, preventing editor load failures.
4. **IndexedDB Cleanup**: `SavePageAnnotations` safely cleans up obsolete rendered image assets (`ImageRepository.delete(oldId)`) upon re-saving to prevent database storage bloat.
