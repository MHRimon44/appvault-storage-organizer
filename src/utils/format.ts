export function bytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${(value / 1024 ** i).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}
export const date = (value: number) =>
  value > 0 ? new Date(value).toLocaleDateString() : 'Unknown date';
export function errorMessage(error: unknown): string {
  if (__DEV__) console.warn('[AppVault]', error);
  if (
    error instanceof Error &&
    /setup|rebuild|unavailable|cancel|permission|access|viewer|busy|configured/i.test(
      error.message,
    )
  )
    return error.message;
  return 'This operation could not finish. Check file access and try again.';
}
