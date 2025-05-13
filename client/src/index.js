import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './App.css'; // Assuming App.css contains global styles or styles for App.js

// Global error handler for specific, known, non-critical errors.
// It's generally better to handle errors within components using Error Boundaries
// or to let React's development overlay show them.
// Use this sparingly.
window.addEventListener('error', (e) => {
  const msg = e.message || '';
  // Suppress ResizeObserver loop errors, which are common and usually benign in dev.
  if (msg.includes('ResizeObserver loop') || msg.includes('Script error.') || msg.includes('Canceled')) {
    // e.preventDefault(); // Be cautious with preventDefault on global errors
    // e.stopImmediatePropagation(); // Be cautious with stopImmediatePropagation
    console.warn('Suppressed known error:', msg); // Log it instead of silently ignoring
  }
});

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason || {};
  const msg = reason.message || String(reason);
  if (msg.includes('Script error.') || msg.includes('Canceled')) {
    // e.preventDefault();
    // e.stopImmediatePropagation();
    console.warn('Suppressed known unhandled rejection:', msg);
  }
});

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error(
    "Fatal Error: The root element with ID 'root' was not found in your public/index.html. React cannot mount the application."
  );
  // You could display a message to the user on the page itself here if you want.
  document.body.innerHTML = '<div style="padding: 20px; text-align: center; font-family: sans-serif;"><h1>Application Error</h1><p>Could not find the root HTML element to launch the application. Please check the console.</p></div>';
}
