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
