const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}
function write(file, content) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}
function backup(file) {
  const dest = `${file}.appvault-backup`;
  if (!fs.existsSync(path.join(root, dest))) write(dest, read(file));
}
const gradleFile = 'android/app/build.gradle';
if (!fs.existsSync(path.join(root, gradleFile)))
  throw new Error(
    'Run from a freshly generated React Native CLI Android project containing android/app/build.gradle.',
  );
const gradle = read(gradleFile);
const namespace = /namespace\s*(?:=\s*)?["']([^"']+)["']/.exec(gradle)?.[1];
if (!namespace)
  throw new Error(
    'Unable to identify the Android namespace. Use the unmodified CLI template.',
  );
function find(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const match = find(file, name);
      if (match) return match;
    } else if (entry.name === name) return file;
  }
  return null;
}
const main = find(
  path.join(root, 'android/app/src/main/java'),
  'MainApplication.kt',
);
if (!main) throw new Error('MainApplication.kt was not found.');
const mainRelative = path.relative(root, main);
let app = read(mainRelative);
if (!app.includes('AppVaultStoragePackage()')) {
  if (!/PackageList\(this\)\.packages\.apply\s*\{/.test(app))
    throw new Error(
      'Unsupported MainApplication layout. Read docs/ANDROID.md for manual registration.',
    );
  backup(mainRelative);
  app = app.replace(
    /(package [^\n]+\n)/,
    '$1\nimport com.appvault.storage.AppVaultStoragePackage\n',
  );
  app = app.replace(
    /(PackageList\(this\)\.packages\.apply\s*\{)/,
    '$1\n            add(AppVaultStoragePackage())',
  );
  write(mainRelative, app);
}
for (const file of fs.readdirSync(path.join(root, 'native/android'))) {
  if (!file.endsWith('.kt')) continue;
  let content = read(`native/android/${file}`).replace(
    'import com.appvault.BuildConfig',
    `import ${namespace}.BuildConfig`,
  );
  write(`android/app/src/main/java/com/appvault/storage/${file}`, content);
}
backup(gradleFile);
if (!gradle.includes('// AppVault configuration'))
  write(
    gradleFile,
    gradle +
      `
// AppVault configuration: local indexing and optional Play Billing.
android {
    buildFeatures { buildConfig true }
    signingConfigs {
        appVaultRelease {
            if (project.hasProperty("APPVAULT_UPLOAD_STORE_FILE")) {
                storeFile file(project.property("APPVAULT_UPLOAD_STORE_FILE"))
                storePassword project.property("APPVAULT_UPLOAD_STORE_PASSWORD")
                keyAlias project.property("APPVAULT_UPLOAD_KEY_ALIAS")
                keyPassword project.property("APPVAULT_UPLOAD_KEY_PASSWORD")
            }
        }
    }
    buildTypes { release { signingConfig signingConfigs.appVaultRelease } }
    defaultConfig {
        minSdkVersion 29
        buildConfigField "String", "BILLING_PUBLIC_KEY", "\\\"" + (project.findProperty("APPVAULT_BILLING_PUBLIC_KEY") ?: "") + "\\\""
    }
}
dependencies {
    implementation "com.android.billingclient:billing:9.1.0"
}
`,
  );
const manifestFile = 'android/app/src/main/AndroidManifest.xml';
backup(manifestFile);
let manifest = read(manifestFile);
const permissions = [
  ['android.permission.READ_EXTERNAL_STORAGE', ' android:maxSdkVersion="32"'],
  ['android.permission.READ_MEDIA_IMAGES', ''],
  ['android.permission.READ_MEDIA_VIDEO', ''],
  ['android.permission.READ_MEDIA_AUDIO', ''],
  ['android.permission.READ_MEDIA_VISUAL_USER_SELECTED', ''],
];
for (const [name, attrs] of permissions)
  if (!manifest.includes(`android:name="${name}"`))
    manifest = manifest.replace(
      /(<application\b)/,
      `    <uses-permission android:name="${name}"${attrs} />\n\n    $1`,
    );
if (/android:allowBackup="[^"]*"/.test(manifest))
  manifest = manifest.replace(
    /android:allowBackup="[^"]*"/,
    'android:allowBackup="false"',
  );
else
  manifest = manifest.replace(
    '<application',
    '<application android:allowBackup="false"',
  );
// Explicitly exclude sensitive metadata from both cloud backups and device transfer.
if (!manifest.includes('android:dataExtractionRules='))
  manifest = manifest.replace(
    '<application',
    '<application android:dataExtractionRules="@xml/appvault_data_extraction_rules"',
  );
if (!manifest.includes('android:fullBackupContent='))
  manifest = manifest.replace(
    '<application',
    '<application android:fullBackupContent="@xml/appvault_backup_rules"',
  );
write(manifestFile, manifest);
write(
  'android/app/src/main/res/xml/appvault_backup_rules.xml',
  '<full-backup-content><exclude domain="root" path="."/><exclude domain="file" path="."/><exclude domain="database" path="."/><exclude domain="sharedpref" path="."/><exclude domain="external" path="."/></full-backup-content>\n',
);
write(
  'android/app/src/main/res/xml/appvault_data_extraction_rules.xml',
  '<data-extraction-rules><cloud-backup><exclude domain="root" path="."/><exclude domain="database" path="."/><exclude domain="sharedpref" path="."/><exclude domain="file" path="."/><exclude domain="external" path="."/></cloud-backup><device-transfer><exclude domain="root" path="."/><exclude domain="database" path="."/><exclude domain="sharedpref" path="."/><exclude domain="file" path="."/><exclude domain="external" path="."/></device-transfer></data-extraction-rules>\n',
);
const packageFile = JSON.parse(read('package.json'));
packageFile.scripts = {
  ...packageFile.scripts,
  'start:reset': 'react-native start --reset-cache',
  typecheck: 'tsc --noEmit',
  'setup:android': 'node scripts/setup-android.cjs',
  'ads:dev': 'node scripts/configure-ads.cjs development',
  'ads:release': 'node scripts/configure-ads.cjs release',
  'verify:bundle': 'node --test tests/*.test.cjs',
  'build:android': 'node scripts/build-android.cjs debug',
  'build:aab': 'node scripts/build-android.cjs release',
};
write('package.json', JSON.stringify(packageFile, null, 2) + '\n');
const yarnrc = '.yarnrc.yml';
if (fs.existsSync(path.join(root, yarnrc))) {
  let text = read(yarnrc);
  if (/^nodeLinker:/m.test(text))
    text = text.replace(/^nodeLinker:.*$/m, 'nodeLinker: node-modules');
  else text += '\nnodeLinker: node-modules\n';
  write(yarnrc, text);
} else write(yarnrc, 'nodeLinker: node-modules\n');
console.log(
  `AppVault native setup complete for ${namespace}. Original Android files have .appvault-backup copies. Run yarn ads:dev, yarn install, yarn tsc --noEmit, then yarn android.`,
);
