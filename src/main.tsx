import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './context/AppContext';
import { LanguageProvider } from './context/LanguageContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </LanguageProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.log('SW registration failed:', err));
    });
  } else {
    // In development, unregister any active service worker to avoid caching interference
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister();
      }
    }).catch(() => {});
  }
}

