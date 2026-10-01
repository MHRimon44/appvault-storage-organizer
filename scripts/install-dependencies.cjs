const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const deps = JSON.parse(
  fs.readFileSync('dependencies.json', 'utf8'),
).dependencies;
// Run Yarn through Corepack without shell interpolation. Windows uses the .cmd shim.
const executable = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const result = spawnSync(
  executable,
  [
    'yarn',
    'add',
    ...Object.entries(deps).map(([name, version]) => `${name}@${version}`),
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
