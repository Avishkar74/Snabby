import { IndexedDBCaptureRepository } from '../infrastructure/indexeddb/repositories/IndexedDBCaptureRepository.ts';
import { IndexedDBImageRepository } from '../infrastructure/indexeddb/repositories/IndexedDBImageRepository.ts';
import { IndexedDBOCRRepository } from '../infrastructure/indexeddb/repositories/IndexedDBOCRRepository.ts';
import { IndexedDBSessionRepository } from '../infrastructure/indexeddb/repositories/IndexedDBSessionRepository.ts';
import { IndexedDBCapturePersistenceService } from '../infrastructure/indexeddb/services/IndexedDBCapturePersistenceService.ts';
import { IndexedDBPageRepository } from '../infrastructure/indexeddb/repositories/IndexedDBPageRepository.ts';
import { IndexedDBPagePersistenceService } from '../infrastructure/indexeddb/services/IndexedDBPagePersistenceService.ts';

import { ChromeCaptureAdapter } from '../infrastructure/chrome/capture/ChromeCaptureAdapter.ts';
import { BrowserImageProcessor } from '../infrastructure/image/BrowserImageProcessor.ts';
import { ChromeMessageBus } from '../infrastructure/messaging/ChromeMessageBus.ts';
import { TesseractOCRAdapter } from '../infrastructure/ocr/TesseractOCRAdapter.ts';
import { PdfLibPDFService } from '../infrastructure/pdf/PdfLibPDFService.ts';
import { ChromeDownloadAdapter } from '../infrastructure/chrome/downloads/ChromeDownloadAdapter.ts';

import { CreateSession } from '../application/session/CreateSession.ts';
import { DeleteSession } from '../application/session/DeleteSession.ts';
import { CaptureScreenshot } from '../application/capture/CaptureScreenshot.ts';
import { CreateScreenshotPage } from '../application/page/CreateScreenshotPage.ts';
import { RunOCR } from '../application/ocr/RunOCR.ts';
import { GeneratePDF } from '../application/pdf/GeneratePDF.ts';
import { DownloadPDF } from '../application/pdf/DownloadPDF.ts';
import { OCRStatus } from '../domain/ocr/ocr.types.ts';

console.log('[Service Worker] Initializing Snabby service worker...');

// 1. Instantiate Repositories
const sessionRepo = new IndexedDBSessionRepository();
const captureRepo = new IndexedDBCaptureRepository();
const ocrRepo = new IndexedDBOCRRepository();
const imageRepo = new IndexedDBImageRepository();

// 2. Instantiate Adapters / Services
const messageBus = new ChromeMessageBus();
const captureAdapter = new ChromeCaptureAdapter();
const imageProcessor = new BrowserImageProcessor();
const persistenceService = new IndexedDBCapturePersistenceService();
const ocrService = new TesseractOCRAdapter(messageBus);
const pdfService = new PdfLibPDFService(imageRepo, ocrRepo);
const downloadService = new ChromeDownloadAdapter();

// 3. Instantiate Page Infrastructure (parallel path — not yet active in production)
const pageRepo = new IndexedDBPageRepository();
const pagePersistenceService = new IndexedDBPagePersistenceService();
// createScreenshotPage is composed and ready but not yet wired into the active capture flow.
// The active production path remains: captureScreenshot → CaptureRepository / CapturePersistenceService.
// Exported for use in the next migration task, which will wire this into the active
// command handler. The active production path remains CaptureScreenshot until that task.
export const createScreenshotPage = new CreateScreenshotPage(
  captureAdapter,
  imageProcessor,
  pagePersistenceService,
  pageRepo
);

// 4. Instantiate Use Cases
const createSession = new CreateSession(sessionRepo);
const deleteSession = new DeleteSession(sessionRepo);
const runOCR = new RunOCR(ocrService, ocrRepo, captureRepo);
const generatePDF = new GeneratePDF(sessionRepo, captureRepo, ocrRepo, pdfService);
const downloadPDF = new DownloadPDF(downloadService);

