# <img src="public/icons/icon48.png" width="38" height="38" align="absmiddle" /> [Snabby — Chrome Extension](https://chromewebstore.google.com/detail/odjcldajjjnadphmbphpbpkhgfcilpie?utm_source=item-share-cb)

**Snabby is a modern, lightweight Google Chrome extension designed for high-resolution web screenshot capture, interactive drag-to-crop selection, local offline OCR processing, and searchable PDF generation.**

---
# See How it works

https://github.com/user-attachments/assets/d35394a7-c694-425a-927e-397b1afd7092

## Key Features

- **Multi-Tab Captures**: Capture screenshots across multiple tabs and compile them into a single, unified document.
- **Crop-Region Capture**: Drag-and-select custom sections of pages. Supports high-DPI scaling using `window.devicePixelRatio`.
- **Keyboard Shortcuts**: Immediately trigger screenshot captures using `Ctrl + Shift + S`.
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

## Development & Setup Guide

To run Snabby locally in your browser for development:

### 1. Prerequisites
Ensure you have the following installed on your machine:
* [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
* [npm](https://www.npmjs.com/) (usually bundled with Node.js)
* Google Chrome (or any Chromium-based browser like Brave, Edge, or Opera)

### 2. Install Dependencies
Clone the repository and install the project dependencies:
```bash
git clone https://github.com/Avishkar74/Snabby.git
cd Snabby
npm install
```

### 3. Build the Extension
Compile the TypeScript code and bundle the React application and assets:
```bash
npm run build
```
This command runs TypeScript verification (`tsc -b`) and executes Vite/Rollup (`build.mjs`) to generate compile output into the `dist/` directory at the project root.

### 4. Load Snabby in Chrome
1. Open Google Chrome and navigate to the extensions page by typing **`chrome://extensions/`** in the URL bar.
2. In the top-right corner, toggle the **Developer mode** switch to **ON**.
3. In the top-left corner, click the **Load unpacked** button.
4. Select the **`dist/`** folder located at the root of the project directory.

Once loaded, the Snabby mascot icon will appear in your Chrome toolbar. You can click on the pin icon next to it to pin it for easy access.

---

## Privacy & Data Use
- **No Remote Calls**: Snabby operates completely inside the local browser context. 
- **Local Data Persistence**: Screenshots, session metadata, and extracted OCR text layers are persisted exclusively within the browser's local IndexedDB instance.
- **Telemetry-Free**: The extension does not collect or transmit tracking data, user telemetry, or page metrics.

