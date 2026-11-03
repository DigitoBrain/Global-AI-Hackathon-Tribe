# Tribe — demo video script (target: 2 minutes)

Requirements this script is built to satisfy (from our own decision log):

- Indie track judging rewards a polished, flawless ~2-minute demo (D-001).
- The video must show a **real Meta-backed run** — the header badge must read
  "Meta Model API live", not deterministic mode (implementation.md, D-005).
- Lead with cognitive load and individual ownership, not "memory engine"
  internals (D-010 / positioning).
- Never claim features we removed: no slices/forks, no session sharing, no
  kinds (D-020/D-021/D-022). Language: "your session is just there — browser,
  IDE via MCP, wherever you work."

## Before recording (checklist)

1. `npm run build`, then `npm start`; open http://localhost:8787
2. Click **Reset demo** (seeded "Checkout latency regression" session).
3. Confirm the header badge says **Meta Model API live**.
4. Browser zoom ~125% so text is readable in video; close other tabs.
5. In VS Code: open Copilot Chat, run `MCP: List Servers`, start `tribe`,
   enable Tribe tools in the tool picker. Pre-warm once ("Use Tribe to list
   my context sessions") so the recording has no dead air.
6. Optional terminal ready for the closing scorecard flash:
   `npm run scorecard`.

## Script

### 0:00–0:12 — The problem (show the Tribe header)

> "Every AI tool I use forgets what the last one learned. I spend my day
> re-explaining context. Tribe is my tribal knowledge — captured without
> filing, and it follows me into whichever AI I'm using."

### 0:12–0:30 — Capture without filing (Section 1)

Paste into the dump box (markdown, with a fake secret):

```
# Checkout is slow again
- p95 spiking since the deploy
- api_key=DEMO-SECRET-12345 in the logs — ignore
- Ask payments on-call before touching retries
```

Click **Capture memory**.

> "I dump anything — no folder, no category, no kind to pick, not even a
> title: Tribe derived 'Checkout is slow again' from the text itself. It
> connects the memory to related ones automatically, it's available to
> every session I open — and notice: the secret was redacted before
> storage."

### 0:30–1:00 — Grounded chat (Section 2)

Click the chip **"What caused it?"**, then type the follow-up:
`And why did that amplify it?`

> "This is a normal chat — but every answer is grounded in my memories, with
> citations and a plain-language why: what matched, how recent, how trusted.
> Follow-ups work like any chat app. And if there's no evidence…"

Click the chip **"No-evidence question"** (office Wi-Fi password).

> "…it says 'I don't know' instead of guessing. No hedging, no invented
> password."

Then click the chip **"Who can provide…?"** (vendor escalation for payments).

> "And when the answer itself isn't stored, Tribe still knows who can
> provide it — because who-can-do-what is tribal knowledge too, captured
> as an ordinary memory."

### 1:00–1:10 — Warnings before action

Click **"Check a dangerous action"** (`kubectl delete pods in prod…`), then
**"Raise pool to 200?"**.

> "Before I do something dangerous, the warning memory blocks it in-chat.
> And it remembers what we already tried and rejected — so I don't repeat
> failed experiments."

### 1:10–1:25 — Chronology you can trust

Click **"How has guidance changed?"**. Then ask:
`Should I restart checkout pods first when latency rises?`

> "Chronology is first-class. It walks me from the old advice to the current
> position, with dates. The retired advice still exists for history — but it
> can never be served as the current answer."

### 1:25–1:40 — Chat is not memory, until you say so

Point at any assistant reply and click **Save as memory**.

> "Chat is just chat. Nothing becomes knowledge until I click Save as
> memory — then it's linked back to the sources it came from, and it's
> available to every session, not just this one."

Scroll to Section 3 briefly: show the new card, trust badges, "Findable via"
keys.

> "Every memory shows its age and trust. Newer verified knowledge wins;
> stale is demoted, never silently obeyed."

### 1:40–1:55 — The same session, in the IDE (VS Code Copilot Chat)

Type in Copilot Chat:

> "Use Tribe to pull the context for my Checkout latency session and tell me
> where things stand. Then tell that session: the queue-time alert fired
> twice today."

Copilot summarises from the pulled context, then the finding lands in the
session's chat and the session replies to it — it does **not** become a
memory. (If you want it permanent, the sentence shape is different:
"Use Tribe to remember this: …" — that one creates a generally-available
Memory.)

> "Same session, same memories — no sharing step, no export. It's mine, so
> it's just there: browser, IDE, any MCP client. And notice what didn't
> happen: telling a session something doesn't silently make it knowledge.
> That stays a deliberate act, on every surface."

Switch back to the web app and refresh: the finding and the session's reply
are in the Context Session chat.

### 1:55–2:05 — Proof + close

Flash the terminal: `npm run scorecard` (hit@3, I-don't-know, hard gates).

> "And we measure it: retrieval scorecard, hard gates — retired facts can't
> leak. Tribe: dump anything, ask anything, trust what it tells you —
> because it shows its age."

## Fallbacks while recording

- Badge says "Deterministic demo mode": stop, fix the key in `.env.local`,
  restart, re-check `/api/health` before recording.
- A chat answer stalls >5s: cut and re-record that beat; do not narrate over
  a spinner.
- MCP tools missing in Copilot: restart the `tribe` server
  (`MCP: List Servers`) and re-enable tools in the picker.
