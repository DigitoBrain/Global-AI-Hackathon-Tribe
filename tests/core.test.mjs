import test from "node:test";
import assert from "node:assert/strict";
import { scrubSecrets } from "../server/scrub.mjs";
import { searchMemories } from "../server/store.mjs";

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
