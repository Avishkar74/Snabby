import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.tsx';
import { ChromeMessageBus } from './infrastructure/messaging/ChromeMessageBus.ts';
import { MessageBusProvider } from './app/providers/MessageBusContext.tsx';

// Import ONLY the Snabby content UI CSS (ported from original getStyles())
import appCss from './app/App.css?inline';

if (!document.getElementById('wsn-root')) {
  const host = document.createElement('div');
  host.id = 'wsn-root';
  host.style.cssText = 'all:initial; position:fixed; z-index:2147483647; top:0; left:0; width:0; height:0; pointer-events:none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Inject only the Snabby-specific styles — NO generic index.css
  const styleEl = document.createElement('style');
  styleEl.textContent = appCss;
  shadow.appendChild(styleEl);

  const container = document.createElement('div');
  container.id = 'wsn-react-root';
  shadow.appendChild(container);

  const bus = new ChromeMessageBus();

  createRoot(container).render(
    <StrictMode>
      <MessageBusProvider bus={bus}>
        <App />
      </MessageBusProvider>
    </StrictMode>
  );
}
