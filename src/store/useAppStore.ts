import { create } from 'zustand';
import type { AppSettings, PremiumState, Route, ScanProgress } from '../types';
import { storage } from '../services/native';
const defaults: AppSettings = {
  theme: 'system',
  sort: 'newest',
  largeMB: 100,
  oldDays: 90,
};
interface State {
  settings: AppSettings;
  premium: PremiumState;
  routes: Route[];
  revision: number;
  progress: ScanProgress | null;
  busy: boolean;
  initialized: boolean;
  push(route: Route): void;
  back(): void;
  tab(name: Route['name']): void;
  refresh(): void;
  update(settings: Partial<AppSettings>): Promise<void>;
  boot(): Promise<void>;
}
export const useAppStore = create<State>((set, get) => ({
  settings: defaults,
  premium: { isPro: false, ready: false, price: '', pending: false },
  routes: [{ name: 'home' }],
  revision: 0,
  progress: null,
  busy: false,
  initialized: false,
  push: route => set(s => ({ routes: [...s.routes, route] })),
  back: () =>
    set(s => ({
      routes: s.routes.length > 1 ? s.routes.slice(0, -1) : s.routes,
    })),
  tab: name => set({ routes: [{ name }] }),
  refresh: () => set(s => ({ revision: s.revision + 1 })),
  update: async changes => {
    const settings = { ...get().settings, ...changes };
    await storage.settings(settings);
    set({ settings });
    get().refresh();
  },
  boot: async () => {
    const settings = await storage.initialize();
    set({ settings, initialized: true });
  },
}));
