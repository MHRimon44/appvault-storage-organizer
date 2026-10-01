const fs = require('node:fs');
const mode = process.argv[2];
if (!['development', 'release'].includes(mode))
  throw new Error('Choose development or release.');
const json = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const appId =
  mode === 'release'
    ? 'ca-app-pub-3194644435083545~9897177443'
    : 'ca-app-pub-3940256099942544~3347511713';
json['react-native-google-mobile-ads'] = {
  ...json['react-native-google-mobile-ads'],
  android_app_id: appId,
  delay_app_measurement_init: true,
};
fs.writeFileSync('app.json', JSON.stringify(json, null, 2) + '\n');
console.log(
  `AdMob ${mode} app ID configured. Rebuild Android. Debug JS always uses the Google test banner ID.`,
);
