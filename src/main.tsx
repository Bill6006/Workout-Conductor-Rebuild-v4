import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ToastProvider } from './components/Toast/Toast';
import { AppStoreProvider } from './core/state/AppStoreProvider';
import { AppStore } from './core/state/appStore';
import { shrinkPicture } from './features/barcode/shrinkPicture';
import './styles/tokens.css';
import './styles/global.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Workout Conductor could not start: the #root element is missing.');
}

// ?slowCalibration=1 holds the calibration overlay open longer, for screenshots and demos only.
const slowCalibration = new URLSearchParams(window.location.search).has('slowCalibration');
const store = new AppStore({
  ...(slowCalibration ? { minOverlayMs: 2500 } : {}),
  // A big barcode picture's smaller copy, for its second copy on the phone (Maintenance 25).
  shrinkPicture,
});

createRoot(container).render(
  <StrictMode>
    <AppStoreProvider store={store}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AppStoreProvider>
  </StrictMode>,
);
