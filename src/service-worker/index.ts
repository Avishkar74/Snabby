// Snabby Service Worker entry point
console.log('[Service Worker] Service Worker loaded.');

async function ensureOffscreenDocument() {
  try {
    const hasDocument = await chrome.offscreen.hasDocument();
    if (hasDocument) {
      console.log('[Service Worker] Offscreen document already exists.');
      return;
    }
  } catch {
    // Fallback if hasDocument is not supported or errors out
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

// Ensure offscreen document is loaded when worker is initialized or starting
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Service Worker] Snabby extension installed.');
  ensureOffscreenDocument();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Service Worker] Browser startup.');
  ensureOffscreenDocument();
});

// Run immediately when service worker starts
ensureOffscreenDocument();
