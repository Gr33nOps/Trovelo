# Roadmap: Trovelo v2

> Historical design record. The six phases described below were subsequently implemented; use
> the README and current source as the authority for shipped behavior and release instructions.

A review of the LocalMind proposal against what this app already is, and a
build plan for the parts worth taking.

Current state: v1.13.1, four entry kinds backed by one `Entry` model, on-device or opt-in remote
AI, offline dictation, and encrypted backups.

---

## Verdict in one paragraph

The proposal is good, and about 70% of it belongs here. The privacy section is
already built and shipped. The AI section is mostly built. Notes, tasks and
journal are worth adding, but not as five separate content types with five
separate screens. Projects, arbitrary file attachments and vector search are
where the proposal would turn a two-tap app into a filing system, and those are
the parts to cut or shrink.

## The tension worth naming first

Trovelo and LocalMind want opposite things from the user.

Trovelo says: throw it in, do not organise it, I will hand it back to
you when you have forgotten it. The whole design (weighted random surfacing,
neglect scoring, a box you open) is built on the user doing no filing.

A second brain says: file it correctly now so you can retrieve it later. Notes
in folders, tasks in projects, everything tagged and structured.

Both are valid apps. They are not the same app. If every feature from the
proposal lands as written, the result is a mediocre Notion clone that also has
a shuffle button, and the one thing this app does that nothing else does gets
buried.

So the rule for everything below: **new content types are allowed to exist,
but they are never allowed to add a step to capture.** You still open the app,
type, and save. Everything else is optional and comes after.

On the name: `Trovelo` describes something specific. `LocalMind` is a
category label that fifty other apps could use. Keeping the current name is my
recommendation, but it is your call and costs nothing either way.

---

## Proposal review, item by item

| Proposal item | Verdict | Reasoning |
|---|---|---|
| Notes | **Take, as a kind** | One optional field on `Entry`, not a new type |
| Ideas | **Already the whole app** | Becomes the default kind |
| Tasks | **Take, as a kind + due date** | `status: 'done'` already exists, needs `dueAt` and reminders |
| Journal | **Take, and it is the best idea here** | Dated entries plus "On this day" is serendipity with a calendar |
| Projects as a workspace | **Adapt, do not build** | Folders already do this. Add progress to folders instead of a second hierarchy |
| Summarise / improve / rewrite | **Already shipped** | Polish, Sum up |
| Brainstorm, extract action items | **Already shipped** | Next steps, Ask me something |
| Generate tags | **Already shipped** | Suggest tags |
| Answer questions about stored info | **Take, cheap version** | Keyword prefilter into the existing model, no new download |
| Find related notes | **Take** | Tag and word overlap, optional LLM rerank |
| Automatically organise content | **Take, as a batch action** | "Tidy my inbox": suggests tags and a folder for untagged entries |
| Intelligent semantic search | **Skip as specified, ship the useful half** | See below |
| Voice recording | **Take** | Keep the audio, not just the transcript |
| Offline speech to text | **Already shipped** | Vosk |
| Search by spoken words | **Take, free** | Dictate into the search box, reuses existing dictation |
| Folders, tags, favourites, filters, sorting | **Already shipped** | All of it |
| Pin important items | **Adapt** | This is what favourites already do. Pin to top of Library is a small add |
| Archive | **Take** | Genuinely distinct from delete, small |
| Images | **Take** | Photo of a whiteboard is the real use case |
| Audio recordings | **Take** | Ties to voice notes |
| PDFs, documents, videos, other files | **Skip** | See below |
| Offline, local, no telemetry, no ads, user owns data | **Already true** | Nothing to build |

### Why semantic search gets cut down

Doing it as written means an embedding model (30 to 50 MB extra download), a
vector index, chunking, and re-embedding on every edit. You just spent a
session getting the APK from 141 MB down to 46.6 MB. Spending that back on a
feature that only pays off past a few thousand notes is a bad trade.

The useful half costs nothing: rank search results properly (title and tag hits
outrank body hits, match on word stems, tolerate a typo), then for questions,
prefilter to the top handful of entries by keyword and feed those into the model
that is already on the phone. That answers "what tasks relate to my university
project" correctly at the scale a phone notes app actually operates at, using
zero extra megabytes.

If the library ever grows past a few thousand entries, revisit. Not before.

### Why arbitrary file attachments get cut

Three reasons, in order of how much they matter:

1. The backup is a single JSON file. Attachments break that. Images can be
   base64 inlined with a size warning. A 40 MB PDF cannot.
2. Previewing PDFs and video needs native viewers, which is real APK weight
   for something people will do roughly never on a phone.
3. Storage grows without the user noticing until the app is 2 GB.

Images and voice memos cover the real capture needs. The rest is scope that
looks good in a proposal and rots in a shipped app.