let creatingOffscreenPromise: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.offscreen) {
    return;
  }

  const offscreenUrl = chrome.runtime.getURL('src/infrastructure/ocr/offscreen/offscreen.html');

  try {
    if (chrome.runtime.getContexts) {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [offscreenUrl]
      });
      if (existingContexts.length > 0) {
        return;
      }
    }
  } catch (e) {
    console.debug('[Service Worker] chrome.runtime.getContexts check:', e);
  }

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  creatingOffscreenPromise = (async () => {
    try {
      console.log('[Service Worker] Creating offscreen document for OCR...');
      await chrome.offscreen.createDocument({
        url: 'src/infrastructure/ocr/offscreen/offscreen.html',
        reasons: ['WORKERS' as any],
        justification: 'Run Tesseract.js OCR text recognition on captured screenshots',
      });
      console.log('[Service Worker] Offscreen document created successfully.');
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('Only a single offscreen document may be created')) {
        console.log('[Service Worker] Offscreen document already exists.');
        return;
      }
      console.error('[Service Worker] Failed to create offscreen document:', err);
      throw err;
    } finally {
      creatingOffscreenPromise = null;
    }
  })();

  await creatingOffscreenPromise;
}

// Decorate runOCR to broadcast events to UI when async OCR completes or fails
const originalRunOcrExecute = runOCR.execute.bind(runOCR);
runOCR.execute = async (input) => {
  try {
    await ensureOffscreenDocument();
    const result = await originalRunOcrExecute(input);
    console.log(`[Service Worker] OCR completed for page ${input.page.id}`);
    broadcastMessage({
      type: 'OCR_COMPLETED',
      captureId: input.page.id
    });
    return result;
  } catch (err: any) {
    console.warn(`[Service Worker] OCR failed for page ${input.page.id}:`, err);
    broadcastMessage({
      type: 'OCR_FAILED',
      captureId: input.page.id,
      error: {
        code: 'OCR_FAILED',
        message: err.message || String(err),
        operation: 'OCR'
      }
    });
    throw err;
  }
};

const captureScreenshot = new CaptureScreenshot(
  captureAdapter,
  imageProcessor,
  persistenceService,
  captureRepo,
  runOCR
);

// Settings Helper (stored in chrome.storage.local)
interface Settings {
  mode: 'VISIBLE' | 'REGION';
}

async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get('settings');
  return (result.settings as Settings) || { mode: 'VISIBLE' };
}

async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

// Broadcast helper
function broadcastMessage(message: any) {
  // Broadcast to other extension contexts (e.g. popups, options pages)
  chrome.runtime.sendMessage(message).catch((err) => {
    // Ignore errors when popup is closed
    console.debug('[Service Worker] Broadcast warning (likely no active UI listener):', err);
  });

  // Broadcast to all tabs where the Snabby content script is running
  chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Ignore tabs that don't have Snabby content script running
        });
      }
    }
  }).catch((err) => {
    console.warn('[Service Worker] Failed to query tabs for broadcast:', err);
  });
}

/**
 * runCropOverlayInPage — injected into the active tab's MAIN world via
 * chrome.scripting.executeScript. Renders a fullscreen drag-selection overlay.
 *
 * Returns a CropRect { x, y, width, height } in screenshot-pixel space
 * (CSS pixels × devicePixelRatio), or { cancelled: true } if aborted.
 *
 * IMPORTANT: This function must be completely self-contained — it cannot
 * reference anything from the outer service worker scope.
 */
function runCropOverlayInPage(): Promise<{ x: number; y: number; width: number; height: number; cancelled?: boolean }> {
  return new Promise((resolve) => {
    // Prevent double-injection
    if (document.getElementById('wsn-crop-overlay')) {
      resolve({ x: 0, y: 0, width: 0, height: 0, cancelled: true });
      return;
    }

    const dpr = window.devicePixelRatio || 1;

    const overlay = document.createElement('div');
    overlay.id = 'wsn-crop-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483646;cursor:crosshair;' +
      'background:rgba(0,0,0,0.4);user-select:none;';

    const selBox = document.createElement('div');
    selBox.style.cssText =
      'position:fixed;border:2px solid #ffffff;background:rgba(255,255,255,0.1);' +
      'box-shadow:0 0 0 9999px rgba(0,0,0,0.4);display:none;pointer-events:none;';

    const hint = document.createElement('div');
    hint.textContent = 'Drag to select a region   ·   Esc to cancel';
    hint.style.cssText =
      'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);' +
      'background:rgba(0,0,0,0.75);color:#fff;font:13px/1.4 system-ui,sans-serif;' +
      'padding:7px 16px;border-radius:8px;pointer-events:none;white-space:nowrap;';

    overlay.appendChild(selBox);
    overlay.appendChild(hint);
    document.body.appendChild(overlay);

    let startX = 0, startY = 0, dragging = false;

    const cleanup = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown, true);
    };

    const cancel = () => {
      cleanup();
      resolve({ x: 0, y: 0, width: 0, height: 0, cancelled: true });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
    };

    overlay.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      selBox.style.display = 'block';
      selBox.style.left = `${startX}px`; selBox.style.top = `${startY}px`;
      selBox.style.width = '0'; selBox.style.height = '0';
      hint.style.display = 'none';
    });

    overlay.addEventListener('mousemove', (e: MouseEvent) => {
      if (!dragging) return;
      const x = Math.min(e.clientX, startX), y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
      selBox.style.left = `${x}px`; selBox.style.top = `${y}px`;
      selBox.style.width = `${w}px`; selBox.style.height = `${h}px`;
    });

    overlay.addEventListener('mouseup', (e: MouseEvent) => {
      if (!dragging) return;
      dragging = false;
      const cssX = Math.min(e.clientX, startX), cssY = Math.min(e.clientY, startY);
      const cssW = Math.abs(e.clientX - startX), cssH = Math.abs(e.clientY - startY);
      if (cssW < 10 || cssH < 10) {
        selBox.style.display = 'none';
        hint.style.display = '';
        return;
      }
      cleanup();
      resolve({
        x: Math.round(cssX * dpr), y: Math.round(cssY * dpr),
        width: Math.round(cssW * dpr), height: Math.round(cssH * dpr),
      });
    });

    document.addEventListener('keydown', onKeyDown, true);
  });
}



