# 09 — Download Flow

## 1. Purpose

This document defines how Snabby takes the generated PDF `Blob` and downloads it to the user's computer.

PDF generation and downloading are intentionally separate responsibilities.

```text
PDF Generation
      ↓
   PDF Blob
      ↓
Download Service
      ↓
Browser Download API
      ↓
Downloaded PDF
```

---

# 2. Responsibilities

The download subsystem is responsible for:

* Receiving the generated PDF Blob.
* Generating the filename.
* Converting the Blob to a Base64 data URL.
* Triggering the browser download.
* Cleaning up temporary resources.
* Reporting download errors.

It is **not** responsible for:

* Creating the PDF.
* Running OCR.
* Capturing screenshots.
* Reading IndexedDB.
* Managing sessions.

---

# 3. Input

Conceptually:

```text
DownloadRequest
│
├── pdfBlob
└── filename information
```

The PDF Blob should already be a valid, finalized PDF.

The download subsystem should not need to know how that PDF was generated.

---

# 4. Overall Flow

```text
User clicks Download
        │
        ▼
Generate PDF
        │
        ▼
PDF Blob
        │
        ▼
Generate Filename
        │
        ▼
Convert to Base64 URL
        │
        ▼
Create Download Request
        │
        ▼
Chrome Download API
        │
        ▼
Browser Saves PDF
        │
        ▼
Clean up URL reference
        │
        ▼
Download Complete
```

---

# 5. Filename Generation

Snabby should generate a predictable filename.

Conceptually:

```text
Snabby_<session-name>.pdf
```

or, if the session has no name:

```text
Snabby_<timestamp>.pdf
```

The exact filename convention will be defined later as a constant/configuration.

The filename should:

* End with `.pdf`.
* Avoid invalid filesystem characters.
* Be deterministic for the same session where appropriate.

---

# 6. Filename Sanitization

Session names may contain characters that are unsuitable for filenames.

For example:

```text
My Session: August/15
```

may need to become something like:

```text
My_Session_August_15.pdf
```

Filename sanitization belongs to the download layer because it is a filesystem/browser-download concern.

---

# 7. Base64 Data URL

The generated PDF exists in memory as a `Blob`.

The browser download API needs a URL that points to the PDF data. Since MV3 extension service workers do not support `URL.createObjectURL()`, the adapter converts the Blob to a Base64-encoded data URL.

Conceptually:

```text
PDF Blob
   │
   ▼
ArrayBuffer
   │
   ▼
Base64 String
   │
   ▼
data:application/pdf;base64,...
```

The resulting temporary data URL is used only for the download operation.

---

# 8. Chrome Download API

The extension can trigger the browser's download mechanism through the Chrome Downloads API.

Conceptually:

```text
Base64 Data URL
    │
    ▼
chrome.downloads.download(...)
    │
    ▼
Chrome Download Manager
    │
    ▼
File saved
```

The download implementation is isolated behind the `DownloadService` interface contract.

For example, conceptually:

```text
DownloadPDF Use Case
      ↓
DownloadService.download(pdfBlob, filename)
      ↓
ChromeDownloadAdapter
      ↓
chrome.downloads.download()
```

The rest of Snabby should not directly call the Chrome API.

---

# 9. Why Use an Adapter

Instead of:

```text
PDF Generator / Use Case
      ↓
chrome.downloads.download()
```

we want:

```text
PDF Use Case
      ↓
PDF Blob
      ↓
DownloadPDF Use Case
      ↓
DownloadService.download(pdfBlob, filename)
      ↓
ChromeDownloadAdapter
```

This keeps:

* PDF generation independent of Chrome.
* Browser APIs isolated.
* Testing easier.
* Future browser support more realistic.

---

# 10. Download Completion

A successful download request means Chrome accepted the download operation.

Conceptually:

```text
Download Request
      │
      ▼
Chrome API
      │
      ▼
Download ID
      │
      ▼
Success
```

Depending on the desired UX, Snabby may also monitor the actual download state.

For v1, we should distinguish:

```text
Download request accepted
```

from:

```text
File completely written to disk
```

The exact behavior will be decided in the LLD.

---

# 11. Memory Cleanup

The base64-encoded data URL string consumes memory. After the download request has been safely initiated, Snabby should release it (setting the variable references to null or letting them fall out of scope) to allow standard garbage collection.

