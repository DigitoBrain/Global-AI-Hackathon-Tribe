// Verifies web-app parity over MCP: session portability, direct memory read/write,
// in-session chat, grounded ask, promote/feedback/verify, evolution and guardrail checks.
// Run: node scripts/mcp-probe.mjs   (reset the demo afterwards from the web UI)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: process.execPath, args: ["mcp/server.mjs"] });
const client = new Client({ name: "tribe-probe", version: "0.2.0" });
await client.connect(transport);
const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));
const expected = ["list_sessions", "create_session", "get_session", "pull_context", "push_context", "append_chat", "list_messages", "chat", "post_to_session", "ask", "promote_message", "add_open_question", "close_open_question", "create_memory", "list_memories", "search_memories", "get_memory", "update_memory", "verify_memory", "feedback_memory", "memory_versions", "find_source", "evolution", "guardrail_check", "evolve_index"];
const missing = expected.filter((n) => !tools.tools.some((t) => t.name === n));
if (missing.length) { console.error("MISSING TOOLS:", missing.join(", ")); process.exit(1); }
console.log("parity toolset: all", expected.length, "expected tools present");
const assert = (cond, label) => { if (!cond) { console.error("ASSERT FAILED:", label); process.exit(1); } console.log("ok -", label); };
const listed = await client.callTool({ name: "list_sessions", arguments: {} });
console.log("list_sessions:", listed.content[0].text.slice(0, 200));
const created = await client.callTool({ name: "create_session", arguments: { title: "Probe session from IDE" } });
const sid = JSON.parse(created.content[0].text).id;
console.log("create_session id:", sid);
const pushed = await client.callTool({
  name: "push_context",
  arguments: { title: "MCP probe finding", body: "Second AI client resumed work in a session created from the IDE.", session_id: sid },
});
console.log("push_context:", pushed.content[0].text);
const appended = await client.callTool({ name: "append_chat", arguments: { session_id: sid, content: "IDE client continued this session." } });
console.log("append_chat:", appended.content[0].text);
const source = await client.callTool({ name: "find_source", arguments: { query: "live checkout pool saturation metrics" } });
console.log("find_source:", source.content[0].text.slice(0, 200));
const pulled = await client.callTool({ name: "pull_context", arguments: { session_id: sid } });
console.log("pull_context (same session continued):", pulled.content[0].text.slice(0, 400));
const createdMem = await client.callTool({
  name: "create_memory",
  arguments: { title: "MCP memory CRUD probe", body: "Probe memory for direct MCP read and write checks on checkout pool metrics.", session_id: sid },
});
console.log("create_memory:", createdMem.content[0].text);
const memId = Number(createdMem.content[0].text.match(/#(\d+)/)[1]);
const listedMems = await client.callTool({ name: "list_memories", arguments: { limit: 3 } });
console.log("list_memories (first titles):", JSON.parse(listedMems.content[0].text).map((m) => m.title).join(" | ").slice(0, 200));
const searched = await client.callTool({ name: "search_memories", arguments: { query: "checkout pool metrics", limit: 3 } });
console.log("search_memories:", searched.content[0].text.slice(0, 300));
const got = await client.callTool({ name: "get_memory", arguments: { memory_id: memId } });
console.log("get_memory title:", JSON.parse(got.content[0].text).title);
const updated = await client.callTool({
  name: "update_memory",
  arguments: { memory_id: memId, body: "Probe memory updated via MCP: checkout pool metrics readable and writable from any AI client." },
});
console.log("update_memory:", updated.content[0].text);
const versions = await client.callTool({ name: "memory_versions", arguments: { memory_id: memId } });
assert(JSON.parse(versions.content[0].text).length >= 1, "memory_versions shows the pre-edit text after update");
const verified = await client.callTool({ name: "verify_memory", arguments: { memory_id: memId } });
console.log("verify_memory:", verified.content[0].text);
const feedback = await client.callTool({ name: "feedback_memory", arguments: { memory_id: memId, signal: "up" } });
console.log("feedback_memory:", feedback.content[0].text);
const asked = await client.callTool({ name: "ask", arguments: { question: "What caused the checkout latency regression?" } });
const askOut = JSON.parse(asked.content[0].text);
assert(askOut.dontKnow === false && askOut.citations?.length > 0, "ask answers with citations");
const sessionDetail = await client.callTool({ name: "get_session", arguments: { session_id: sid } });
assert(JSON.parse(sessionDetail.content[0].text).memories?.length >= 2, "get_session returns filed memories");
const chatted = await client.callTool({ name: "chat", arguments: { session_id: sid, message: "What do we know about checkout pool metrics?" } });
const chatOut = JSON.parse(chatted.content[0].text);
assert(Boolean(chatOut.message?.content), "chat stores and returns a grounded reply");
const memCountBefore = JSON.parse((await client.callTool({ name: "list_memories", arguments: {} })).content[0].text).length;
const posted = await client.callTool({ name: "post_to_session", arguments: { session_id: sid, message: "Queue-time alert fired twice today." } });
assert(Boolean(JSON.parse(posted.content[0].text).message?.content), "post_to_session gets a session reply");
const memCountAfter = JSON.parse((await client.callTool({ name: "list_memories", arguments: {} })).content[0].text).length;
assert(memCountAfter === memCountBefore, "post_to_session does not create a memory");
const msgs = await client.callTool({ name: "list_messages", arguments: { session_id: sid } });
const msgList = JSON.parse(msgs.content[0].text);
assert(msgList.some((m) => m.role === "assistant"), "list_messages shows the chat replies");
const assistantMsg = [...msgList].reverse().find((m) => m.role === "assistant");
const promoted = await client.callTool({ name: "promote_message", arguments: { session_id: sid, message_id: assistantMsg.id } });
console.log("promote_message:", promoted.content[0].text);
assert(/Saved message|already memory/.test(promoted.content[0].text), "promote_message saves a chat message as memory");
const openQ = await client.callTool({ name: "add_open_question", arguments: { session_id: sid, question: "Probe open question from MCP?" } });
assert(/Open question added/.test(openQ.content[0].text), "add_open_question records the question");
const closedQ = await client.callTool({ name: "close_open_question", arguments: { session_id: sid, question: "Probe open question from MCP?" } });
console.log("close_open_question:", closedQ.content[0].text);
assert(/Resolved open question/.test(closedQ.content[0].text), "close_open_question resolves the question");
const afterClose = await client.callTool({ name: "get_session", arguments: { session_id: sid } });
assert(!JSON.parse(afterClose.content[0].text).open_questions.includes("Probe open question from MCP?"), "resolved question is gone from the session");
const evo = await client.callTool({ name: "evolution", arguments: { topic: "checkout" } });
assert(JSON.parse(evo.content[0].text).chain?.length > 0, "evolution returns the topic chain");
const guard = await client.callTool({ name: "guardrail_check", arguments: { action: "kubectl delete pods in prod to fix checkout" } });
console.log("guardrail_check blocked:", JSON.parse(guard.content[0].text).blocked);
const evolved = await client.callTool({ name: "evolve_index", arguments: { question: "why is checkout slow", session_id: sid } });
assert(typeof JSON.parse(evolved.content[0].text).evolved === "boolean", "evolve_index reports a validated verdict");
console.log("ALL MCP PARITY CHECKS PASSED");
await client.close();
process.exit(0);
