import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/index.css';
import { installErrorBanner } from './lib/errorBanner';
import { ensureFresh } from './lib/freshness';
import { consumeHomeLink } from './lib/homeLink';

installErrorBanner();
consumeHomeLink();
void ensureFresh();

// Service workers only exist on http(s); the native shells load from other schemes.
if (location.protocol === 'https:' || location.hostname === 'localhost') registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