---

## What I would add that the proposal does not mention

These fit the app's character better than half the proposal does.

- **On this day.** When an entry exists from this date in a previous month or
  year, the Home screen offers it. This is the single most on-brand feature
  available and it costs almost nothing.
- **Remind me later.** On any entry: "bring this back in a week / a month /
  three months". Serendipity, but deliberate. Reuses the same notification
  plumbing as task due dates.
- **Share into the box.** An Android share target so text selected in any app
  (a browser, a chat) can be sent straight to Trovelo. For a capture
  app this is worth more than most screens. It is a manifest intent filter plus
  a small handler.
- **Weekly review.** One screen, once a week: five entries you have not seen in
  a long time, each with keep / done / not for me. Batch serendipity.
- **Follow-ups on an entry.** A short append-only list of later thoughts on an
  idea, with dates. Ideas grow, and right now the only way to record that is to
  edit the original text and lose the history.

---

## The build plan

Six phases. Each one is shippable on its own and does not depend on the ones
after it. Phase 1 is the foundation and everything else assumes it.

### Phase 1: Kinds

The data change everything else sits on.

`Entry` gets one optional field:

```ts
export type EntryKind = 'idea' | 'note' | 'task' | 'journal';
kind?: EntryKind;   // undefined means 'idea', so every existing entry is fine
```

- Editor: a four-chip row at the top, defaulting to Idea. Capture does not get
  slower, because the default is already correct for most saves.
- Cards: a small icon per kind. No layout change.
- Library: kind added to the existing filter row.
- Surprise Me: the pool becomes ideas, notes and journal entries. Tasks are
  excluded, because a task is for doing, not for rediscovering.

Files: `types/index.ts`, `storage/storage.ts`, `constants/kinds.ts` (new),
`AddEditEntryScreen`, `EntryCard`, `LibraryScreen`, `utils/random.ts`.

Size cost: zero.

### Phase 2: Tasks that actually work

- `dueAt?: number` and `completedAt?: number` on `Entry`.
- A checkbox on task cards. Ticking sets `status: 'done'`.
- A date picker in the editor, shown only when kind is Task.
- Home gets a "Today" strip above the box, but only when tasks are due today or
  overdue. When nothing is due it does not exist, so the Home screen for a
  non-task user is unchanged.
- Local notifications for due dates, and "Remind me later" on any entry.
- Notification permission is requested the first time a reminder is set, never
  at launch.

New dependency: `expo-notifications`. Local scheduling only, no push service,
no new network host.

Files: `types`, `storage`, `services/reminders.ts` (new), `AddEditEntryScreen`,
`EntryCard`, `EntryDetailScreen`, `HomeScreen`, `SettingsScreen`.

Size cost: roughly 1.5 MB.

### Phase 3: Journal and On this day

- "Write today" as a second action in the Home dock, which opens the editor
  pre-set to Journal with today's date as the title.
- If a journal entry for today already exists, it opens that one instead of
  making a second.
- On this day: when entries exist from this calendar date in an earlier month
  or year, Home offers a card for them. Rendered above the box, dismissible,
  gone when there is nothing.
- Stats gains a small journal streak.

Files: `HomeScreen`, `AddEditEntryScreen`, `utils/date.ts`, `StatsScreen`.

Size cost: zero.

### Phase 4: Attachments, images and voice memos only

This is the one phase with real cost. Flag it at build time if you want it cut.

- `attachments?: Attachment[]` on `Entry`, where an attachment is
  `{ id, kind: 'image' | 'audio', fileName, bytes, createdAt }`.
- Files live in `documentDirectory/attachments/<entryId>/`, cleaned up when the
  entry is deleted.
- Camera or gallery for images, with a size cap and downscaling on import.
- Voice memos: record, keep the audio, transcribe with the existing Vosk model
  so the transcript is searchable while the audio stays playable.
- Detail screen shows thumbnails and a play button.
- Settings gains a storage line showing what attachments are using, with a way
  to see the largest ones.
- Backup: the JSON stays text-only by default. A clearly labelled "Include
  photos and audio" toggle base64 inlines them, with the resulting file size
  shown before you commit.

New dependencies: `expo-image-picker`, `expo-audio`.

Files: `types`, `storage`, `services/attachments.ts` (new),
`components/AttachmentStrip.tsx` (new), `AddEditEntryScreen`,
`EntryDetailScreen`, `services/backup.ts`, `SettingsScreen`.

Size cost: roughly 2.5 MB, so the APK lands near 51 MB with Phase 2 included.

### Phase 5: Search that understands, and asking your own box

No new dependencies and no new megabytes. All of this runs on the model that is
already there.

- **Better ranking.** Title and tag matches outrank body matches. Match word
  prefixes so "learn" finds "learning". Tolerate one typo on words of five
  letters or more. Show why a result matched.