let isCapturing = false;

// Keyboard Shortcut Command Listener
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'capture-visible') {
    if (isCapturing) {
      console.warn('[Service Worker] Shortcut capture ignored: capture already in progress.');
      return;
    }
    isCapturing = true;
    try {
      console.log('[Service Worker] Keyboard shortcut capture-visible triggered.');
      const sessions = await sessionRepo.findAll();
      if (sessions.length === 0) {
        console.warn('[Service Worker] No active session found — shortcut ignored.');
        broadcastMessage({
          type: 'SHOW_TOAST',
          message: 'No active session. Open Snabby and start a session first.',
          variant: 'warning'
        });
        return;
      }
      const session = sessions[0];
      const settings = await getSettings();
      const captureMode = settings.mode === 'VISIBLE' ? 'FULL_SCREEN' : 'CROP_REGION';

      // For CROP_REGION: inject crop overlay into active tab and await user selection
      if (captureMode === 'CROP_REGION') {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) {
          console.error('[Service Worker] No active tab found for crop overlay.');
          return;
        }
        try {
          // Inject CropOverlay and run it; returns CropRect or { cancelled: true }
          const [injectionResult] = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: runCropOverlayInPage,
            world: 'MAIN',
          });
          const rect = injectionResult?.result;
          if (!rect || rect.cancelled || rect.width < 10 || rect.height < 10) {
            console.log('[Service Worker] Crop overlay: cancelled or too small.');
            return;
          }
          captureAdapter.setCropRect(rect);
        } catch (err) {
          console.error('[Service Worker] Failed to inject crop overlay:', err);
          return;
        }
      }

      const result = await captureScreenshot.execute({
        sessionId: session.id,
        captureMode,
      });

      const captures = await captureRepo.findBySessionId(session.id);
      broadcastMessage({
        type: 'CAPTURE_COMPLETE',
        captureId: result.capture.id,
        count: captures.length
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
        console.warn('[Service Worker] Shortcut capture ignored due to visible tab capture quota limit.');
      } else {
        console.error('[Service Worker] Shortcut capture failed:', err);
      }
    } finally {
      isCapturing = false;
    }
  }
});

