# Sponsor API Brief: ElevenLabs + Solana

Research date: 2026-09-19. Every claim below is sourced from a live docs fetch or the npm
registry on that date. Anything I could not verify is marked **[UNVERIFIED]**.

---

## 0. Read this first — four assumptions in the brief that are wrong

1. **`eleven_turbo_v2_5` is deprecated.** ElevenLabs lists it under "Deprecated models" with
   `eleven_flash_v2_5` as the named replacement. Don't build on turbo.
   ([models](https://elevenlabs.io/docs/models))
2. **There is a newer realtime model you didn't list: `eleven_v3_conversational`** (~280 ms, 70+
   languages, expressive). It is the recommended model for voice agents now.
3. **`@elevenlabs/react` v1.15.2 requires a `ConversationProvider`.** A bare `useConversation()`
   throws. The older provider-less snippets you'll find in blog posts no longer apply.
   ([React SDK](https://elevenlabs.io/docs/agents-platform/libraries/react))
4. **"`@solana/web3.js` v2" no longer exists under that name — it was renamed `@solana/kit`.**
   `@solana/web3.js@latest` is still `1.99.0`; `3.0.0-rc.3` is a separate legacy-interop bridge.
   And **`@solana/wallet-adapter-*` is explicitly superseded** for new apps by Wallet Standard
   discovery via `@solana/kit-plugin-wallet`.
   ([web3-compat](https://solana.com/docs/frontend/web3-compat), [anza-xyz/kit](https://github.com/anza-xyz/kit))

---

# 1. ElevenLabs

## 1.1 Package versions (npm registry, 2026-09-19)

| Package | Latest |
| --- | --- |
| `@elevenlabs/elevenlabs-js` | 2.68.0 |
| `@elevenlabs/react` | 1.15.2 |
| `@elevenlabs/client` | 1.25.0 |
| `@elevenlabs/convai-widget-embed` | 0.18.2 |

`@elevenlabs/react` re-exports everything from `@elevenlabs/client`, so installing both is
redundant.

## 1.2 Text to Speech

Base URL `https://api.elevenlabs.io`. Auth header is `xi-api-key` (not `Authorization: Bearer`).
Regional hosts also exist: `api.us`, `api.eu.residency`, `api.in.residency`, `api.sg.residency`.

| Purpose | Endpoint |
| --- | --- |
| One-shot file | `POST /v1/text-to-speech/{voice_id}` |
| HTTP stream | `POST /v1/text-to-speech/{voice_id}/stream` |
| WebSocket (input streaming) | `wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input` |
| Multi-speaker dialogue | `POST /v1/text-to-dialogue` |
| Sound effects | `POST /v1/sound-generation` |
| Speech to text | `POST /v1/speech-to-text` (multipart) |

Sources: [convert](https://elevenlabs.io/docs/api-reference/text-to-speech/convert),
[stream](https://elevenlabs.io/docs/api-reference/text-to-speech/stream),
[dialogue](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert),
[sfx](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert),
[stt](https://elevenlabs.io/docs/api-reference/speech-to-text/convert).

### Model IDs and latency

| `model_id` | Latency† | Languages | Char limit | $/1K chars |
| --- | --- | --- | --- | --- |
| `eleven_v3` | not published | 70+ | 5,000 | $0.10 |
| `eleven_v3_conversational` | ~280 ms | 70+ | not published | $0.05 |
| `eleven_multilingual_v2` | higher than Flash | 29 | 10,000 | $0.10 |
| `eleven_flash_v2_5` | ~75 ms | 32 | 40,000 | $0.05 |
| `eleven_flash_v2` | ~75 ms | en | 30,000 | $0.05 |
| `eleven_turbo_v2_5` | **deprecated** | 32 | — | — |

† Excludes application and network latency — this is model time only, so real
time-to-first-audio in a browser will be higher.

Default `model_id` if you omit it is `eleven_multilingual_v2`. Default `output_format` is
`mp3_44100_128`.

**Gotcha:** Flash v2.5 disables text normalization by default to protect latency, so phone
numbers, dates, and currency get mangled. `apply_text_normalization: "on"` is Enterprise-only for
v2.5 models. Normalize in your own code before sending, or use `eleven_multilingual_v2` for
number-heavy text. ([models](https://elevenlabs.io/docs/models))

**Also deprecated:** the `optimize_streaming_latency` query param. Don't use it in new code.

### Node/Next.js route: stream TTS to the browser

The SDK's `.stream()` returns an async iterable of `Buffer`. In a Next.js App Router route you
can hand it straight to the `Response` body:

```ts
// app/api/tts/route.ts
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY! });

export async function POST(req: Request) {
  const { text } = await req.json();

  const audio = await elevenlabs.textToSpeech.stream("JBFqnCBsd6RMkjVDRZzb", {
    modelId: "eleven_flash_v2_5",
    text,
    outputFormat: "mp3_44100_128",
    voiceSettings: { stability: 0.4, similarityBoost: 0.8, useSpeakerBoost: true, speed: 1.0 },
  });

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const chunk of audio) controller.enqueue(chunk as Uint8Array);
      controller.close();
    },
  });

  return new Response(body, { headers: { "Content-Type": "audio/mpeg" } });
}
```

Browser side, the simplest thing that works is letting the `<audio>` element do progressive
playback — it starts playing before the stream finishes:

```ts
const audio = new Audio();
audio.src = URL.createObjectURL(
  await fetch("/api/tts", {
    method: "POST",
    body: JSON.stringify({ text: "Proof anchored on Solana." }),
  }).then((r) => r.blob())
);
await audio.play();
```

That `.blob()` buffers the whole response. For true incremental playback use MediaSource
Extensions, or just use the Agents Platform (§1.4), which handles streaming playback for you.

Never ship `ELEVENLABS_API_KEY` to the client. The cookbook's browser examples all assume a
server proxy. ([streaming cookbook](https://elevenlabs.io/docs/cookbooks/text-to-speech/streaming))

## 1.3 Text to Dialogue — yes, it exists

`POST /v1/text-to-dialogue`, default `model_id` is `eleven_v3`. Takes an ordered list of
`{ text, voice_id }` pairs, max 10 unique voices, and the docs ask you to keep total characters
across all inputs at or below 2,000 per request — longer requests can terminate early or 422.

```ts
await client.textToDialogue.convert({
  inputs: [
    { text: "[giggling] Knock knock", voiceId: "JBFqnCBsd6RMkjVDRZzb" },
    { text: "[curious] Who is there?", voiceId: "Aw4FAjKCGjjNkVhN1Xmq" },
  ],
});
```

Square-bracket audio tags (`[giggling]`, `[curious]`) are the v3 emotion-control mechanism.

There is also a **Text to Dialogue WebSocket** paired with `eleven_v3_conversational`. Note its
billing model differs: each open connection reserves a "dialogue session" from a separate pool
for the whole connection lifetime, and closes automatically after 20 s of inactivity unless you
send `keep_alive`. Over-subscription returns `too_many_concurrent_requests`.

## 1.4 Agents Platform — the part that matters for calling into your app

### Creating an agent

Four routes: dashboard, REST API, CLI (`npm i -g @elevenlabs/cli`), or the hosted MCP server.
API version:

```ts
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
const elevenlabs = new ElevenLabsClient();

const agent = await elevenlabs.conversationalAi.agents.create({
  name: "Proof agent",
  tags: ["hackathon"],
  conversationConfig: {
    tts: { voiceId: "aMSt68OGf4xUZAnLpTU8", modelId: "eleven_flash_v2_5" },
    agent: {
      firstMessage: "What should I anchor on-chain for you?",
      prompt: { prompt: "You are a notary assistant..." },
    },
  },
});
console.log(agent.agentId); // agent_...
```

([quickstart](https://elevenlabs.io/docs/agents-platform/quickstart))

### Drop-in widget (zero React)

```html
<elevenlabs-convai agent-id="agent_..."></elevenlabs-convai>
<script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>
```

### React SDK — current API

Transport is chosen for you: **voice conversations use WebRTC, text-only uses WebSocket.** You
can override with `connectionType`.

```tsx
"use client";
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
} from "@elevenlabs/react";

export default function App() {
  return (
    <ConversationProvider
      clientTools={{
        displayMessage: ({ text }: { text: string }) => {
          alert(text);
          return "Message displayed";
        },
      }}
    >
      <Agent />
    </ConversationProvider>
  );
}

function Agent() {
  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();

  if (status === "connected") return <button onClick={endSession}>End</button>;
  return <button onClick={() => startSession({ agentId: "agent_..." })}>Start</button>;
}
```

`useConversation()` still exists and bundles everything, but it re-renders on *any* state change.
The granular hooks (`useConversationControls`, `useConversationStatus`, `useConversationInput`,
`useConversationMode`, `useConversationFeedback`) each subscribe to one slice.

Ask for the mic before `startSession` so the permission prompt has context:

```ts
await navigator.mediaDevices.getUserMedia({ audio: true });
```

### Client tools — the agent calling functions in your web app

Two halves, and both are required:

**(a) Declare the tool server-side** so the agent's LLM knows it exists:

```ts
const tool = await elevenlabs.conversationalAi.tools.create({
  toolConfig: {
    type: "client",
    name: "anchorProof",
    description: "Write a hash of the current document to the Solana blockchain.",
    expectsResponse: true, // "Wait for response" — agent awaits your return value
    parameters: {
      type: "object",
      properties: { label: { type: "string", description: "Human label for the proof." } },
      required: ["label"],
    },
  },
});

await elevenlabs.conversationalAi.agents.update("agent_...", {
  conversationConfig: { agent: { prompt: { toolIds: [tool.id] } } },
});
```

**(b) Register the handler client-side.** Names are **case-sensitive** and must match exactly.

```tsx
import { useConversationClientTool } from "@elevenlabs/react";

function ProofPanel() {
  const [docHash, setDocHash] = useState<string>();

  useConversationClientTool("anchorProof", async ({ label }: { label: string }) => {
    const res = await fetch("/api/anchor", {
      method: "POST",
      body: JSON.stringify({ hash: docHash, label }),
    });
    const { signature } = await res.json();
    return `Anchored. Signature ${signature}`; // fed back into conversation context
  });

  return <Doc onHash={setDocHash} />;
}
```

`useConversationClientTool` auto-unregisters on unmount and always uses the latest closure, so
it's the right choice when the handler needs component state. Tools registered at the provider
level via `clientTools` are for static handlers.

**The trap:** if `expects_response` / "Wait for response" is not ticked in the tool config, the
agent assumes success and keeps talking without waiting for your return value. For a
"write to chain, then confirm the signature out loud" flow you must set it.

### Server tools (webhooks)

`type: "webhook"` with an `api_schema` describing URL, method, and path/query/body params. The
LLM generates the parameter values from conversation context. Auth via custom headers, bearer
secrets, Basic, OAuth2 client-credentials, or OAuth2 JWT.

```ts
await elevenlabs.conversationalAi.tools.create({
  toolConfig: {
    type: "webhook",
    name: "get_proof_status",
    description: "Looks up whether a proof has been confirmed on-chain.",
    apiSchema: {
      url: "https://your-app.vercel.app/api/proof/{proofId}",
      method: "GET",
      pathParamsSchema: {
        proofId: { type: "string", description: "The proof identifier." },
      },
    },
  },
});
```

**Client vs server tool, decision rule:** client tools act on the user's browser (DOM, wallet
popup, navigation). Webhook tools call your backend. A wallet-signature flow must be a *client*
tool, because the wallet lives in the browser.

ElevenLabs recommends high-intelligence LLMs for tool calling (it names GPT 5.2,
Gemini-2.5-Flash, Claude Sonnet 4.5) and explicitly warns against Gemini-2.0-Flash.

### Authenticated agents

Public agents need only `agentId`. For private agents, mint a short-lived credential server-side:

```ts
// WebSocket path
GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=...
// -> { signed_url }  ->  startSession({ signedUrl })

// WebRTC path
GET https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=...
// -> { token }       ->  startSession({ conversationToken })
```

Both require `xi-api-key` and must never run in the browser.

Other useful methods: `sendUserMessage`, `sendContextualUpdate` (inject context without
triggering a turn — good for "user just navigated to the proof page"), `sendUserActivity`
(pauses the agent ~2 s while the user types), `setVolume`, `getId`.

## 1.5 Speech to Text (Scribe)

`POST /v1/speech-to-text`, `multipart/form-data`. Current model ID is **`scribe_v2`**
(`scribe_v1` is deprecated). Siblings: `scribe_v2_realtime` (~150 ms, streaming),
`scribe_v2_medical`.

Fields worth knowing: `model_id` (required), `file`, `diarize`, `num_speakers` (up to 32),
`language_code`, `keyterms` (up to 1000), `entity_detection`, `tag_audio_events`,
`timestamps_granularity` (`word` | `spacing` | `audio_event`), `no_verbatim` (strips filler
words, v2 only), `webhook` for async.

`file_format: "pcm_s16le_16"` (16-bit PCM, 16 kHz, mono, little-endian) has lower latency than
an encoded waveform.

## 1.6 Music and sound effects

- **Sound effects:** `POST /v1/sound-generation`, model `eleven_text_to_sound_v2`. Body takes
  `text`, `duration_seconds` (0.5–30, omit to auto-pick), `prompt_influence` (0–1, default 0.3),
  and `loop` (v2 only, seamless loops). $0.12/min.
- **Music:** models `music_v2_5` (best), `music_v2`, `music_v1`. $0.15/min, 5-minute cap.
  Supports composition plans, audio reference, and section inpainting.
  **[UNVERIFIED]** I did not fetch the music endpoint path itself; confirm against
  <https://elevenlabs.io/docs/api-reference> before wiring it.
  Note: commercial-use licensing on music requires Starter tier or above.

## 1.7 Free tier — the numbers that constrain a hackathon

From the "Free / Pay as you go" column of the model pricing table
([pricing](https://elevenlabs.io/pricing/api)):

| Product | Free allowance / month |
| --- | --- |
| TTS v3 or v2 Multilingual | 10,000 characters (~10 min audio) |
| TTS Flash / Turbo / v3 Conversational | 20,000 characters (~20 min) |
| Scribe v2 STT | 4 h 30 m |
| Scribe v2 Realtime | 2 h 30 m |
| Speech Engine (agents) | 15 min, 4 concurrent calls |
| Music | 3 min |
| Sound effects | 8 generations |
| Voice Changer / Isolator | 8.3 min each |

Free-plan concurrency: 2 (Multilingual v2), 4 (Flash), 8 (STT), 6 (realtime STT), 0 (music),
priority level 3.

**15 minutes of agent time is the real constraint.** That's maybe 15–20 demo conversations.
Budget it: script your demo, and don't leave a live agent session open while debugging. Most
ElevenHacks tracks hand out a free month of Creator (~$22, 220k v3 chars / 275 agent min) to all
attendees — claim it on the hackathon page before you start burning free-tier quota.

Response headers `current-concurrent-requests` and `maximum-concurrent-requests` let you monitor
usage. There's also a Startup Grants program (12 months free, 33M characters) if this outlives
the hackathon.

## 1.8 The "Out Loud" track — **[UNVERIFIED]**

**I could not find an ElevenLabs hackathon track named "Out Loud."** Three search passes plus a
direct fetch of <https://hacks.elevenlabs.io/> (Cloudflare-blocked, then HTTP 429 on curl with a
browser UA) turned up nothing by that name.

What does exist: **ElevenHacks Season 1**, eleven weekly hackathons, $240,000+ total pool. Season
1 tracks were Firecrawl, Cloudflare, Replit, turbopuffer, Kiro, Zed, v0, Cursor, Stripe, D-ID,
and a Speech Engine week. All eleven are marked "Ended," with the grand prize dated
25 June 2026 — i.e. Season 1 closed before today's date. If "Out Loud" is real it is most likely
a **Season 2** track not yet indexed by search.

The Season 1 format is consistent enough to plan against, from the
[official rules](https://hacks.elevenlabs.io/terms) and individual track pages:

- One week per hack: opens Thursday 17:00, closes the following Thursday 17:00, winners the
  following Tuesday.
- Every track requires **both** the sponsor technology **and** ElevenLabs APIs.
- Deliverable is a **high-quality, viral-style demo video**, not just a repo.
- Judging: creativity/originality 40%, effective technology use 40%, presentation/demo
  quality 20%.
- Points: 1st +400, 2nd +200, 3rd +150, +50 per social platform posted (X, LinkedIn, Instagram,
  TikTok), +200 Most Viral, +200 Most Popular (community emoji vote).
- Typical prizes: ~$3–10k in sponsor cash/credits plus 1–3 months of ElevenLabs Scale.

**Action:** confirm the track name and its brief on the live hackathon page before scoping. If
"Out Loud" follows the Season 1 pattern, plan for a polished demo video and social posts as
first-class deliverables — they're worth as many points as placement.

---

# 2. Solana

## 2.1 Fastest real path from a Next.js app to devnet

**Use `@solana/kit`.** The naming is genuinely confusing, so here it is explicitly:

| Package | Latest | Status |
| --- | --- | --- |
| `@solana/kit` | **8.3.0** | The 2.x line of web3.js, renamed. **Use this.** |
| `@solana/web3.js` | 1.99.0 (`latest`) | Legacy v1. Maintenance only. |
| `@solana/web3.js` | 3.0.0-rc.3 (`rc`) | Class-based API rebuilt on Kit internals. Legacy-interop bridge, RC — pin exact versions. |
| `@solana/wallet-adapter-react` | 0.15.40 | Superseded for new apps. |
| `@solana/kit-plugin-rpc` | 0.19.0 | |
| `@solana/kit-plugin-wallet` | 0.20.0 | Wallet Standard discovery |
| `@solana/react` | 8.3.0 | `ClientProvider`, `useClient`, data hooks |
| `@solana-program/system` | 0.14.1 | |
| `@solana-program/memo` | 0.14.1 | |
| `@solana-program/token` | 0.16.1 | |

Kit's own numbers vs legacy v1: a web app doing a lamport transfer bundles at **23.9 KB vs
111 KB** (−78%), and key generation/signing runs ~10× faster via native Ed25519.
([anza-xyz/kit](https://github.com/anza-xyz/kit))

Wallet-adapter is gone because modern wallets (Phantom, Solflare, Backpack) all advertise
themselves through **Wallet Standard**, so per-wallet adapter packages are unnecessary.

### Minimal working setup

```bash
npx create-next-app@latest my-app && cd my-app
npm install @solana/kit @solana/kit-plugin-rpc @solana/kit-plugin-wallet \
            @solana/react @solana-program/system @solana-program/memo
```

Set `"target": "ES2020"` or later in `tsconfig.json` — Kit uses `bigint` literals like
`1_000_000_000n`.

```tsx
// app/providers.tsx
"use client";
import { createClient } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";
import { ClientProvider } from "@solana/react";

const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export const client = createClient()
  .use(walletSigner({ chain: "solana:devnet" }))
  .use(solanaRpc({ rpcUrl }));

export type AppClient = Awaited<typeof client>;

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>;
}
```

Wallet connection, in a leaf client component:

```tsx
"use client";
import { useConnect, useConnectedWallet, useWallets } from "@solana/kit-plugin-wallet/react";
import { useClient } from "@solana/react";
import type { AppClient } from "../providers";

export function Connect() {
  const client = useClient<AppClient>();
  const wallets = useWallets(client);       // Wallet Standard discovery
  const connected = useConnectedWallet(client);
  const connect = useConnect(client);       // { dispatch, isRunning, error }

  if (connected) return <span>{String(connected.account.address)}</span>;
  return (
    <>
      {wallets.map((w) => (
        <button key={w.name} onClick={() => void connect.dispatch(w)}>
          {w.name}
        </button>
      ))}
    </>
  );
}
```

Every wallet hook takes the client as its **first argument** — a common mistake coming from
wallet-adapter.

Keep server components server-side; only leaf components that call hooks should be
`"use client"`. Server-side reads can use a plain Kit RPC client with no wallet plugin.
([Next.js + Kit tutorial](https://solana.com/docs/frontend/nextjs-solana))

### Devnet SOL

Official faucet <https://faucet.solana.com> allows **2 requests per 8 hours** anonymously,
rate-limited **by IP** (so a shared hackathon venue Wi-Fi will collide). Sign in with a
established GitHub account for a higher limit. CLI: `solana airdrop 2 --url devnet`.
Unlimited alternative: `solana-test-validator` locally.

## 2.2 Memo / on-chain attestation — **this is your best bet**

You said you most likely want cheap verifiable timestamped proof. You're right, and the memo
program is the correct tool.

**Program ID:** `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` (same on devnet and mainnet).

The program validates the UTF-8 string, verifies that any accounts passed are signers, and logs
both the memo and each verified signer. The bytes live permanently in the ledger as instruction
data; the log is what explorers and `getTransaction` surface.

**Costs and limits:**

| | |
| --- | --- |
| Cost | One signature's base fee, ~0.000005 SOL. No account rent — nothing is allocated. |
| Max memo | **566 bytes** single-byte UTF-8, unsigned. This is a *compute* limit, not the 1,232-byte transaction size limit. |
| Signers | A 32-byte memo supports up to 12 signers. Longer memo ⇒ fewer signers, and vice versa. |
| Compute | ~18,097 CU for a 46-char memo, out of the 200,000 default. |

A SHA-256 hex digest is 64 bytes, so you can comfortably fit a hash plus a timestamp, a schema
version, and a label. ([solana-program.com/docs/memo](https://www.solana-program.com/docs/memo))

### Kit version (recommended)

```ts
import { getAddMemoInstruction } from "@solana-program/memo";

const payload = JSON.stringify({
  v: 1,
  alg: "sha256",
  hash: documentHashHex,      // 64 bytes
  at: new Date().toISOString(),
  label,
});

const memoInstruction = getAddMemoInstruction({ memo: payload });

const { context: { signature } } = await client.sendTransaction([memoInstruction]);
```

The connected wallet is the fee payer and signer (via the `walletSigner` plugin), which is
exactly what makes the attestation attributable: the signer's pubkey is recorded alongside the
memo.

### Reading it back

```ts
const tx = await client.rpc
  .getTransaction(signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 })
  .send();

console.log(tx?.meta?.logMessages);
// 'Program log: Memo (len 46): "{...}"'
```

For verification, `blockTime` on the fetched transaction gives you the cluster's timestamp —
that's the "timestamped" half of your proof. To enumerate all proofs by a wallet, use
`getSignaturesForAddress` on the signer.

### Legacy web3.js v1 version

If you're stuck on v1:

```ts
import { createMemoInstruction } from "@solana/spl-memo"; // v0.3.0
import { Transaction, sendAndConfirmTransaction } from "@solana/web3.js";

const tx = new Transaction().add(
  createMemoInstruction(payload, [payer.publicKey]) // signerPubkeys -> "Signed by <addr>" log
);
await sendAndConfirmTransaction(connection, tx, [payer]);
```

Passing `signerPubkeys` is what makes the program emit `Program log: Signed by <BASE_58_ADDRESS>`
— worth doing, since it's the on-chain evidence of who attested.

**Feasibility: trivially achievable.** One dependency, one instruction, ~0.000005 SOL, no program
deployment, no account management, works identically on devnet and mainnet.

## 2.3 Solana Pay

Spec: <https://docs.solanapay.com/spec>. Library `@solana/pay` v1.0.26.

**Caveat:** `@solana/pay` is still built on `@solana/web3.js` v1 (`Connection`, `PublicKey`).
If your app is on Kit you'll need `@solana/compat` for type conversion at the boundary, or just
run the Pay logic in an isolated server route with the v1 dependency.

### Two request types

**Transfer request** — non-interactive; the wallet composes the transaction itself:

```
solana:<recipient>?amount=<amount>&spl-token=<mint>&reference=<ref>&label=<label>&message=<msg>&memo=<memo>
```

- `recipient` must be a native SOL account pubkey, **never** an ATA. For SPL tokens the wallet
  derives the ATA from `recipient` + `spl-token`.
- `amount` is in user units (SOL, not lamports; `uiAmountString` for tokens). Leading zero
  required below 1. No scientific notation.
- `reference` — one or more base58 32-byte values, included as read-only non-signer keys.
  **This is the important one:** validators index by account key, so a unique `reference` per
  checkout session is your client-side correlation ID, findable via `getSignaturesForAddress`
  before you ever know the signature.
- `memo` — if present, the wallet must insert an SPL Memo instruction *immediately before* the
  transfer instruction.

**Transaction request** — interactive, and far more powerful: `solana:<https-link>`. The wallet
does `GET` (you return `{label, icon}`), then `POST` with `{account}` (you return
`{transaction, message?}` where `transaction` is a base64 serialized transaction).

**This is the one to use if you want a QR that triggers an arbitrary instruction** — including a
memo attestation signed by whoever scans it. Rules: if you return unsigned, leave `feePayer` and
`recentBlockhash` zeroed and the wallet fills them in. The wallet signs **only** with the
requested `account`, and must reject the transaction as malicious if any other signature is
expected.

### QR generation

```ts
import { encodeURL, createQR, findReference, validateTransfer, FindReferenceError } from "@solana/pay";
import { Connection, clusterApiUrl, Keypair, PublicKey } from "@solana/web3.js";
import BigNumber from "bignumber.js";

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

const reference = new Keypair().publicKey; // unique per session, generate server-side
const url = encodeURL({
  recipient: new PublicKey(MERCHANT_WALLET),
  amount: new BigNumber(0.1),
  reference,
  label: "Proof Notary",
  message: "Anchor proof #001234",
  memo: "PROOF#4098",
});

const qr = createQR(url);
qr.append(document.getElementById("qr-code")!);
```

Then poll and validate:

```ts
const interval = setInterval(async () => {
  try {
    const { signature } = await findReference(connection, reference, { finality: "confirmed" });
    clearInterval(interval);
    await validateTransfer(connection, signature, {
      recipient: new PublicKey(MERCHANT_WALLET),
      amount: new BigNumber(0.1),
    });
  } catch (e) {
    if (!(e instanceof FindReferenceError)) { clearInterval(interval); throw e; }
  }
}, 250);
```

`findReference` alone proves *a* transaction referenced your order; it does **not** prove the
right amount went to the right recipient. `validateTransfer` is what closes that hole. Generate
`amount` and `reference` server-side and store them before showing the QR — otherwise a
manipulated frontend can fake a confirmation.
([merchant integration](https://docs.solanapay.com/core/transfer-request/merchant-integration))

## 2.4 Compressed NFTs (Bubblegum) and Helius DAS

Use **Bubblegum V2** (`mintV2`); v1 is legacy. `@metaplex-foundation/mpl-bubblegum` is at 5.1.0.

### Real costs

You must create a Merkle tree **before** minting, and tree params are **immutable** after
creation. Metaplex's recommended settings:

| cNFTs | Depth | Canopy | Buffer | Tree cost | Cost/cNFT |
| --- | --- | --- | --- | --- | --- |
| 16,384 | 14 | 8 | 64 | **0.3358 SOL** | 0.0000255 SOL |
| 65,536 | 16 | 10 | 64 | 0.7069 SOL | 0.0000158 SOL |
| 1,048,576 | 20 | 13 | 1024 | 8.5012 SOL | 0.0000131 SOL |

**The per-mint cost is negligible; the tree is the whole expense.** For a hackathon a depth-14
tree at ~0.34 SOL is the right size, and on devnet that's two faucet pulls.

```ts
import { generateSigner } from "@metaplex-foundation/umi";
import { createTreeV2, mintV2 } from "@metaplex-foundation/mpl-bubblegum";
import { none } from "@metaplex-foundation/umi";

const merkleTree = generateSigner(umi);
await (await createTreeV2(umi, { merkleTree, maxDepth: 14, maxBufferSize: 64 }))
  .sendAndConfirm(umi);

const { signature } = await mintV2(umi, {
  leafOwner: umi.identity.publicKey,
  merkleTree: merkleTree.publicKey,
  metadata: {
    name: "Proof #1",
    uri: "https://example.com/proof-1.json",
    sellerFeeBasisPoints: 0,
    collection: none(),
    creators: [],
  },
}).sendAndConfirm(umi);
```

To recover the asset ID you must wait for **finalized**, not merely confirmed:

```ts
const leaf = await parseLeafFromMintV2Transaction(umi, signature);
const assetId = leaf.id;
```

### Reading cNFTs — you need an indexer

cNFT data lives in transactions, not accounts, so plain RPC can't read it. Use the DAS API.
Helius supports devnet: `https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY`.

```ts
const res = await fetch(`https://devnet.helius-rpc.com/?api-key=${KEY}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "getAsset", params: { id: assetId } }),
});
const { result } = await res.json();
// result.compression -> { compressed, tree, leaf_id, data_hash }
```

Methods: `getAsset`, `getAssetBatch`, `getAssetsByOwner`, `searchAssets`, plus two
compression-specific ones — `getAssetProof` (returns `{root, proof, node_index, leaf, tree_id}`,
required for on-chain transfers/burns) and `getSignaturesForAsset`.
([Helius DAS](https://www.helius.dev/docs/das-api))
**[UNVERIFIED]** Helius free-plan rate limit reported as 2 requests/second — confirm on their
pricing page.

**Verdict for a hackathon:** feasible but it is the heaviest option here. Budget for tree
creation, an off-chain metadata host, a Helius key, and the finalized-commitment wait before you
can read back what you minted. **If your goal is "cheap verifiable timestamped proof," memo is
strictly simpler** and gets you there without a tree, an indexer, or metadata hosting. Reach for
cNFTs only if you specifically need a transferable, wallet-visible collectible.

## 2.5 Metaplex Core — cheap NFTs without compression

If you want NFTs that show up in wallets but don't want a Merkle tree, **Core is the sweet spot**.
`@metaplex-foundation/mpl-core` 1.10.0. Program ID
`CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` (identical on devnet and mainnet).

```ts
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { create, mplCore } from "@metaplex-foundation/mpl-core";
import { generateSigner } from "@metaplex-foundation/umi";

const umi = createUmi("https://api.devnet.solana.com").use(mplCore());
const asset = generateSigner(umi);

await create(umi, {
  asset,
  name: "Proof #1",
  uri: "https://example.com/proof-1.json",
}).sendAndConfirm(umi);
```

**Cost per asset: ~0.003 SOL** — ~0.0015 rent + 0.0015 Core protocol fee + ~0.000005 tx fee.
Core uses a single account where Token Metadata needs 3+ (mint, metadata, token), so it's ~80%
cheaper. No tree, no indexer required, no immutable capacity decision.

At ~0.003 SOL each, Core beats cNFTs outright for anything under ~100 mints: a depth-14 tree
costs 0.34 SOL up front, which is ~113 Core assets. Plugins (Royalties, Freeze/Burn/Transfer
Delegate, Attributes) are cheaper attached at creation than added later.

## 2.6 SPL tokens and Token Extensions

Token-2022 program: `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`. Classic SPL Token:
`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`.

Kit-native mint creation is a five-instruction sequence in one transaction — create account,
initialize mint, create both ATAs, mint:

```ts
import {
  getInitializeMintInstruction, getMintSize, getMintToInstruction,
  getCreateAssociatedTokenInstructionAsync, findAssociatedTokenPda,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { getCreateAccountInstruction } from "@solana-program/system";

const mint = await generateKeyPairSigner();
const space = BigInt(getMintSize());
const rent = await client.rpc.getMinimumBalanceForRentExemption(space).send();

await client.sendTransaction([
  getCreateAccountInstruction({ payer, newAccount: mint, lamports: rent, space,
                                programAddress: TOKEN_2022_PROGRAM_ADDRESS }),
  getInitializeMintInstruction({ mint: mint.address, decimals: 6, mintAuthority: payer.address }),
  await getCreateAssociatedTokenInstructionAsync({ payer, mint: mint.address, owner: payer.address,
                                                   tokenProgram: TOKEN_2022_PROGRAM_ADDRESS }),
  getMintToInstruction({ mint: mint.address, token: payerAta, mintAuthority: payer.address,
                         amount: 1_000_000n }),
]);
```

One relevant extension: **required-memo-on-transfer** — a Token-2022 mint can be configured to
*reject* any transfer that lacks a memo instruction. That's a neat forcing function if you want
every token movement to carry an attestation.
**[UNVERIFIED]** I did not fetch the token-extensions reference page; confirm the exact
extension-initialization call order (extensions must be initialized before `InitializeMint`, and
`getMintSize()` must be passed the extension list to size the account correctly).

## 2.7 Anchor on devnet — how heavy is it really?

Honestly: **heavier than everything else in this document, and probably not worth it.**

The deploy itself is mechanically simple:

```toml
# Anchor.toml
[provider]
cluster = "Devnet"
wallet = "~/.config/solana/id.json"
```

```bash
solana airdrop 2 --url devnet
anchor build
anchor deploy --provider.cluster devnet
```

The costs and frictions that actually bite:

- **Rent scales with program size.** Check with `solana rent $(wc -c < target/deploy/prog.so)`.
  The docs' worked example: 18,504 bytes ⇒ 0.12967872 SOL. A typical Anchor program with the IDL
  lands in the tens-of-KB range.
- **Deploy needs roughly 2× the program-data rent temporarily**, because bytecode goes to a
  buffer account first, then to ProgramData. Combined with the 2-SOL-per-8-hours faucet limit,
  a few failed deploys can genuinely strand you.
- **`anchor deploy` generates a new program address every run** (unlike `solana program deploy`),
  so repeated deploys burn fresh rent each time unless you manage keypairs deliberately.
- Rust toolchain, `cargo build-sbf`, platform-tools version pinning, IDL generation, and a
  test setup all have to work before you write a line of product code.

`@coral-xyz/anchor` is at 0.32.1. Anchor now defaults to **Surfpool** as the local validator
backend (`anchor test --validator legacy` for `solana-test-validator`), and LiteSVM is the fast
in-process test path.

**Recommendation: skip Anchor.** For a timestamped-proof app you need zero custom program logic
— memo gives you signer attribution, permanent instruction data, and `blockTime`, for 0.000005
SOL and no deployment. Write a program only if you need on-chain *state* or *validation* that
composes with other programs, and neither applies here.

---

# 3. Recommended build for "cheap verifiable timestamped proof" + voice agent

The two sponsors compose cleanly. Concretely:

1. **Next.js App Router** + `@solana/kit` 8.3.0 + `@solana/kit-plugin-wallet` for Wallet
   Standard connection, pointed at `https://api.devnet.solana.com`.
2. **Proof write:** SHA-256 the artifact client-side, build one `getAddMemoInstruction`, send via
   `client.sendTransaction`. ~0.000005 SOL, ~1 s, no program deploy. Read back with
   `getTransaction` for `logMessages` + `blockTime`; list a user's proofs with
   `getSignaturesForAddress`.
3. **Voice layer:** an ElevenLabs agent with `eleven_v3_conversational` or `eleven_flash_v2_5`,
   embedded via `@elevenlabs/react` with `ConversationProvider`.
4. **The differentiating bit:** a **client tool** named e.g. `anchorProof` with
   `expectsResponse: true`. The agent collects the label conversationally, calls into your React
   app, your handler triggers the wallet signature, and the returned signature string flows back
   into conversation context so the agent reads the transaction signature out loud. Use a
   **webhook tool** for the read-side lookup (`get_proof_status`), since that hits your backend.
5. **Optional flourish:** a Solana Pay **transaction request** QR so a second device can scan and
   co-sign an attestation. And if you need a wallet-visible collectible, Metaplex Core at
   ~0.003 SOL, not cNFTs.

Watch the two hard limits: **15 free agent-minutes** on the ElevenLabs free tier (claim the
hackathon's free Creator month first), and **2 devnet airdrops per 8 hours per IP**.

---

# 4. Everything I could not verify

| Item | Status |
| --- | --- |
| ElevenLabs "Out Loud" track | **Not found.** No such named track in ElevenHacks Season 1; site fetch blocked by Cloudflare/429. Possibly Season 2. §1.8 has the Season 1 format to plan against. |
| Eleven Music API endpoint path | Not fetched. Model IDs and pricing confirmed; the route is not. |
| `eleven_v3` latency figure | Not published by ElevenLabs. Only v3 Conversational (~280 ms) and Flash (~75 ms) are. |
| `eleven_v3_conversational` character limit | Not in the character-limits table. |
| Token-2022 extension init ordering | Not fetched. Basic Token-2022 mint flow is verified; extension-specific sizing/ordering is not. |
| Helius free-tier rate limit (2 req/s) | From search synthesis, not from Helius's pricing page. |
| Exact Anchor devnet deploy cost | Size-dependent by nature. The 18,504 B ⇒ 0.1297 SOL data point is from Solana docs; your program's size is unknown. |
