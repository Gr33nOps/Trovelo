# Trovelo

[![Release](https://img.shields.io/github/v/release/Gr33nOps/trovelo?color=%234d5f33&label=release)](https://github.com/Gr33nOps/trovelo/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-7a7f7c.svg)](LICENSE)

A keepsake box for loose ideas. Drop in the things you'd otherwise forget — a book someone
mentioned, a half-formed plan, a line you liked — then press **Surprise Me** and meet one of them
again when you least expect it.

Everything stays on your phone by default. No account, no server, no analytics. The writing
assistant and voice dictation run on-device unless you deliberately opt into a cloud provider in
Settings.

## Features

- **Surprise Me** — resurface one saved idea at a time, weighted by how long it's been neglected
- **Four kinds of entries** — Idea, Note, Task and Journal, all in one searchable box
- **On-device AI assistant** — a GGUF model running locally via [llama.rn](https://github.com/mybigday/llama.rn); optional OpenAI-compatible cloud (Groq, OpenRouter, Gemini, or self-hosted)
- **Offline voice dictation** — Vosk speech pack by default, switchable to the system recognizer
- **Library** — ranked search with typo tolerance, filters, sorting, and voice search
- **Streaks & weekly review** — keep what matters in front of you, deliberately
- **Backups** — encrypted JSON or plain Markdown export; restore merges instead of overwriting
- **Dark mode & custom accent** — one calm design language, reskinned from a single theme file

## Privacy

- No account, no telemetry. Default network traffic is only model downloads (HuggingFace,
  alphacephei), both user-initiated.
- Backup encryption: AES-256-CBC + HMAC-SHA256, PBKDF2 with 150,000 iterations.
- Cloud AI and system dictation are off by default and reversible from Settings at any time.

## Install

Grab the latest APK from [Releases](https://github.com/Gr33nOps/trovelo/releases) and allow
"install from unknown sources" on your phone. To build it yourself, see below — note that
**Expo Go won't work**, since the app ships custom native modules.

## Development

```bash
npm install
npm run android        # build and run on a device/emulator
npm run typecheck      # tsc --noEmit
```

Building an APK:

- **Cloud (recommended):** `npm run build:android` — EAS build; it generates a keystore on first run
- **Local:** `cd android && ./gradlew assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk`

## Tech stack

| | |
|---|---|
| Framework | Expo SDK 57 · React Native 0.86 (New Architecture) |
| Language | TypeScript (strict) |
| Navigation | React Navigation 7 |
| Storage | AsyncStorage, validated on load |
| AI | llama.rn (on-device) or any OpenAI-compatible endpoint |
| Speech | Vosk or Android `SpeechRecognizer` |

## License

[MIT](LICENSE)