// Message Router for React UI Commands
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  // Ignore messages from offscreen targeted specifically for offscreen
  if (message && message.target === 'offscreen') {
    return false;
  }

  console.log('[Service Worker] Received message command:', message, 'from:', sender.id);

  // Helper to handle async operations in a separate scope
  const handleMessage = async () => {
    try {
      switch (message.type) {
        case 'GET_SESSION': {
          const sessions = await sessionRepo.findAll();
          const settings = await getSettings();
          return {
            success: true,
            data: {
              session: sessions[0] || null,
              settings,
              isActivatedGlobally
            }
          };
        }
        case 'START_SESSION': {
          const sessions = await sessionRepo.findAll();
          if (sessions.length > 0) {
            return {
              success: false,
              error: {
                code: 'SESSION_ACTIVE',
                message: 'A session is already active.',
                operation: 'START_SESSION'
              }
            };
          }
          const session = await createSession.execute(message.name);
          broadcastMessage({ type: 'SESSION_UPDATED' });
          return {
            success: true,
            data: { session }
          };
        }
        case 'CONFIRM_OVERWRITE': {
          const sessions = await sessionRepo.findAll();
          for (const s of sessions) {
            await deleteSession.execute(s.id);
          }
          const session = await createSession.execute(message.name);
          broadcastMessage({ type: 'SESSION_UPDATED' });
          return {
            success: true,
            data: { session }
          };
        }
        case 'END_SESSION': {
          const sessions = await sessionRepo.findAll();
          for (const s of sessions) {
            await deleteSession.execute(s.id);
          }
          broadcastMessage({ type: 'SESSION_UPDATED' });
          return { success: true };
        }
        case 'SET_CAPTURE_MODE': {
          await setSettings({ mode: message.mode });
          broadcastMessage({ type: 'SESSION_UPDATED' });
          return {
            success: true,
            data: { mode: message.mode }
          };
        }
        case 'DELETE_CAPTURE': {
          await captureRepo.delete(message.captureId);
          broadcastMessage({ type: 'SESSION_UPDATED' });
          return { success: true };
        }
        case 'GET_ALL_THUMBNAILS': {
          const sessions = await sessionRepo.findAll();
          if (sessions.length === 0) {
            return {
              success: true,
              data: { captures: [] }
            };
          }
          const captures = await captureRepo.findBySessionId(sessions[0].id);
          const capturesWithImages = await Promise.all(
            captures.map(async (c) => {
              const imageAsset = await imageRepo.findById(c.imageId);
              const ocrResult = await ocrRepo.findByCaptureId(c.id);

              let status: string = OCRStatus.NOT_STARTED;
              if (ocrResult) {
                status = ocrResult.status;
              } else if (c.status === 'PROCESSING') {
                status = OCRStatus.PROCESSING;
              } else if (c.status === 'FAILED') {
                status = OCRStatus.FAILED;
              }

              let imageUrl = '';
              if (imageAsset) {
                const arrayBuffer = await imageAsset.data.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                let binaryString = '';
                const len = bytes.byteLength;
                const chunk = 8192;
                for (let i = 0; i < len; i += chunk) {
                  const slice = bytes.subarray(i, Math.min(i + chunk, len));
                  binaryString += String.fromCharCode.apply(null, slice as any);
                }
                const base64 = btoa(binaryString);
                imageUrl = `data:${imageAsset.data.type};base64,${base64}`;
              }

              return {
                id: c.id,
                sessionId: c.sessionId,
                imageId: c.imageId,
                status,
                order: c.order,
                createdAt: c.createdAt,
                imageUrl
              };
            })
          );
          return {
            success: true,
            data: { captures: capturesWithImages }
          };
        }
        case 'CHECK_OCR_STATUS': {
          const sessions = await sessionRepo.findAll();
          if (sessions.length === 0) {
            return {
              success: true,
              data: { pendingCount: 0, totalCount: 0 }
            };
          }
          const captures = await captureRepo.findBySessionId(sessions[0].id);
          const ocrResults = await Promise.all(captures.map(c => ocrRepo.findByCaptureId(c.id)));
          const completedOrFailedCount = ocrResults.filter(
            r => r && (r.status === OCRStatus.COMPLETED || r.status === OCRStatus.FAILED)
          ).length;
          const totalCount = captures.length;
          const pendingCount = totalCount - completedOrFailedCount;
          return {
            success: true,
            data: { pendingCount, totalCount }
          };
        }
        case 'CAPTURE_REQUEST': {
          if (isCapturing) {
            return {
              success: false,
              error: {
                code: 'CAPTURE_IN_PROGRESS',
                message: 'A capture is already in progress.',
                operation: 'CAPTURE_REQUEST'
              }
            };
          }
          isCapturing = true;
          try {
            const sessions = await sessionRepo.findAll();
            if (sessions.length === 0) {
              return {
                success: false,
                error: {
                  code: 'NO_ACTIVE_SESSION',
                  message: 'No active session found.',
                  operation: 'CAPTURE_REQUEST'
                }
              };
            }
            const session = sessions[0];
            const settings = await getSettings();
            const captureMode = settings.mode === 'VISIBLE' ? 'FULL_SCREEN' : 'CROP_REGION';

            // For CROP_REGION: inject crop overlay into active tab and await user selection
            if (captureMode === 'CROP_REGION') {
              const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
              if (!activeTab?.id) {
                return {
                  success: false,
                  error: { code: 'NO_ACTIVE_TAB', message: 'No active tab found for crop overlay.', operation: 'CAPTURE_REQUEST' }
                };
              }
              try {
                const [injectionResult] = await chrome.scripting.executeScript({
                  target: { tabId: activeTab.id },
                  func: runCropOverlayInPage,
                  world: 'MAIN',
                });
                const rect = injectionResult?.result;
                if (!rect || rect.cancelled || rect.width < 10 || rect.height < 10) {
                  // User cancelled — return success:true with null capture (no error)
                  return { success: true, data: { capture: null, cancelled: true } };
                }
                captureAdapter.setCropRect(rect);
              } catch (err: any) {
                console.error('[Service Worker] Crop overlay injection failed:', err);
                return {
                  success: false,
                  error: { code: 'CROP_OVERLAY_FAILED', message: err.message, operation: 'CAPTURE_REQUEST' }
                };
              }
            }

            const result = await captureScreenshot.execute({
              sessionId: session.id,
              captureMode,
            });

            const updatedCaptures = await captureRepo.findBySessionId(session.id);
            broadcastMessage({
              type: 'CAPTURE_COMPLETE',
              captureId: result.capture.id,
              count: updatedCaptures.length
            });

            return {
              success: true,
              data: { capture: result.capture }
            };
          } finally {
            isCapturing = false;
          }
        }
        case 'EXPORT_PDF': {
          const sessions = await sessionRepo.findAll();
          if (sessions.length === 0) {
            return {
              success: false,
              error: {
                code: 'NO_ACTIVE_SESSION',
                message: 'No active session found.',
                operation: 'EXPORT_PDF'
              }
            };
          }
          const session = sessions[0];

          // Generate PDF — if this throws, session is preserved (per doc 08 §25)
          const pdfBlob = await generatePDF.execute({
            sessionId: session.id,
            skipPendingOcr: message.skipPendingOcr ?? false
          });

          // Download PDF — if this throws, session is preserved
          await downloadPDF.execute({
            pdfBlob,
            filename: message.filename
          });

          // Only terminate the session AFTER a confirmed successful download
          console.log('[Service Worker] PDF downloaded successfully. Ending session:', session.id);
          await deleteSession.execute(session.id);

          // Broadcast session state change so React UI refreshes to NewSessionView
          broadcastMessage({ type: 'SESSION_UPDATED' });

          return { success: true };
        }
        default:
          return {
            success: false,
            error: {
              code: 'UNKNOWN_COMMAND',
              message: `Unknown command type: ${message.type}`,
              operation: 'ROUTE_MESSAGE'
            }
          };
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
        console.warn('[Service Worker] Capture request ignored due to visible tab capture quota limit.');
      } else {
        console.error('[Service Worker] Message handling failure:', err);
      }
      return {
        success: false,
        error: {
          code: 'OPERATION_FAILED',
          message: err.message || String(err),
          operation: message.type
        }
      };
    }
  };

  handleMessage().then((response) => {
    sendResponse(response);
  });

  return true; // Keep channel open for async response
});

