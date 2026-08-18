import { IndexedDBCaptureRepository } from '../infrastructure/indexeddb/repositories/IndexedDBCaptureRepository.ts';
import { IndexedDBImageRepository } from '../infrastructure/indexeddb/repositories/IndexedDBImageRepository.ts';
import { IndexedDBOCRRepository } from '../infrastructure/indexeddb/repositories/IndexedDBOCRRepository.ts';
import { IndexedDBSessionRepository } from '../infrastructure/indexeddb/repositories/IndexedDBSessionRepository.ts';
import { IndexedDBCapturePersistenceService } from '../infrastructure/indexeddb/services/IndexedDBCapturePersistenceService.ts';

import { ChromeCaptureAdapter } from '../infrastructure/chrome/capture/ChromeCaptureAdapter.ts';
import { BrowserImageProcessor } from '../infrastructure/image/BrowserImageProcessor.ts';
import { ChromeMessageBus } from '../infrastructure/messaging/ChromeMessageBus.ts';
import { TesseractOCRAdapter } from '../infrastructure/ocr/TesseractOCRAdapter.ts';
import { PdfLibPDFService } from '../infrastructure/pdf/PdfLibPDFService.ts';
import { ChromeDownloadAdapter } from '../infrastructure/chrome/downloads/ChromeDownloadAdapter.ts';

import { CreateSession } from '../application/session/CreateSession.ts';
import { DeleteSession } from '../application/session/DeleteSession.ts';
import { CaptureScreenshot } from '../application/capture/CaptureScreenshot.ts';
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

// 3. Instantiate Use Cases
const createSession = new CreateSession(sessionRepo);
const deleteSession = new DeleteSession(sessionRepo);
const runOCR = new RunOCR(ocrService, ocrRepo);
const generatePDF = new GeneratePDF(sessionRepo, captureRepo, pdfService);
const downloadPDF = new DownloadPDF(downloadService);

// Decorate runOCR to broadcast events to UI when async OCR completes or fails
const originalRunOcrExecute = runOCR.execute.bind(runOCR);
runOCR.execute = async (input) => {
  try {
    const result = await originalRunOcrExecute(input);
    console.log(`[Service Worker] OCR completed for capture ${input.capture.id}`);
    broadcastMessage({
      type: 'OCR_COMPLETED',
      captureId: input.capture.id
    });
    return result;
  } catch (err: any) {
    console.warn(`[Service Worker] OCR failed for capture ${input.capture.id}:`, err);
    broadcastMessage({
      type: 'OCR_FAILED',
      captureId: input.capture.id,
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
  chrome.runtime.sendMessage(message).catch((err) => {
    // Ignore errors when popup is closed
    console.debug('[Service Worker] Broadcast warning (likely no active UI listener):', err);
  });
}

// Offscreen Document creation
async function ensureOffscreenDocument() {
  try {
    const hasDocument = await chrome.offscreen.hasDocument();
    if (hasDocument) {
      console.log('[Service Worker] Offscreen document already exists.');
      return;
    }
  } catch {
    // Fallback
  }

  console.log('[Service Worker] Creating offscreen document...');
  try {
    await chrome.offscreen.createDocument({
      url: 'src/infrastructure/ocr/offscreen/offscreen.html',
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'OCR text recognition'
    });
    console.log('[Service Worker] Offscreen document created successfully.');
  } catch (error) {
    console.error('[Service Worker] Failed to create offscreen document:', error);
  }
}

// Keyboard Shortcut Command Listener
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'capture-visible') {
    try {
      console.log('[Service Worker] Keyboard shortcut capture-visible triggered.');
      const sessions = await sessionRepo.findAll();
      if (sessions.length === 0) {
        console.warn('[Service Worker] No active session found.');
        return;
      }
      const session = sessions[0];
      const settings = await getSettings();

      const result = await captureScreenshot.execute({
        sessionId: session.id,
        captureMode: settings.mode === 'VISIBLE' ? 'FULL_SCREEN' : 'CROP_REGION'
      });

      const captures = await captureRepo.findBySessionId(session.id);
      broadcastMessage({
        type: 'CAPTURE_COMPLETE',
        captureId: result.capture.id,
        count: captures.length
      });
    } catch (err: any) {
      console.error('[Service Worker] Shortcut capture failed:', err);
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
              settings
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
          return { success: true };
        }
        case 'SET_CAPTURE_MODE': {
          await setSettings({ mode: message.mode });
          return {
            success: true,
            data: { mode: message.mode }
          };
        }
        case 'DELETE_CAPTURE': {
          await captureRepo.delete(message.captureId);
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
          return {
            success: true,
            data: { captures }
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
          const completedCount = ocrResults.filter(r => r && r.status === OCRStatus.COMPLETED).length;
          const totalCount = captures.length;
          const pendingCount = totalCount - completedCount;
          return {
            success: true,
            data: { pendingCount, totalCount }
          };
        }
        case 'CAPTURE_REQUEST': {
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
          const result = await captureScreenshot.execute({
            sessionId: session.id,
            captureMode: settings.mode === 'VISIBLE' ? 'FULL_SCREEN' : 'CROP_REGION'
          });

          const captures = await captureRepo.findBySessionId(session.id);
          broadcastMessage({
            type: 'CAPTURE_COMPLETE',
            captureId: result.capture.id,
            count: captures.length
          });

          return {
            success: true,
            data: { capture: result.capture }
          };
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
          
          const pdfBlob = await generatePDF.execute({
            sessionId: session.id,
            skipPendingOcr: message.skipPendingOcr ?? false
          });

          await downloadPDF.execute({
            pdfBlob,
            filename: message.filename
          });

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
      console.error('[Service Worker] Message handling failure:', err);
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
