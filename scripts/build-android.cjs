const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const mode = process.argv[2] ?? 'debug';
if (!['debug', 'release'].includes(mode))
  throw new Error('Choose debug or release.');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(
  process.platform === 'win32' ? 'corepack.cmd' : 'corepack',
  ['yarn', 'tsc', '--noEmit'],
  { shell: process.platform === 'win32' },
);
run(process.execPath, [
  'scripts/configure-ads.cjs',
  mode === 'release' ? 'release' : 'development',
]);
run(
  process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
  [mode === 'release' ? ':app:bundleRelease' : ':app:assembleDebug'],
  { cwd: 'android', shell: process.platform === 'win32' },
);
console.log(
  mode === 'release'
    ? 'Bundle created in android/app/build/outputs/bundle/release/. Confirm upload signing with Android Studio before publishing.'
    : 'Debug APK created in android/app/build/outputs/apk/debug/.',
);
