# <img src="public/icons/icon48.png" width="38" height="38" align="absmiddle" /> Snabby — Chrome Extension

**Snabby is a modern, lightweight Google Chrome extension designed for high-resolution web screenshot capture, interactive drag-to-crop selection, local offline OCR processing, and searchable PDF generation.**

---
# See How it works

<video controls src="demo-1.mp4" title="Title"></video>

## Key Features

- **Multi-Tab Captures**: Capture screenshots across multiple tabs and compile them into a single, unified document.
- **Crop-Region Capture**: Drag-and-select custom sections of pages. Supports high-DPI scaling using `window.devicePixelRatio`.
- **Keyboard Shortcuts**: Immediately trigger screenshot captures using `Ctrl + Shift + S` (or `Cmd + Shift + S` on macOS).
- **100% Offline OCR**: Extracts text from captures using Tesseract.js inside a dedicated Chrome Offscreen Document. Bounding boxes are mapped to word level.
- **Selectable PDF Output**: Generates PDFs with searchable, selectable, and invisible text layers mapped exactly over the visual screenshot layers.
- **Isolated Presentation**: React UI mounts inside a Shadow DOM (`#wsn-root`) to guarantee zero style collision with parent web pages.

---

## Directory Structure

```text
├── dist/                      # Final production build outputs
├── docs/                      # Technical specification documentation (01 - 18)
├── public/                    # Static extension assets (icons, SVGs)
├── src/                       # Extension source code
│   ├── app/                   # React mounting and context provider logic
│   ├── application/           # Application use cases (Session, Capture, OCR, PDF)
│   ├── domain/                # Pure business entities and domain models
│   ├── infrastructure/        # Adapters, Repositories, Database Service, and Messaging Bus
│   ├── content/               # Web page content script overlay injectors
│   └── service-worker/        # MV3 Background Service Worker coordinator
├── tests/                     # Standard unit and integration test scripts
├── manifest.json              # MV3 configuration manifest
├── build.mjs                  # Multi-bundle compiler pipeline script
└── package.json               # Package configuration
```

---

## Privacy & Data Use
- **No Remote Calls**: Snabby operates completely inside the local browser context. 
- **Local Data Persistence**: Screenshots, session metadata, and extracted OCR text layers are persisted exclusively within the browser's local IndexedDB instance.
- **Telemetry-Free**: The extension does not collect or transmit tracking data, user telemetry, or page metrics.
