import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('Running PageEditor Close Resilience & Error Boundary Tests...');

// ─── Test 1: Verify dist/assets/popup.js Post-Processing Invariants ───
const popupJsPath = path.resolve('dist/assets/popup.js');
assert(fs.existsSync(popupJsPath), 'dist/assets/popup.js must exist after build');
const popupJsContent = fs.readFileSync(popupJsPath, 'utf8');

// 1. Unload replacement
assert(!popupJsContent.includes('window,"unload"'), 'Excalidraw window unload must be replaced');
assert(!popupJsContent.includes("window,'unload'"), 'Excalidraw window unload must be replaced');
assert(!popupJsContent.includes('window,`unload`'), 'Excalidraw window unload must be replaced');
console.log('✓ Test 1.1: No deprecated unload listeners in popup.js - PASS');

// 2. Clipboard scoping
// Excalidraw should NOT listen to document for paste, cut, copy
const documentPasteMatches = popupJsContent.match(/Wl\(document,[`'"]paste[`'"],this\.pasteFromClipboard/g) || [];
assert.strictEqual(documentPasteMatches.length, 0, 'pasteFromClipboard must NOT be bound to document');

const documentCutMatches = popupJsContent.match(/Wl\(document,[`'"]cut[`'"],this\.onCut/g) || [];
assert.strictEqual(documentCutMatches.length, 0, 'onCut must NOT be bound to document');

const documentCopyMatches = popupJsContent.match(/Wl\(document,[`'"]copy[`'"],this\.onCopy/g) || [];
assert.strictEqual(documentCopyMatches.length, 0, 'onCopy must NOT be bound to document');
console.log('✓ Test 1.2: Excalidraw clipboard listeners scoped to container, NOT document - PASS');

// 3. Focus and selection guards on detached elements
assert(popupJsContent.includes('n||(f.isConnected?f.focus():null)'), 'TextEditor focus must check f.isConnected');
assert(popupJsContent.includes('try{n.removeAllRanges()}catch{}'), 'TextEditor selection removeAllRanges must be guarded');
console.log('✓ Test 1.3: DOMException guards for detached text focus and ranges - PASS');

// 4. Clipboard parsing guards (Tue & Eue)
assert(popupJsContent.includes('Array.isArray(n.value)&&n.value.every'), 'Tue array check must prevent TypeError');
assert(popupJsContent.includes('try{n=await Tue(e,t);}catch{return{type:"text",value:""}}'), 'Eue must catch Tue exceptions');
console.log('✓ Test 1.4: Clipboard parser safe try-catch wrapper in place - PASS');

// 5. File picker AbortError / DOMException console.error elimination
assert(!popupJsContent.includes('AbortError`?console.warn(e):console.error(e)'), 'AbortError console.error must be eliminated');
console.log('✓ Test 1.5: File picker DOMException/AbortError error logging eliminated - PASS');

// ─── Test 2: Verify ErrorBoundary Component Exists and Behaves Correctly ───
const errorBoundaryPath = path.resolve('src/shared/components/ErrorBoundary.tsx');
assert(fs.existsSync(errorBoundaryPath), 'ErrorBoundary component must exist');
const errorBoundaryCode = fs.readFileSync(errorBoundaryPath, 'utf8');
assert(errorBoundaryCode.includes('getDerivedStateFromError'), 'ErrorBoundary must implement getDerivedStateFromError');
assert(errorBoundaryCode.includes('componentDidCatch'), 'ErrorBoundary must implement componentDidCatch');
console.log('✓ Test 2: ErrorBoundary implementation verified - PASS');

// ─── Test 3: Verify App.tsx wraps PageEditor in ErrorBoundary and retains session activation ───
const appPath = path.resolve('src/app/App.tsx');
const appCode = fs.readFileSync(appPath, 'utf8');
assert(appCode.includes('<ErrorBoundary name="PageEditor" fallback={null}>'), 'PageEditor must be wrapped in ErrorBoundary');
assert(appCode.includes('const isActivated = manualActivated || session !== null;'), 'isActivated must maintain activation when session exists');
console.log('✓ Test 3: App.tsx wraps PageEditor in ErrorBoundary and protects session activation - PASS');

// ─── Test 4: Verify main.tsx wraps App in Root ErrorBoundary ───
const mainPath = path.resolve('src/main.tsx');
const mainCode = fs.readFileSync(mainPath, 'utf8');
assert(mainCode.includes('<ErrorBoundary name="Root">'), 'main.tsx must wrap App in Root ErrorBoundary');
assert(mainCode.includes('window.addEventListener(\'unhandledrejection\''), 'main.tsx must register unhandledrejection guard');
console.log('✓ Test 4: main.tsx Root ErrorBoundary and unhandledrejection guard verified - PASS');

// ─── Test 5: Verify Service Worker persists isActivatedGlobally ───
const swPath = path.resolve('src/service-worker/index.ts');
const swCode = fs.readFileSync(swPath, 'utf8');
assert(swCode.includes('getStoredActivation'), 'Service Worker must implement getStoredActivation');
assert(swCode.includes('chrome.storage.local.set({ isActivatedGlobally })'), 'Service Worker must save activation to storage');
console.log('✓ Test 5: Service Worker activation persistence verified - PASS');

// ─── Test 6: Verify PageEditor has image tool enabled in UIOptions ───
const editorPath = path.resolve('src/features/page-editor/components/PageEditor.tsx');
const editorCode = fs.readFileSync(editorPath, 'utf8');
assert(editorCode.includes('image: true'), 'PageEditor must enable image tool in UIOptions');
assert(!editorCode.includes('[data-testid="toolbar-image"]'), 'PageEditor must not hide image tool in CSS');
console.log('✓ Test 6: PageEditor enables image tool in UIOptions and toolbar - PASS');

console.log('\nAll PageEditor Close Resilience & Error Boundary tests PASSED successfully!');
