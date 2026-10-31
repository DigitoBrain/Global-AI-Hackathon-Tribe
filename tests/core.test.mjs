import test from "node:test";
import assert from "node:assert/strict";
import { scrubSecrets } from "../server/scrub.mjs";
import { searchMemories, isTemporalQuery, evolutionChain, isReferentialFollowup } from "../server/store.mjs";

test("scrub redacts api keys and bearer tokens", () => {
  const r = scrubSecrets("api_key=sk-test1234567890 and Bearer abcdefghijklmnop");
  assert.equal(r.redactions, 2);
  assert.ok(!r.text.includes("sk-test1234567890"));
  assert.ok(r.text.includes("[REDACTED]"));
});

test("search ranks matching verified memory and ignores no-evidence", () => {
  const pool = [
    { id: 1, title: "Pool root cause", body: "checkout pool exhaustion", tags: ["checkout"], confidence: 0.9, status: "active", updated_at: new Date().toISOString(), last_verified: new Date().toISOString() },
    { id: 2, title: "Lunch notes", body: "sandwich preferences", tags: [], confidence: 0.9, status: "active", updated_at: new Date().toISOString(), last_verified: new Date().toISOString() },
  ];
  const hits = searchMemories("what caused checkout pool problem", pool);
  assert.equal(hits[0].memory.id, 1);
  assert.equal(searchMemories("office wifi password", pool).length, 0);
});

test("chronology: newer trusted memory ranks before older, superseded always last", () => {
  const d = (days) => new Date(Date.now() - days * 864e5).toISOString();
  const pool = [
    { id: 1, title: "Old checkout guidance", body: "checkout guidance alpha", tags: ["checkout"], confidence: 0.95, status: "active", created_at: d(80), updated_at: d(80), last_verified: d(80) },
    { id: 2, title: "Current checkout guidance", body: "checkout guidance beta", tags: ["checkout"], confidence: 0.8, status: "active", created_at: d(2), updated_at: d(2), last_verified: d(2) },
    { id: 3, title: "Superseded checkout guidance", body: "checkout guidance gamma", tags: ["checkout"], confidence: 0.99, status: "superseded", created_at: d(1), updated_at: d(1), last_verified: d(1) },
  ];
  const hits = searchMemories("checkout guidance", pool);
  assert.equal(hits[0].memory.id, 2);
  assert.equal(hits[hits.length - 1].memory.id, 3);
});

test("temporal questions are detected and evolution is chronological, history included", () => {
  assert.equal(isTemporalQuery("How has our checkout guidance changed over time?"), true);
  assert.equal(isTemporalQuery("Why do we do it this way now?"), true);
  assert.equal(isTemporalQuery("What caused the checkout latency regression?"), false);
  const d = (days) => new Date(Date.now() - days * 864e5).toISOString();
  const pool = [
    { id: 2, title: "New", body: "b", tags: ["checkout"], status: "active", created_at: d(2) },
    { id: 1, title: "Old", body: "a", tags: ["checkout"], status: "superseded", created_at: d(90) },
    { id: 3, title: "Other", body: "c", tags: ["billing"], status: "active", created_at: d(1) },
  ];
  assert.deepEqual(evolutionChain(pool, "checkout").map((m) => m.id), [1, 2]);
});

test("chat follow-ups inherit context only when referential", () => {
  assert.equal(isReferentialFollowup("And why did that happen?"), true);
  assert.equal(isReferentialFollowup("What about it?"), true);
  assert.equal(isReferentialFollowup("What is our office Wi-Fi password?"), false);
  assert.equal(isReferentialFollowup("What caused the checkout latency regression in the payments service last Tuesday?"), false);
});
