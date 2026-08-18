// Snabby OCR Offscreen entry point
console.log('[Offscreen] Offscreen document script loaded.');

// Message handler for service worker requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Offscreen] Received message:', message, 'from:', sender.id);
  
  if (message && message.target === 'offscreen' && message.action === 'ping') {
    sendResponse({ success: true, status: 'ready' });
  }
  
  return true;
});
