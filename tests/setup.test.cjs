const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const bundle = path.resolve(__dirname, '..');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'appvault-test-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const dir of ['native', 'scripts']) fs.cpSync(path.join(bundle, dir), path.join(root, dir), {recursive: true});
  fs.mkdirSync(path.join(root, 'android/app/src/main/java/com/example'), {recursive: true});
  fs.writeFileSync(path.join(root, 'android/app/build.gradle'), 'android { namespace "com.example" }\n');
  fs.writeFileSync(path.join(root, 'android/app/src/main/java/com/example/MainApplication.kt'), 'package com.example\nclass MainApplication { fun x() = PackageList(this).packages.apply {\n} }');
  fs.writeFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:allowBackup="true" /></manifest>');
  fs.writeFileSync(path.join(root, 'package.json'), '{"scripts":{"android":"react-native run-android"}}');
  fs.writeFileSync(path.join(root, 'app.json'), '{"name":"AppVault","displayName":"AppVault"}');
  return root;
}
function run(root, script, ...args) {const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], {cwd: root, encoding: 'utf8'}); assert.equal(result.status, 0, result.stderr);}
test('Android installation is idempotent and preserves the generated namespace and scripts', t => {
  const root = fixture(t); run(root, 'setup-android.cjs'); run(root, 'setup-android.cjs');
  const app = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/example/MainApplication.kt'), 'utf8');
  assert.equal(app.match(/add\(AppVaultStoragePackage\(\)\)/g).length, 1);
  const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
  assert.equal(gradle.match(/billing:9.1.0/g).length, 1);
  assert.match(gradle, /buildConfigField "String", "BILLING_PUBLIC_KEY"/);
  const billing = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/appvault/storage/VaultBilling.kt'), 'utf8');
  assert.match(billing, /import com.example.BuildConfig/);
  const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.equal(manifest.match(/android.permission.READ_MEDIA_IMAGES/g).length, 1);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.doesNotMatch(manifest, /MANAGE_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|REQUEST_INSTALL_PACKAGES/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).scripts.android, 'react-native run-android');
});
test('AdMob configuration keeps development on test IDs and switches explicitly for release', t => {
  const root = fixture(t); run(root, 'configure-ads.cjs', 'development');
  let config = JSON.parse(fs.readFileSync(path.join(root, 'app.json')));
  assert.equal(config.name, 'AppVault');
  assert.equal(config['react-native-google-mobile-ads'].android_app_id, 'ca-app-pub-3940256099942544~3347511713');
  assert.equal(config['react-native-google-mobile-ads'].delay_app_measurement_init, true);
  run(root, 'configure-ads.cjs', 'release');
  config = JSON.parse(fs.readFileSync(path.join(root, 'app.json')));
  assert.equal(config['react-native-google-mobile-ads'].android_app_id, 'ca-app-pub-3194644435083545~9897177443');
});
test('Setup rejects incompatible template layouts before Android mutations', t => {
  const root = fixture(t);
  const main = path.join(root, 'android/app/src/main/java/com/example/MainApplication.kt');
  fs.writeFileSync(main, 'package com.example\nclass MainApplication {}');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/setup-android.cjs')], {cwd: root, encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsupported MainApplication/);
  assert.equal(fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8'), 'android { namespace "com.example" }\n');
});