- **Find related.** On the detail screen: entries sharing tags and distinctive
  words, scored by overlap. When a model is installed, the top candidates get
  reranked by the model. Without a model it still works, just less cleverly.
- **Ask my box.** A question field in Library. Keyword prefilter picks the best
  handful of entries, each trimmed to fit, and they go into the model with the
  question. The answer names which entries it used, and each one is tappable.
  Context is 2048 tokens, so the budget is roughly 1200 tokens of notes and the
  rest for the answer. When the prefilter finds nothing, it says so rather than
  inventing an answer.
- **Dictate a search.** The mic button in the search field, reusing dictation.

Files: `utils/search.ts` (new), `services/ai.ts` (a multi-entry task shape),
`LibraryScreen`, `EntryDetailScreen`, `components/AiPanel.tsx`.

Size cost: zero.

### Phase 6: Tidying and the small things

- **Archive.** `archivedAt?: number`. Archived entries leave Library and the
  surprise pool but stay findable under a filter. Distinct from delete.
- **Pin.** Pinned entries sit at the top of Library regardless of sort.
- **Tidy my inbox.** A batch action that walks untagged entries and proposes
  tags and a folder for each, one card at a time, accept or skip. Uses the
  existing tags task, applied in a loop.
- **Folders show progress.** A folder containing tasks shows how many are done.
  This is the entire "projects" feature from the proposal, for near-zero cost
  and no second hierarchy.
- **Follow-ups.** `followUps?: { at: number; text: string }[]`. A small "add a
  thought" field on the detail screen.
- **Share into the box.** Android `ACTION_SEND` intent filter, so shared text
  from any app opens straight into a new entry.
- **Weekly review.** Five long-unseen entries, triaged in a row.

Files: `types`, `storage`, `LibraryScreen`, `EntryDetailScreen`,
`SettingsScreen`, `screens/ReviewScreen.tsx` (new), `android/.../AndroidManifest.xml`,
`navigation/index.tsx`.

Size cost: zero.

---

## Guardrails for the build

These are not preferences. Breaking any of them causes a real bug or undoes
work already done.

1. **`normalizeEntry` in `storage/storage.ts` rebuilds each entry from scratch
   and only copies fields it knows about.** Any new field that is not added
   there is silently erased on the next app launch. It is also what
   `services/backup.ts` uses on restore, so the same omission would drop the
   field out of every backup too. Every new field gets added there in the same
   commit that introduces it.
2. **Every new field is optional.** Old entries, old backups and backups made
   by v1.1.0 must all still load without migration.
3. **Capture stays one field and a save button.** The kind picker defaults to
   Idea. No required decisions before writing.
4. **The Home screen keeps one primary action.** Today and On this day only
   appear when they have content. The box stays the centre of the screen.
5. **No new screens unless a feature cannot live in an existing one.** Only
   Weekly review earns one.
6. **No em dashes anywhere.** UI copy, comments, this file, all of it.
7. **Copy stays plain.** Short sentences, no rhetorical lists, no "seamlessly"
   or "effortlessly". The tone that is in `OnboardingScreen` now is the target.
8. **Contrast rules hold.** Button and chip text stays at 4.5:1 or better
   against every point of its gradient, in both themes. The `contrastingInk`
   threshold and the low-alpha gloss values stay as they are.
9. **No new network hosts.** HuggingFace for models and alphacephei for the
   speech pack, both user-initiated, and nothing else.
10. **Architecture stays `arm64-v8a` only** and the `llama.rn` jniLibs excludes
    stay. Any new dependency gets checked for what it adds to the APK.

## Size budget

| | Estimate |
|---|---|
| Now | 46.6 MB |
| Phases 1, 3, 5, 6 (no new dependencies) | 46.6 MB |
| Phase 2 (`expo-notifications`) | about 48 MB |
| Phase 4 (`expo-image-picker`, `expo-audio`) | about 51 MB |

These are estimates. The real numbers get measured from the build output, the
same way the 141 MB to 46.6 MB reduction was measured rather than assumed.

## Deliberately not doing

- Vector embeddings and semantic indexing. Revisit past a few thousand entries.
- PDF, video and general file attachments.
- Projects as an entity separate from folders.
- Cloud sync of any kind.
- Any second navigation hierarchy.
- Rich text or Markdown editing. Plain text is part of why capture is fast.

## Suggested cut line

Phases 1, 2, 3, 5 and 6 in one build. That is every feature above with no
meaningful size cost and no risk to the app's character.

Phase 4 is the decision. It is the only phase that adds megabytes and the only
one that complicates backups. Photos attached to ideas are genuinely useful, so
my recommendation is to include it, but it is the one piece worth saying no to
if the size matters more.
