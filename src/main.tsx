import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.tsx';
import { ChromeMessageBus } from './infrastructure/messaging/ChromeMessageBus.ts';
import { MessageBusProvider } from './app/providers/MessageBusContext.tsx';

// Import ONLY the Snabby content UI CSS (ported from original getStyles())
import appCss from './app/App.css?inline';
import excalidrawCss from '@excalidraw/excalidraw/index.css?inline';

if (!document.getElementById('wsn-root')) {
  const host = document.createElement('div');
  host.id = 'wsn-root';
  host.style.cssText = 'all:initial; position:fixed; z-index:2147483647; top:0; left:0; width:0; height:0; pointer-events:none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Scope Excalidraw's `:root` CSS rules so they apply properly inside Shadow DOM
  const scopedExcalidrawCss = excalidrawCss
    .replace(/:root\[dir=ltr\]/g, ':host, :root, .excalidraw, [dir=ltr]')
    .replace(/:root\[dir=rtl\]/g, ':host[dir=rtl], :root[dir=rtl], [dir=rtl]')
    .replace(/:root/g, ':host, :root, .excalidraw');

  // Inject Snabby-specific styles & Excalidraw styles into Shadow DOM
  const styleEl = document.createElement('style');
  styleEl.textContent = appCss + '\n' + scopedExcalidrawCss;
  shadow.appendChild(styleEl);

  const container = document.createElement('div');
  container.id = 'wsn-react-root';
  shadow.appendChild(container);

  // Prevent keyboard events from leaking out of the Shadow DOM into the host page.
  // Without this, composed keyboard events retarget and bubble to the host document,
  // triggering host-page shortcuts (e.g. GitHub search box, Slack message compose).
  const KEYBOARD_EVENTS = ['keydown', 'keyup', 'keypress'] as const;
  KEYBOARD_EVENTS.forEach((eventType) => {
    container.addEventListener(eventType, (e: Event) => {
      e.stopPropagation();
    });
  });

  const bus = new ChromeMessageBus();

  createRoot(container).render(
    <StrictMode>
      <MessageBusProvider bus={bus}>
        <App />
      </MessageBusProvider>
    </StrictMode>
  );
}
