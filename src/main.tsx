// Intercept deprecated 'unload' event registrations to prevent Permissions Policy violations
// on modern websites (e.g. GitHub: Permissions-Policy: unload=()).
// Redirect to 'pagehide' as recommended by W3C/Chrome.
if (typeof window !== 'undefined' && window.addEventListener) {
  const _origWindowAddEventListener = window.addEventListener;
  const _origWindowRemoveEventListener = window.removeEventListener;

  window.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) {
    if (type === 'unload') {
      return _origWindowAddEventListener.call(window, 'pagehide', listener, options);
    }
    return _origWindowAddEventListener.call(this, type, listener, options);
  };

  window.removeEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ) {
    if (type === 'unload') {
      return _origWindowRemoveEventListener.call(window, 'pagehide', listener, options);
    }
    return _origWindowRemoveEventListener.call(this, type, listener, options);
  };
}

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

  // Ensure Google Fonts (Poppins & Montserrat) are loaded into document.head and Shadow DOM for font rendering
  if (!document.getElementById('wsn-google-fonts')) {
    const fontLink = document.createElement('link');
    fontLink.id = 'wsn-google-fonts';
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Montserrat:wght@600;700&display=swap';
    document.head.appendChild(fontLink);
  }

  // Scope Excalidraw's `:root` CSS rules so they apply properly inside Shadow DOM
  const scopedExcalidrawCss = excalidrawCss
    .replace(/:root\[dir=ltr\]/g, ':host:not([dir="rtl"])')
    .replace(/:root\[dir=rtl\]/g, ':host([dir="rtl"])')
    .replace(/:root/g, ':host, .excalidraw');

  // Inject Snabby-specific styles & Excalidraw styles into Shadow DOM
  const fontLinkShadow = document.createElement('link');
  fontLinkShadow.rel = 'stylesheet';
  fontLinkShadow.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Montserrat:wght@600;700&display=swap';
  shadow.appendChild(fontLinkShadow);

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
