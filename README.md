# Trovelo ✨

A keepsake box for loose ideas. Drop in the things you would otherwise forget (a book someone
mentioned, a half-formed plan, a line you liked), then press **Surprise Me** and meet one of them
again when you least expect it.

Everything lives on your phone by default. No account, no server, no analytics. The writing
assistant and voice dictation both run on the device itself, unless you deliberately connect a
cloud AI provider or switch dictation to the phone's own speech recognizer. Both are off by
default, both optional, both reversible from Settings at any time.

---

## The look

The interface is deliberately **plain**: flat, neutral surfaces, one typeface, and shadow used only
where something actually sits above the page, like a toast or the hero card on Home. Nothing is
textured, gradient-filled or drawn to look like a physical object. What sits behind that plainness
is not: an on-device language model, offline speech recognition, authenticated encryption, dark
mode, haptics and full accessibility support.

The whole app reduces to three colours: black-or-white text, one neutral background per mode, and a
single accent used for every icon, chip and highlight, no per-category rainbow. Settings → Appearance
lets you pick the accent from a small set of hues and switch between Day, Night and Automatic; the
rest of the interface, including things like task checkmarks and favourite stars that used to be
their own separate colours, follows whichever one you chose.

Every colour, border and shadow comes from design tokens in
[`src/constants/theme.ts`](src/constants/theme.ts), so light and dark stay in step and the whole
app can be re-skinned from one file. `Gradient` still exists as a type, since a couple of surfaces
are still painted with `expo-linear-gradient`, but every value in the theme is two identical colour
stops, so what actually renders is a flat fill.

## Features

### Getting around
Four tabs, always reachable: **Home**, **Library**, **Stats** and **Settings**. Opening an entry,
editing one, or using a tool (models, backup, weekly review, tidy up) pushes a screen on top and
hides the tabs while it's open, the standard drill-down pattern; tapping a tab always returns you to
one of the four sections directly, without retracing a stack of screens. This replaced an earlier
version of the app where Home was the only persistent screen and everything else sat behind it,
which made sense back when the app only stored one kind of thing and did one thing with it.

### Home
A dashboard, not a single button: what's due or overdue today, anything you asked to see again with
*Remind me later*, entries from this date in an earlier year, a way to ask for a surprise, and the
things you added most recently. Each section only appears when it has something to show.

### The box
- **Surprise Me** surfaces one saved entry at a time. The picker is weighted by neglect: how long
  since you last saw something, how rarely it has come up, whether you starred it. Entries you marked
  *Not for me* stop appearing without being deleted.
- **Four kinds of entry**: Idea, Note, Task and Journal, picked from one chip row in the editor.
  Everything still lives in the same box and the same search. Tasks are excluded from Surprise Me,
  since a task is for doing rather than rediscovering.
- **Statuses**: New, Still interesting, Done, Not for me, plus favourites, pinning and archiving.
- **Streaks** for opening the app on consecutive days, with your best run kept.
- **Weekly review**, in Settings, is a short deliberate pass through whatever has waited longest,
  one at a time, rather than the random resurfacing Surprise Me does.

### Writing
- **Title, body, tags, an optional folder and an optional due date** (for tasks). Tags are suggested
  from ones you have used before.
- **Dictation**: speak an idea instead of typing it. Offline by default, via a one-time 41 MB speech
  pack (Vosk's small model, built for real-time use on phone-class hardware; its bigger models trade
  that responsiveness away for accuracy the wrong way round for live dictation). Settings → Voice
  input can switch this to Android's own speech recognizer instead: more accurate, but not offline,
  since it hands audio to whatever recognition service the phone has installed.
- **Follow-ups**: short, dated notes you can add to an entry later without editing what you first
  wrote.
- **Unsaved-changes guard** so a back swipe never silently discards what you wrote.

