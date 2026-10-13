import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppErrorBoundary } from '@hopdock/ui';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <AppErrorBoundary><App /></AppErrorBoundary>
    </StrictMode>,
  );
}
