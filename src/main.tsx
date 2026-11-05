import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { PrivacyProvider } from './hooks/usePrivacy.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrivacyProvider>
      <App />
    </PrivacyProvider>
  </React.StrictMode>
);

// Android/Chrome biedt de installatie één keer aan: bewaar dat moment voor de knop op de Account-pagina.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as unknown as { __installPrompt?: Event }).__installPrompt = e;
});

// Service worker: maakt de site installeerbaar als app (zie public/sw.js). Alleen in de echte build.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
