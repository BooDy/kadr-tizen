import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/tv/AppErrorBoundary';
import './index.css';

if (typeof window !== 'undefined' && (window as any).tizen) {
  document.body.classList.add('cursor-none');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
