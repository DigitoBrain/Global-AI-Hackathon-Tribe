// Retrieval scorecard: golden questions over the seeded store, with hard gates.
// Measures hit@3, correct "I don't know", retired-fact leakage, evolution, and guardrails.
// Run: node scripts/scorecard.mjs           (uses current store; Reset demo first for seed numbers)
//      node scripts/scorecard.mjs --reset   (resets to the seed demo data first)
import {
  listMemories, searchMemories, graphAuthority, currentPool, isTemporalQuery,
  evolutionChain, findSourceMemories, guardrailCheck, withMeta, backfillKeys,
} from "../server/store.mjs";
import { seedIfEmpty, resetSeed } from "../server/seed.mjs";

if (process.argv.includes("--reset")) resetSeed();
seedIfEmpty();
backfillKeys();

const pool = listMemories().map(withMeta);
const current = currentPool(pool, false);
const rank = (q, p = current) => searchMemories(q, p, { graph: graphAuthority() });

const cases = [
  { kind: "hit", q: "What caused the checkout latency regression?", expect: ["Root cause: pool exhaustion after deploy"] },
  { kind: "hit", q: "What should I check first when checkout p95 rises?", expect: ["Checkout latency runbook (current)"] },
  { kind: "hit", q: "Who can provide payment webhook retry limits?", expect: ["Payments on-call can provide payment webhook knowledge"] },
  { kind: "hit", q: "Where do I see live checkout pool saturation right now?", expect: ["Checkout observability dashboard can provide live metrics"], note: "paraphrase" },
  { kind: "hit", q: "Did increasing the database pool size help?", expect: ["Rejected: raise pool 50 to 200 (never committed)"], note: "paraphrase" },
  { kind: "hit", q: "What amplified the checkout incident?", expect: ["Root cause: pool exhaustion after deploy", "Private note: payment retries may amplify incidents"] },
  { kind: "hit", q: "Can I delete checkout pods in prod?", expect: ["Never delete checkout pods in prod"] },
  { kind: "miss", q: "What is our office Wi-Fi password?" },
  { kind: "miss", q: "How do I expense a flight to a conference?" },
];

let hits = 0, hitTotal = 0, misses = 0, missTotal = 0;
const lines = [];
for (const c of cases) {
  const top = rank(c.q).slice(0, 3);
  if (c.kind === "hit") {
    hitTotal += 1;
    const ok = top.some((r) => c.expect.includes(r.memory.title));
    if (ok) hits += 1;
    lines.push(`${ok ? "PASS" : "FAIL"}  hit@3  ${c.q}${c.note ? ` (${c.note})` : ""} -> ${top[0]?.memory.title ?? "(nothing)"}`);
  } else {
    missTotal += 1;
    const ok = rank(c.q).length === 0;
    if (ok) misses += 1;
    lines.push(`${ok ? "PASS" : "FAIL"}  i-don't-know  ${c.q} -> ${ok ? "no evidence (correct)" : `wrongly matched: ${top[0]?.memory.title}`}`);
  }
}

// Hard gates: retired knowledge must never leak into current answers.
const leakQ = "Should I restart checkout pods first when latency rises?";
const leakTop = rank(leakQ).slice(0, 5);
const leaked = leakTop.some((r) => r.memory.status === "superseded" || r.memory.status === "deprecated");
lines.push(`${leaked ? "FAIL" : "PASS"}  no-leak  "${leakQ}" -> retired memory ${leaked ? "LEAKED into current results" : "absent from current results"}`);

// Evolution: temporal question walks history oldest -> current, retired included.
const evoQ = "How has checkout guidance changed over time?";
const chain = evolutionChain(pool, "checkout");
const evoOk = isTemporalQuery(evoQ) && chain.some((m) => m.title.startsWith("OLD:")) && chain.some((m) => m.title.includes("runbook (current)"))
  && new Date(chain[0].created_at) <= new Date(chain[chain.length - 1].created_at);
lines.push(`${evoOk ? "PASS" : "FAIL"}  evolution  "${evoQ}" -> ${chain.length} memories, oldest first, retired included`);

// Provider fallback: who/what can provide, from ordinary memories.
const src = findSourceMemories("payment webhook retry limits");
const srcOk = src.some((m) => m.title.startsWith("Payments on-call"));
lines.push(`${srcOk ? "PASS" : "FAIL"}  find-source  "payment webhook retry limits" -> ${src[0]?.title ?? "(nothing)"}`);

// Guardrail: dangerous action blocked by a warning memory.
const guard = guardrailCheck("kubectl delete pods in prod checkout");
lines.push(`${guard.blocked ? "PASS" : "FAIL"}  guardrail  "kubectl delete pods in prod checkout" -> blocked=${guard.blocked}`);

console.log(lines.join("\n"));
console.log(`\nhit@3: ${hits}/${hitTotal}  |  correct I-don't-know: ${misses}/${missTotal}  |  hard gates: ${!leaked && evoOk && srcOk && guard.blocked ? "all pass" : "FAILED"}`);
const pass = hits >= hitTotal - 1 && misses === missTotal && !leaked && evoOk && srcOk && guard.blocked;
console.log(pass ? "SCORECARD: PASS" : "SCORECARD: FAIL");
process.exit(pass ? 0 : 1);