// Active tab activation state tracking (tabId -> boolean)
const activatedTabs = new Map<number, boolean>();
let isActivatedGlobally = false;

function isSystemPage(url?: string): boolean {
  if (!url) return false;
  const cleanUrl = url.toLowerCase();
  return (
    cleanUrl.startsWith('chrome://') ||
    cleanUrl.startsWith('chrome-extension://') ||
    cleanUrl.startsWith('devtools://') ||
    cleanUrl.startsWith('https://chrome.google.com/webstore') ||
    cleanUrl.startsWith('https://chromewebstore.google.com')
  );
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  if (tab.url && isSystemPage(tab.url)) {
    console.warn('[Service Worker] Cannot activate Snabby on Chrome system or Web Store pages:', tab.url);
    return;
  }

  isActivatedGlobally = !isActivatedGlobally;

  if (isActivatedGlobally) {
    const currentTabInjected = activatedTabs.get(tab.id) || false;
    if (!currentTabInjected) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['assets/popup.js']
        });
        activatedTabs.set(tab.id, true);
      } catch (err: any) {
        console.warn('[Service Worker] Cannot inject popup.js into this page:', err.message || String(err));
      }
    }
  }

  // Broadcast activation state update to ALL tabs using broadcastMessage
  broadcastMessage({
    type: 'ACTIVATION_CHANGED',
    activated: isActivatedGlobally
  });
});

// Extension Life Cycle Events
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Service Worker] Snabby extension installed.');
  ensureOffscreenDocument();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Service Worker] Browser startup.');
  ensureOffscreenDocument();
});

// Run offscreen check on startup
ensureOffscreenDocument();
