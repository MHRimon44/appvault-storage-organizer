import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type {
  AccessState,
  AppFile,
  AppSettings,
  Backup,
  CleanupResult,
  DuplicateGroup,
  FileFilter,
  PremiumState,
  ScanHistory,
  ScanProgress,
  ScanResult,
  Summary,
} from '../types';
interface Bridge {
  call(method: string, payload: string): Promise<string>;
  choose(kind: string): Promise<string>;
  deleteFiles(payload: string): Promise<string>;
  fileAction(uri: string, mime: string, share: boolean): Promise<void>;
  shareFiles(payload: string): Promise<void>;
  billing(action: string, product: string): Promise<string>;
  addListener(name: string): void;
  removeListeners(count: number): void;
}
const bridge = NativeModules.AppVaultStorage as Bridge | undefined;
export async function invoke<T>(
  method: string,
  payload: object = {},
): Promise<T> {
  if (Platform.OS !== 'android' || !bridge)
    throw new Error(
      'Android setup is incomplete. Run the supplied setup script and rebuild.',
    );
  return JSON.parse(await bridge.call(method, JSON.stringify(payload))) as T;
}
export const storage = {
  initialize: () => invoke<AppSettings>('initialize'),
  settings: (settings: AppSettings) => invoke<void>('settings', settings),
  forgetSource: (uri: string) => invoke<void>('forgetSource', { uri }),
  access: () => invoke<AccessState>('access'),
  scan: () => invoke<ScanResult>('scan'),
  cancel: () => invoke<void>('cancel'),
  summary: (largeMB: number, oldDays: number) =>
    invoke<Summary>('summary', { largeMB, oldDays }),
  files: (filter: FileFilter) => invoke<AppFile[]>('files', filter),
  duplicates: (offset = 0) =>
    invoke<DuplicateGroup[]>('duplicates', { offset }),
  selectDuplicates: (hash: string, newest: boolean) =>
    invoke<AppFile[]>('selectDuplicates', { hash, newest }),
  hash: () =>
    invoke<{ groups: number; warnings: number; canceled: boolean }>('hash'),
  favorite: (id: string) => invoke<void>('favorite', { id }),
  history: () => invoke<ScanHistory[]>('history'),
  recent: () => invoke<string[]>('recent'),
  remember: (query: string) => invoke<void>('remember', { query }),
  clearRecent: () => invoke<void>('clearRecent'),
  clearCache: () => invoke<void>('clearCache'),
  backup: () => invoke<Backup>('backup'),
  choose: async (kind: 'tree' | 'files' | 'export' | 'import') => {
    if (!bridge) throw new Error('Rebuild the Android app to enable storage.');
    return JSON.parse(await bridge.choose(kind)) as {
      canceled: boolean;
      count?: number;
    };
  },
  delete: async (files: AppFile[], protectDuplicates = false) => {
    if (!bridge) throw new Error('Rebuild the Android app to enable cleanup.');
    return JSON.parse(
      await bridge.deleteFiles(
        JSON.stringify({ ids: files.map(f => f.id), protectDuplicates }),
      ),
    ) as CleanupResult;
  },
  shareMany: (files: AppFile[]) => {
    if (!bridge)
      return Promise.reject(new Error('Android sharing is unavailable.'));
    return bridge.shareFiles(JSON.stringify(files.map(file => file.id)));
  },
  open: (file: AppFile, share = false) => {
    if (!bridge)
      return Promise.reject(
        new Error('Android file integration is unavailable.'),
      );
    return bridge.fileAction(file.uri, file.mimeType, share);
  },
  billing: async (
    action: 'restore' | 'buy',
    product: string,
  ): Promise<PremiumState> => {
    if (!bridge) throw new Error('Billing is unavailable.');
    return JSON.parse(await bridge.billing(action, product)) as PremiumState;
  },
  progress: (listener: (progress: ScanProgress) => void) => {
    if (!bridge) return { remove() {} };
    return new NativeEventEmitter(bridge).addListener(
      'AppVaultProgress',
      listener,
    );
  },
};
