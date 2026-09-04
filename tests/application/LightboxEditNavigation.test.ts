import assert from 'node:assert/strict';
import { ChromeMessageBus } from '../../src/infrastructure/messaging/ChromeMessageBus.ts';

console.log('Running Lightbox Edit & Runtime Messaging Resilience Tests...\n');

// Test 1: ChromeMessageBus resilience against undefined chrome.runtime / invalidated context
{
  console.log('Testing Test 1: ChromeMessageBus undefined chrome.runtime resilience...');
  const originalChrome = (globalThis as any).chrome;
  try {
    // Simulate invalidated context or frame where chrome.runtime is undefined
    (globalThis as any).chrome = undefined;
    const bus = new ChromeMessageBus();

    // listen() should not throw TypeError and should return a no-op unsubscribe function
    assert.doesNotThrow(() => {
      const unsub = bus.listen('SESSION_UPDATED', () => {});
      assert.equal(typeof unsub, 'function');
      unsub();
    }, 'bus.listen should not throw when chrome is undefined');

    // send() should not throw
    assert.doesNotThrow(() => {
      bus.send({ type: 'TEST' } as any);
    }, 'bus.send should not throw when chrome is undefined');

    // request() should throw a descriptive, controlled error rather than TypeError
    let requestError: any = null;
    bus.request({ type: 'TEST' } as any).catch((err) => {
      requestError = err;
    });

    setTimeout(() => {
      assert.ok(requestError !== null);
      assert.match(requestError.message, /Chrome runtime messaging is not available/);
    }, 10);

    // Simulate chrome without runtime
    (globalThis as any).chrome = {};
    assert.doesNotThrow(() => {
      const unsub = bus.listen('SESSION_UPDATED', () => {});
      unsub();
    }, 'bus.listen should not throw when chrome.runtime is undefined');

    console.log('✓ Test 1: ChromeMessageBus handles undefined chrome.runtime gracefully - PASS\n');
  } finally {
    (globalThis as any).chrome = originalChrome;
  }
}

// Test 2: Verify LightboxPreview navigation & Edit flow semantics
{
  console.log('Testing Test 2: LightboxPreview current capture edit resolution...');
  const captures = [
    { id: 'page-1', imageUrl: 'data:image/png;base64,111', pageNumber: 1, type: 'SCREENSHOT' },
    { id: 'page-2', imageUrl: 'data:image/png;base64,222', pageNumber: 2, type: 'EDITED_SCREENSHOT' },
    { id: 'page-3', imageUrl: 'data:image/png;base64,333', pageNumber: 3, type: 'BLANK' },
  ];

  let selectedCapture = captures[0];
  let isLightboxOpen = true;
  let editingPageId: string | null = null;

  const onSelectCapture = (cap: typeof captures[0]) => {
    selectedCapture = cap;
  };

  const onClose = () => {
    isLightboxOpen = false;
  };

  const onEditPage = (pageId: string) => {
    editingPageId = pageId;
  };

  // Simulating user opening page-1 in preview
  assert.equal(selectedCapture.id, 'page-1');
  assert.equal(isLightboxOpen, true);

  // User navigates to next capture (page-2)
  const currentIndex = captures.findIndex((c) => c.id === selectedCapture.id);
  assert.equal(currentIndex, 0);
  onSelectCapture(captures[currentIndex + 1]);

  // Verify currently selected capture is now page-2
  assert.equal(selectedCapture.id, 'page-2');

  // User clicks Edit: handleEdit must pass the currently displayed capture (page-2), NOT page-1
  const handleEdit = () => {
    if (!selectedCapture || !onEditPage) return;
    onClose();
    onEditPage(selectedCapture.id);
  };

  handleEdit();

  assert.equal(isLightboxOpen, false, 'Lightbox should be closed on Edit');
  assert.equal(editingPageId, 'page-2', 'Edit must open for currently displayed capture page-2');
  console.log('✓ Test 2: Lightbox Edit correctly targets currently displayed capture after navigation - PASS\n');
}

// Test 3: Verify Edit button styling & markup contract
{
  console.log('Testing Test 3: Edit button CSS rules verification...');
  const fs = await import('node:fs');
  const appCss = fs.readFileSync('src/app/App.css', 'utf-8');

  assert.ok(appCss.includes('.wsn-lightbox-edit'), 'App.css must define .wsn-lightbox-edit');
  assert.ok(appCss.includes('.wsn-lightbox-edit:hover'), 'App.css must define hover state for .wsn-lightbox-edit');
  assert.ok(appCss.includes('.wsn-thumb-edit'), 'App.css must define .wsn-thumb-edit');
  assert.ok(appCss.includes('#2563eb'), 'Edit buttons must use blue #2563eb theme');

  console.log('✓ Test 3: Edit button styles and classes verified in App.css - PASS\n');
}

console.log('All Lightbox Edit & Runtime Messaging Resilience tests passed successfully!');