### The assistant
An optional GGUF model runs on the phone via [`llama.rn`](https://github.com/mybigday/llama.rn) and
is the default; nothing is uploaded. Settings → Assistant can switch the engine to a cloud provider
instead, any OpenAI-compatible `/chat/completions` endpoint, with presets for Groq, OpenRouter and
Google Gemini's free tiers, or a custom URL for a self-host like Ollama or LM Studio. Switching to
cloud is behind an explicit confirmation naming exactly what that means, and the API key lives in
the OS keystore via `expo-secure-store`, never in the same settings record as everything else and
never in a backup. Six per-entry tasks, all cancellable mid-run and, on the local engine, streaming
token-by-token:

| Task | What it does |
|---|---|
| **Polish** | Fixes grammar and flow without changing your meaning |
| **Name it** | Suggests a short title |
| **Suggest tags** | Reads the note and proposes three to five tags |
| **Sum up** | One-sentence gist |
| **Next steps** | Turns an idea into three concrete actions |
| **Ask me something** | A question that makes you reconsider the idea |

**Ask your box**, in the Library, answers a question using a handful of your own entries: a plain
keyword match picks the most relevant few, and only those go to the model. There is no vector index
behind it, so it costs nothing extra to ship and says so plainly when nothing matches instead of
guessing. **Tidy up** does the same keyword-and-model combination in reverse, walking every untagged
entry once and proposing tags for each. **Related**, on an entry's own screen, finds other entries
that share tags or distinctive words, with no model required at all.

Models download with pause, live speed and time-remaining, and a free-space check before starting.
Resuming after the app is killed requires having tapped Pause first, since that is the only point at
which a resumable download token exists to save. You can also side-load your own `.gguf`.

### Library
Search across titles, bodies and tags, ranked so a title or tag hit outranks the same word only
appearing in the body, with prefix and one-typo tolerance built in. Filter by kind, status,
favourites, folder, tag or archived; sort by newest, oldest, longest-unseen, most-rediscovered or
alphabetically. Search by voice using the same dictation engine configured in Settings. Long-press any card
for quick actions, including pin and archive. Deletions are undoable from a toast rather than guarded
by a confirmation dialog.

### Your data
- **Backups** are a single JSON file, optionally encrypted (see below).
- **Markdown export** for reading your notes anywhere.
- **Restore merges**: it adds, never overwrites, and matches folders by name.

## Security & privacy

| | |
|---|---|
| Backup encryption | AES-256-CBC with **HMAC-SHA256** authentication (encrypt-then-MAC) |
| Key derivation | PBKDF2-HMAC-**SHA256**, 150 000 iterations, 32-byte random salt |
| Randomness | Platform CSPRNG via `expo-crypto` |
| Network, default | Only two hosts, both user-initiated: HuggingFace (models) and alphacephei (speech pack) |
| Network, if opted in | A cloud assistant provider (whichever you configure) if you switch the assistant engine; Google's servers, via the OS, if you switch dictation to the phone's recognizer. Both off by default, both reversible from Settings. |
| Permissions | `RECORD_AUDIO` (optional, for dictation), `INTERNET`, `VIBRATE`. External storage explicitly removed. |
| Backups on disk | `allowBackup="false"`; cached export files are swept on launch and after every share |

The iteration count is written into each backup file, so it can be raised later without breaking
existing ones. Key derivation yields to the event loop between iteration batches, which is what
makes a progress bar possible instead of a frozen screen.

## Tech stack

| | |
|---|---|
| Framework | [Expo](https://expo.dev) SDK 57 · React Native 0.86 · New Architecture |
| Language | TypeScript (strict) |
| Navigation | React Navigation 7 (native stack, custom gradient toolbars) |
| Storage | AsyncStorage, with a coalescing serial write queue |
| AI assistant | `llama.rn` (on-device, default) or any OpenAI-compatible endpoint (opt-in) |
| Speech | Vosk (`vosk-android`, default) or Android's `SpeechRecognizer` (opt-in), both through small hand-written native modules |
| Crypto | `expo-crypto` (randomness) + `crypto-js` (AES/HMAC primitives) + `expo-secure-store` (API key storage) |
| Gradients | `expo-linear-gradient` |
| Icons | `@expo/vector-icons` (Ionicons) |
| Type | Georgia / Android `serif` for display, system sans for body (both ship with the OS) |

## Getting started

**Prerequisites:** Node.js 18+ and an Android toolchain. This app contains custom native code, so
**Expo Go will not work.** You need a development build.

```bash
npm install
npm run android          # build and run on a device/emulator
```

Other commands:

```bash
npm run typecheck        # tsc --noEmit
npm run bundle:check     # verify the JS bundles cleanly
```

## Building an installable APK

### In the cloud (recommended)

Builds on Expo's servers, so your own machine stays idle. Needs a free Expo
account.

```bash
eas login
npm run build:android    # release APK, internal distribution
```

The first run asks to create an EAS project and to generate a keystore. Say
yes to both. When it finishes you get a download URL and a QR code; open either
on the phone and install. You will need to allow "install from unknown sources"
once.

### Locally

A release build wants roughly 5–6 GB of RAM across the Gradle daemon, the Kotlin
daemon, Metro and R8. **On a machine with 8 GB or less this will swap and can
lock up the desktop.** If you build locally, close other applications and cap
the build first, in `android/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=384m
org.gradle.parallel=false
org.gradle.workers.max=1
kotlin.compiler.execution.strategy=in-process
```

Then:

```bash
cd android
./gradlew assembleRelease --no-daemon
# → android/app/build/outputs/apk/release/app-release.apk
```

## APK size

For a notes app, most of the APK is not the app: `llama.rn` and `vosk-android`
between them ship roughly 20 MB of native `.so` library per CPU architecture,
and by default Android builds bundle four architectures (`armeabi-v7a`,
`arm64-v8a`, `x86`, `x86_64`) into one APK so it installs anywhere.

Two things keep that in check, both in `android/`:

- **`gradle.properties`** builds for `arm64-v8a` only. `x86`/`x86_64` exist
  purely for the emulator; `armeabi-v7a` is 32-bit hardware from before
  ~2017, and Google Play has required 64-bit-only submissions since 2019.
  Add architectures back here (comma-separated) if you specifically need
  emulator or legacy-device support.
- **`app/build.gradle`**'s `packagingOptions` excludes `llama.rn`'s CPU-tuned
  variants (dotprod, i8mm, hexagon, opencl builds; ~74 MB per architecture)
  and keeps only the generic baseline, which every device runs and which
  llama.cpp's own loader falls back to automatically.

Both are size-only: no model, no voice input, no assistant task is removed by
either change, they simply stop shipping four copies of the same code and
eight redundant tunings of one native library.

Resource shrinking and code minification are both left off. They are not
independent switches: the Android Gradle Plugin refuses to shrink resources
unless code minification is also on ("Removing unused resources requires
unused code shrinking to be turned on"), so the only way to get either is to
accept both. Minification (R8) can strip or rename a class that a JNI binding
(llama.rn, vosk-android) reaches by name from native code, and the failure
mode is a runtime crash, not a build error. Turning it on needs proper
`proguard-rules.pro` keep rules and testing on a real device before it ships,
none of which has happened here yet.

### Signing

Release builds fall back to the debug keystore so `assembleRelease` works out of the box. For
anything you intend to distribute, set these in `~/.gradle/gradle.properties`:

```properties
TROVELO_UPLOAD_STORE_FILE=/path/to/upload.keystore
TROVELO_UPLOAD_STORE_PASSWORD=…
TROVELO_UPLOAD_KEY_ALIAS=…
TROVELO_UPLOAD_KEY_PASSWORD=…
```

EAS Build supplies its own credentials and overrides this.

## Project structure

```
App.tsx                          Providers, splash handover, navigation container
index.ts                         Entry point
android/                         Checked in, see the note below
src/
├── components/                  App-specific pieces (cards, pickers, AI panel)
│   ├── AskBoxPanel.tsx          Keyword-prefiltered question answering over your own entries
│   ├── DatePicker.tsx           Quick chips plus a plain month grid, no native picker dependency
│   └── ErrorBoundary.tsx        Self-contained; cannot depend on the theme it guards
├── constants/
│   ├── kinds.ts                 Idea / note / task / journal: labels, icons, editor copy
│   ├── models.ts                Model catalogue
│   ├── status.ts                Status labels, icons, hints
│   └── theme.ts                 The whole design language
├── context/
│   ├── DownloadContext.tsx      The one in-flight model download
│   ├── EntriesContext.tsx       Entries, folders, tags, all mutations
│   ├── SettingsContext.tsx      Preferences (one record, migrated from v1 keys)
│   ├── ThemeContext.tsx         Appearance + streak
│   └── ToastContext.tsx         Transient messages and undo
├── hooks/
│   ├── useAiRunner.ts           One streaming AI task at a time, single entry
│   ├── useAskBox.ts             Same shape as useAiRunner, for the multi-entry question flow
│   ├── useDictation.ts          Microphone → text, with correct accumulation
│   ├── useDebounce.ts
│   └── useHaptics.ts            Honours the vibration setting; never throws
├── navigation/
│   ├── index.tsx                Outer stack: Onboarding, MainTabs, and every pushed screen
│   └── MainTabs.tsx              The four tabs: Home, Library, Stats, Settings
├── screens/                     Onboarding · Home · Detail · Edit · Library · Stats · Settings ·
│                                 Models · Backup · Review (weekly review) · Tidy (batch tagging)
├── services/
│   ├── ai.ts                    Local (llama.rn) tasks, prompts, streaming, cancel, drift check
│   ├── aiProvider.ts            Remote OpenAI-compatible engine: presets, fetch, secure key storage
│   ├── modelStore.ts            Model files: download, resume, verify, import
│   ├── backup.ts                Backup format, encryption, Markdown export
│   ├── speech.ts                Vosk bridge
│   └── androidSpeech.ts         Android SpeechRecognizer bridge
├── storage/storage.ts           Persistence + validation on load
├── types/
├── ui/                          The design system (Button, Panel, Field, NavBar, …)
└── utils/                       date · id · random (the surprise picker) · search (ranking, related) · tags
```

### Why `android/` is committed

The Expo template gitignores `android/`, on the assumption that `expo prebuild` can regenerate it.
That is not true here: the directory contains hand-written code that prebuild would erase, the Vosk
speech module and its registration in `MainApplication.kt`, the `vosk-android` dependency, and the
`llama.rn` jniLibs excludes that keep ~65 MB of duplicate CPU variants out of the APK. Only build
output is ignored.

## How data is stored

| Key | Contents |
|---|---|
| `@trovelo/entries/v1` | Your ideas |
| `@trovelo/categories/v1` | Folders |
| `@trovelo/prefs/v1` | Appearance, streak, onboarding |
| `@trovelo/settings/v2` | Assistant, haptics, selected model |
| `@trovelo/modelDownload/v1` | Resume token for an interrupted model download |

Everything read from disk is validated and coerced on load, so a malformed record cannot crash a
render. AsyncStorage's Android database ceiling is raised to 50 MB in `gradle.properties`. The 6 MB
default fails *silently* once a library grows past it.

Models and the speech pack live in the app's documents directory and are never backed up by the OS.
