// Suppress irrelevant runtime errors (especially from Monaco on mobile)
window.addEventListener('error', (e) => {
  const msg = e.message || '';
  if (msg === 'Script error.' || msg.includes('Canceled')) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
});

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason || {};
  const msg = reason.message || reason.toString();
  if (msg === 'Script error.' || msg.includes('Canceled')) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
});
window.addEventListener('error', (e) => {
  const msg = e.message || '';
  if (msg === 'Script error.' || msg.includes('Canceled')) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
});

window.addEventListener('unhandledrejection', (e) => {
  const msg = (e.reason && e.reason.message) || '';
  if (msg === 'Script error.' || msg.includes('Canceled')) {
    e.preventDefault();
  }
});
window.addEventListener('error', (e) => {
  if (
    e.message &&
    e.message.includes('ResizeObserver loop completed with undelivered notifications')
  ) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
});

// — now your normal React bootstrap below —
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
const root = createRoot(container);
const observerErrorHandler = (e) => {
  if (e.message && e.message.includes('ResizeObserver loop')) {
    e.stopImmediatePropagation();
  }
};
window.addEventListener('error', observerErrorHandler);
root.render(<App />);
