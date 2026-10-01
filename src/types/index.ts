export type FileCategory =
  | 'images'
  | 'videos'
  | 'audio'
  | 'pdfs'
  | 'documents'
  | 'apks'
  | 'archives'
  | 'other';
export type FileSort = 'newest' | 'oldest' | 'largest' | 'smallest' | 'name';
export type AppFile = {
  id: string;
  uri: string;
  displayName: string;
  extension: string;
  mimeType: string;
  category: FileCategory;
  size: number;
  dateAdded: number;
  dateModified: number;
  relativePath: string;
  width: number;
  height: number;
  duration: number;
  source: string;
  favorite: boolean;
  available: boolean;
};
export type FileFilter = {
  duplicateHash?: string;
  category?: FileCategory;
  query?: string;
  extension?: string;
  minSize?: number;
  maxSize?: number;
  before?: number;
  after?: number;
  downloads?: boolean;
  favorite?: boolean;
  sort?: FileSort;
  offset?: number;
  limit?: number;
};
export type ScanProgress = {
  phase: 'scan' | 'hash';
  processed: number;
  bytes: number;
  label: string;
};
export type ScanResult = {
  totalFiles: number;
  totalBytes: number;
  warnings: string[];
  canceled: boolean;
};
export type DuplicateGroup = {
  hash: string;
  files: AppFile[];
  savings: number;
  totalCopies: number;
};
export type CleanupResult = {
  deletedFileCount: number;
  freedBytes: number;
  failed: number;
  canceled: boolean;
  categories: string[];
};
export type ScanHistory = {
  id: number;
  startedAt: number;
  completedAt: number;
  totalFiles: number;
  totalBytes: number;
  largeFileCount: number;
  duplicateGroupCount: number;
  duplicateBytes: number;
};
export type AppSettings = {
  theme: 'system' | 'light' | 'dark';
  sort: FileSort;
  largeMB: number;
  oldDays: number;
};
export type PremiumState = {
  isPro: boolean;
  ready: boolean;
  price: string;
  pending: boolean;
};
export type Summary = {
  totalFiles: number;
  totalBytes: number;
  largeCount: number;
  oldCount: number;
  duplicateBytes: number;
  categories: { category: FileCategory; count: number; bytes: number }[];
  storageTotal: number;
  storageFree: number;
  lastScan: number;
};
export type AccessState = {
  images: boolean;
  videos: boolean;
  audio: boolean;
  partial: boolean;
  sources: { uri: string; name: string }[];
};
export type Backup = {
  version: 1;
  settings: AppSettings;
  favorites: { uri: string; name: string }[];
  history: ScanHistory[];
};
export type Route = {
  name:
    | 'home'
    | 'files'
    | 'clean'
    | 'search'
    | 'settings'
    | 'category'
    | 'large'
    | 'duplicates'
    | 'old'
    | 'downloads'
    | 'documents'
    | 'apks'
    | 'favorites'
    | 'details'
    | 'review'
    | 'result'
    | 'history'
    | 'premium'
    | 'about'
    | 'permission';
  category?: FileCategory;
  duplicateHash?: string;
  protectDuplicates?: boolean;
  file?: AppFile;
  files?: AppFile[];
  result?: CleanupResult;
};
