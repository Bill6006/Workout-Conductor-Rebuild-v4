import { createContext } from 'react';
import type { AppStore } from './appStore';

export const AppStoreContext = createContext<AppStore | null>(null);
