# HelloWord

A spaced repetition progressive web app built for SteelHacks XIII.

> "HelloWord" is a placeholder name.

**Status: planning.** No application code yet.

## Pitch

An incremental reading engine that turns feeds into things you actually remember. Sources come in (RSS, pasted URLs, PDFs), AI pulls out what matters and traces every insight back to its source, spaced repetition (FSRS) makes it stick, and a voice agent lets you review hands-free.

## Stack decisions

| Area | Decision |
|---|---|
| App type | Progressive web app (installable, offline review of downloaded cards) |
| Runtime | Node.js |
| Hosting | Vercel (sponsor credits) |
| Scheduling | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), running on the device |
| Frontend framework | TBD |
| Database | TBD |

## Team

| GitHub | Workstream |
|---|---|
| [@RecursiveFunctions](https://github.com/RecursiveFunctions) | TBD |
| [@nullishew](https://github.com/nullishew) | TBD |
| [@willyumm3rs](https://github.com/willyumm3rs) | TBD |
| [@jkob15](https://github.com/jkob15) | TBD |

Workstreams:

1. **Pipeline:** ingest (feeds, URLs, PDFs), triage, extracts anchored to their source span
2. **Core app:** data schema, scheduler and review queue, review UI
3. **Multimodal and voice:** URL/PDF ingest, card drafting, voice review mode
4. **Platform:** deployment, analytics, stretch integrations

## Tracks entered

Xtract, Beyond the Chatbot, Compound, Seed Round, Out Loud, Best Use of: Gemini API, ElevenLabs, Solana, Tiger Data, DigitalOcean (TBD, since hosting moved to Vercel), Snowflake API.

## Prior art and reused code

- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) for scheduling, used as an ordinary npm dependency.
- [obsidian-incremental-reading](https://github.com/RecursiveFunctions/obsidian-incremental-reading) (MIT, public before the event): queue interleaving, append-only review log, source anchoring and fuzzy re-anchoring, and postponing logic may be adapted. Any file taken from it will get a header with the repo URL, commit hash, and license.

## AI tools used

To be listed as the project progresses.

## License

MIT