Conceptually:

```text
Convert to Base64
    ↓
Start Download
    ↓
Download accepted
    ↓
Release base64 references
```

Cleanup should also happen when an error occurs after encoding.

---

# 12. Error Flow

Possible failures include:

```text
Invalid PDF Blob
Filename Generation Error
Base64 Encoding Error
Chrome Download Error
Permission/Browser Error
```

The important behavior is:

```text
PDF already generated
        +
Download failed
        ↓
Do NOT regenerate PDF automatically
        ↓
Report download failure
```

The generated PDF data and session should remain unaffected.

---

# 13. Download Does Not Modify Session Data

The flow:

```text
Session
   ↓
PDF Generation
   ↓
PDF Blob
   ↓
Download
```

should not modify:

```text
Session
Captures
Images
OCR Results
```

Downloading is a side-effect external to the application's persistent data.

---

# 14. Download and React

React initiates the application-level action:

```text
React
   ↓
Generate PDF
   ↓
Download PDF
```

But React should not directly perform:

```text
chrome.downloads.download()
```

Instead:

```text
React
   ↓
Generate/Download Use Case
   ↓
Download Service
   ↓
Chrome API
```

This keeps browser-specific behavior outside the UI.

---

# 15. Download State

The UI may need to represent:

```text
IDLE
GENERATING_PDF
DOWNLOADING
COMPLETED
FAILED
```

However, PDF generation state and download state should remain conceptually separate.

For example:

```text
PDF Generation
    COMPLETED

Download
    FAILED
```

This allows the user to retry downloading without necessarily regenerating the PDF.

---

# 16. Retry

If downloading fails:

```text
PDF Blob
   ↓
Download failed
   ↓
Retry download
```

The system should ideally avoid recomputing OCR or regenerating screenshots unnecessarily.

Whether the generated PDF Blob is retained for retry or the PDF is regenerated will be decided based on memory considerations in the LLD.

---

# 17. Final Flow

```text
                  PDF BLOB
                     │
                     ▼
              Generate Filename
                     │
                     ▼
             Sanitize Filename
                     │
                     ▼
            Convert to Base64 URL
                     │
                     ▼
             Download Adapter
                     │
                     ▼
           Chrome Downloads API
                     │
                ┌────┴────┐
                │         │
             Success    Failure
                │         │
                ▼         ▼
          Release Mem   Release Mem
                │         │
                ▼         ▼
            Completed    Error
```

---

# 18. Key Invariants

1. Downloading does not modify persistent session data.
2. PDF generation and downloading remain separate operations.
3. Chrome-specific download APIs are isolated behind an adapter.
4. Temporary Base64 URL references are released.
5. Download failure does not invalidate the generated PDF or session.
6. Filename generation is centralized rather than scattered through the UI.

---

# 19. Reconciled Download Decisions

### Decision 1 — Filename Format
- **Format**: `Snabby_<session-name>.pdf` (with whitespace replaced by underscores and invalid characters removed).
- **Fallback**: If the session has no name, the filename is `Snabby_<timestamp>.pdf`, where timestamp is milliseconds since Unix epoch.

### Decision 2 — MV3 Blob URL Fallback
- Since `URL.createObjectURL` is unavailable inside extension background service workers, the `ChromeDownloadAdapter` (implementing `DownloadService` inside the infrastructure layer) reads the PDF Blob as an ArrayBuffer, converts it to a Base64 string, and constructs a `data:application/pdf;base64,...` URL.

### Decision 3 — Chrome Downloads API Integration
- The Base64 data URL is passed directly to the `chrome.downloads.download` API.
- The `"downloads"` permission must be added to `manifest.json` in Stage 5B.

---

# 20. Final Architecture

```text
React
  │
  ▼
Generate PDF Use Case
  │
  ▼
PDFService (generate)
  │
  ▼
PDF Blob
  │
  ▼
Download PDF Use Case
  │
  ▼
DownloadService.download(pdfBlob, filename)
  │
  ▼
ChromeDownloadAdapter (Blob → ArrayBuffer → Base64 conversion)
  │
  ▼
Chrome Downloads API
```
  │
  ▼
User's Downloads folder
```

> **Core principle:** PDF generation produces the document; the download subsystem converts the Blob into a Base64 data URL and initiates the browser's download manager.

