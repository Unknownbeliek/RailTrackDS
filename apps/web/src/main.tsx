import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './styles/global.css';
import { App } from './app/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Providers } from './app/providers';
import { registerServiceWorker } from './lib/offline';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <Providers>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </Providers>
  </StrictMode>,
);

registerServiceWorker();
