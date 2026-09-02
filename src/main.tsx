import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ToastProvider } from './components/Toast/Toast';
import { AppStoreProvider } from './core/state/AppStoreProvider';
import { AppStore } from './core/state/appStore';
import './styles/tokens.css';
import './styles/global.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Workout Conductor could not start: the #root element is missing.');
}

const store = new AppStore();

createRoot(container).render(
  <StrictMode>
    <AppStoreProvider store={store}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AppStoreProvider>
  </StrictMode>,
);
