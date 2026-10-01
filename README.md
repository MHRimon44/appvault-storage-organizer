# AppVault

Find forgotten files. Make room safely.

## Project overview

AppVault is an Android storage organizer built with React Native,
TypeScript, and Kotlin. It works offline without an account or backend.

It helps you:

- Browse files and search documents.
- Find large files and older downloads.
- Detect exact duplicates.
- Save favorites and review files before deleting them.
- Use light or dark mode.

AppVault scans only the media, files, and folders you allow it to access.
Files stay on your device. Deletion always requires confirmation.

The free version supports AdMob banners, with an optional ad-free Pro upgrade.

## Run locally

### Requirements

- Node.js 22.13 or newer
- Yarn 4
- Android Studio and a configured Android SDK
- An Android 10+ emulator or phone with USB debugging enabled

### Setup

Clone this repository and open its folder, then run:

    yarn install
    node scripts/setup-android.cjs
    yarn ads:dev
    yarn tsc --noEmit

### Start the app

Start Metro:

    yarn start:reset

In another terminal, run:

    yarn android

On your first launch, open **Scan coverage**, grant access to your
chosen media or folders, and start a scan.

## Development notes

- Android only; CocoaPods is not required.
- Development builds use Google test ads.
- Pro purchases require Google Play product and licensing configuration.
- Review selected files carefully: deletion is permanent.
