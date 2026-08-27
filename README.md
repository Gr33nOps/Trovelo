# Trovelo

[![Release](https://img.shields.io/github/v/release/Gr33nOps/trovelo?color=%234d5f33&label=release)](https://github.com/Gr33nOps/trovelo/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-7a7f7c.svg)](LICENSE)

A simple box for ideas. Drop in the things you'd otherwise forget — a book someone mentioned, a
half-formed plan, a line you liked — and let reminders and on-this-day memories bring them back
when you least expect it.

Everything stays on your phone. No account, no server, no AI, no network access of any kind.

## Features

- **Reminders & on this day** — old ideas resurface on their own, right on the library screen
- **Library** — ranked search with typo tolerance, filters and sorting
- **Streaks & weekly review** — keep what matters in front of you, deliberately
- **Backups** — encrypted JSON or plain Markdown export; restore merges instead of overwriting
- **Dark mode & custom accent** — one calm design language, reskinned from a single theme file

## Privacy

- No account, no telemetry, no network requests. The app has no INTERNET permission on Android.
- Backup encryption: AES-256-CBC + HMAC-SHA256, PBKDF2 with 150,000 iterations.

## Install

Grab the latest APK from [Releases](https://github.com/Gr33nOps/trovelo/releases) and allow
"install from unknown sources" on your phone. To build it yourself, see below.

## Development

```bash
npm ci
npm run android        # build and run on a device/emulator
npm run lint
npm run typecheck
npm test
npm run audit:deps
npm run doctor
npm run bundle:check
```

Building an APK:

- **Cloud (recommended):** `npm run build:android` — EAS build; it generates a keystore on first run
- **Local debug:** `cd android && ./gradlew assembleDebug`
- **Local release:** supply all four `TROVELO_UPLOAD_*` Gradle properties, then run
  `./gradlew assembleRelease`. A release never falls back to the public debug key.

The committed `android/` project is authoritative. It includes hand-tuned signing and packaging
rules that `expo prebuild` cannot safely recreate; do not delete or blindly regenerate it from
`app.json`.

## Releases

The release workflow accepts a tag only when it exactly matches `package.json` (for example,
`v1.13.1`). Before publishing, configure these protected GitHub Actions secrets:

- `TROVELO_UPLOAD_KEYSTORE_BASE64`
- `TROVELO_UPLOAD_STORE_PASSWORD`
- `TROVELO_UPLOAD_KEY_ALIAS`
- `TROVELO_UPLOAD_KEY_PASSWORD`

The workflow verifies the APK signature, rejects the Android debug certificate, and publishes a
SHA-256 checksum, CycloneDX dependency bill of materials, and GitHub build provenance. Keep the
upload keystore and its passwords outside the repository and retain a secure recovery copy.

## Tech stack

| | |
|---|---|
| Framework | Expo SDK 57 · React Native 0.86 (New Architecture) |
| Language | TypeScript (strict) |
| Navigation | React Navigation 7 |
| Storage | AsyncStorage, validated on load |

## License

[MIT](LICENSE)
