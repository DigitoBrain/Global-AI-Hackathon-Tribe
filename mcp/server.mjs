import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getSession, listSessions, createSession, createMemory, attachMemory,
  compileBrief, listMessages, addMessage, enrichMemoryKeys, enrichMemoryTitle, backfillKeys,
  findSourceMemories, listMemories, isProviderMemory, getMemory, withMeta,
  searchMemories, graphAuthority, updateMemory, verifyMemory, autoLinkMemory,
  sessionChat, groundedAsk, promoteMessage, addFeedback, addOpenQuestion,
  removeOpenQuestion, evolutionChain, guardrailCheck, evolveIndex, listVersions,
} from "../server/store.mjs";
import { seedIfEmpty } from "../server/seed.mjs";

seedIfEmpty();
backfillKeys();
const server = new McpServer({ name: "tribe", version: "0.4.0" });
const text = (t) => ({ content: [{ type: "text", text: t }] });

server.tool("list_sessions",
  "List Tribe context sessions, so you can continue one created in the web app (or anywhere else) instead of starting over.",
  {},
  async () => text(JSON.stringify(listSessions().map((s) => ({ id: s.id, title: s.title, status: s.status, updated_at: s.updated_at })), null, 2)));

server.tool("create_session",
  "Create a new Tribe context session (a persistent, grounded chat/workspace) and get its id.",
  { title: z.string() },
  async ({ title }) => {
    const s = createSession(title);
    return text(JSON.stringify({ id: s.id, title: s.title, status: s.status }));
  });

server.tool("pull_context",
  "Pull the compiled brief plus recent chat for a session, so this AI client can continue that session without the user re-explaining context. Defaults to the most recently updated session.",
  { session_id: z.number().optional().describe("Session id from list_sessions/create_session") },
  async ({ session_id }) => {
    const id = session_id || listSessions()[0]?.id;
    const s = id ? getSession(id) : null;
    if (!s) return text("No Tribe session found. Create one with create_session.");
    const payload = { brief: compileBrief(s), recent_chat: listMessages(s.id).slice(-10) };
    return text(JSON.stringify(payload, null, 2));
  });

async function storeMemory({ title, body, session_id }) {
  const { memory, redactions } = createMemory({ title, body, source: "mcp" });
  if (session_id) attachMemory(session_id, memory.id);
  await enrichMemoryKeys(memory.id);
  const fresh = title?.trim() ? memory : (await enrichMemoryTitle(memory.id)) || memory;
  return text(`Stored memory #${fresh.id}: ${fresh.title}${session_id ? ` (attached to session ${session_id})` : ""} (secret redactions: ${redactions})`);
}

server.tool("push_context",
  "Store durable knowledge as a Tribe memory - ONLY when the user explicitly wants something remembered for good ('remember this', 'store this as a memory', 'create a memory'). The memory becomes generally available to every session. If the user is instead telling or updating a session ('tell my session...', 'push this finding to my session'), use post_to_session so it lands in chat and does not silently become permanent knowledge. No kind or category is needed: Tribe indexes the content and connects it to related memories automatically. Pass session_id to also file it into that context session.",
  { title: z.string().optional(), body: z.string(), session_id: z.number().optional() },
  storeMemory);

server.tool("create_memory",
  "Create a generally-available Tribe memory - ONLY when the user explicitly asks to remember/store/create a memory. Same durable write as push_context: no kind or category is needed, Tribe indexes the content and connects it to related memories automatically. Title is optional: omit it and Tribe generates a short title from the content. For conversational updates to a session, use post_to_session instead. Pass session_id to also file it into that context session.",
  { title: z.string().optional(), body: z.string(), session_id: z.number().optional() },
  storeMemory);

server.tool("list_memories",
  "List Tribe memories so any AI client can read the user's tribal knowledge directly, newest activity first. Optionally filter by status (active, stale, deprecated, superseded).",
  { status: z.string().optional(), limit: z.number().optional() },
  async ({ status, limit }) => {
    const all = listMemories().filter((m) => !status || m.status === status);
    return text(JSON.stringify(all.slice(0, limit || all.length).map(withMeta), null, 2));
  });

server.tool("search_memories",
  "Search Tribe memories with the same ranked retrieval the web app uses (keyword, learned keys, chronology, trust, links). Returns each match with its score and a plain-language why, newest trusted knowledge first.",
  { query: z.string(), limit: z.number().optional() },
  async ({ query, limit }) => {
    const ranked = searchMemories(query, listMemories(), { graph: graphAuthority() });
    return text(JSON.stringify(ranked.slice(0, limit || 5).map((r) => ({ ...withMeta(r.memory), score: r.score, why: r.why, signals: r.signals })), null, 2));
  });

server.tool("get_memory",
  "Read one Tribe memory in full by id, including its connections and version count.",
  { memory_id: z.number() },
  async ({ memory_id }) => {
    const m = getMemory(memory_id);
    if (!m) return text(`Memory ${memory_id} not found. Use list_memories or search_memories.`);
    return text(JSON.stringify(withMeta(m), null, 2));
  });

server.tool("update_memory",
  "Update a Tribe memory's title and/or body, or retire it by setting status to deprecated or superseded. The previous text is kept in version history, secrets are scrubbed, and index keys and connections are refreshed automatically.",
  { memory_id: z.number(), title: z.string().optional(), body: z.string().optional(), status: z.enum(["active", "deprecated", "superseded"]).optional() },
  async ({ memory_id, title, body, status }) => {
    const updated = updateMemory(memory_id, { title, body, status });
    if (!updated) return text(`Memory ${memory_id} not found. Use list_memories or search_memories.`);
    autoLinkMemory(memory_id);
    await enrichMemoryKeys(memory_id);
    const fresh = getMemory(memory_id);
    return text(`Updated memory #${fresh.id}: ${fresh.title} (status: ${fresh.status})`);
  });

server.tool("memory_versions",
  "Read a memory's version history: the previous titles and bodies kept each time it was edited, newest first.",
  { memory_id: z.number() },
  async ({ memory_id }) => {
    if (!getMemory(memory_id)) return text(`Memory ${memory_id} not found. Use list_memories or search_memories.`);
    return text(JSON.stringify(listVersions(memory_id), null, 2));
  });

server.tool("verify_memory",
  "Mark a Tribe memory as verified just now, refreshing its chronology/trust standing so current answers can rely on it.",
  { memory_id: z.number() },
  async ({ memory_id }) => {
    if (!getMemory(memory_id)) return text(`Memory ${memory_id} not found. Use list_memories or search_memories.`);
    const m = verifyMemory(memory_id);
    return text(`Verified memory #${m.id}: ${m.title} (last_verified: ${m.last_verified})`);
  });

server.tool("find_source",
  "Find who or what can provide data or a capability, from ordinary Tribe memories whose content records that knowledge. Use when stored answers don't cover a question and you need the right person, system, tool, or service to ask. With no query, lists memories that record a provider.",
  { query: z.string().optional() },
  async ({ query }) => text(JSON.stringify(
    (query ? findSourceMemories(query) : listMemories().filter((m) => m.status === "active" && isProviderMemory(m))),
    null, 2)));

server.tool("append_chat",
  "Silently append a message to a context session's chat history WITHOUT any reply (e.g. record what was decided in the IDE), so the same conversation continues in the web app. Use post_to_session instead when the session should respond to the post.",
  { session_id: z.number(), role: z.enum(["user", "assistant"]).optional(), content: z.string() },
  async ({ session_id, role, content }) => {
    if (!getSession(session_id)) return text(`Session ${session_id} not found. Use list_sessions or create_session.`);
    const m = addMessage(session_id, role || "assistant", content);
    return text(`Recorded message #${m.id} in session ${session_id}.`);
  });

server.tool("get_session",
  "Read one context session in full: its open questions and the memories filed into it, with trust and connection metadata.",
  { session_id: z.number() },
  async ({ session_id }) => {
    const s = getSession(session_id);
    if (!s) return text(`Session ${session_id} not found. Use list_sessions or create_session.`);
    return text(JSON.stringify({ ...s, memories: s.memories.map(withMeta) }, null, 2));
  });

server.tool("list_messages",
  "Read a context session's full chat history in order, so any AI client can see exactly what was discussed there.",
  { session_id: z.number() },
  async ({ session_id }) => {
    if (!getSession(session_id)) return text(`Session ${session_id} not found. Use list_sessions or create_session.`);
    return text(JSON.stringify(listMessages(session_id), null, 2));
  });

async function chatInSession({ message, session_id }) {
  const id = session_id || listSessions()[0]?.id;
  if (!id || !getSession(id)) return text("No Tribe session found. Create one with create_session.");
  const out = await sessionChat(id, message);
  return text(JSON.stringify(out, null, 2));
}

server.tool("chat",
  "Chat inside a Tribe context session, exactly like the web app: the message is stored, warning memories block dangerous actions in-chat, temporal questions get evolution answers, and answers are grounded in your memories (all sessions share one memory pool; memories filed in this session rank higher) with citations or an explicit I don't know. Defaults to the most recently updated session.",
  { message: z.string(), session_id: z.number().optional() },
  chatInSession);

server.tool("post_to_session",
  "Post a message, update, or finding INTO a context session's chat and get the session's grounded reply - use this when the user is telling or updating a session ('tell my test session...', 'push this finding to my session', 'let that session know...'). The session decides what the post needs (retrieval, a warning check, or a simple reply). Nothing becomes a permanent memory unless the user later saves it; for durable knowledge the user explicitly wants remembered, use create_memory instead. Defaults to the most recently updated session.",
  { message: z.string(), session_id: z.number().optional() },
  chatInSession);

server.tool("ask",
  "Ask a grounded question across all Tribe memories without adding anything to chat history. Pass session_id only to boost memories filed in that session. Answers cite memories or say I don't know; temporal questions explain how knowledge evolved.",
  { question: z.string(), session_id: z.number().optional() },
  async ({ question, session_id }) => text(JSON.stringify(await groundedAsk(question, session_id || null), null, 2)));

server.tool("promote_message",
  "Save one message from a session's chat as a memory (the web app's Save as memory), so only that chosen message becomes generally available tribal knowledge. The new memory is derived-from linked to the memories the chat cited.",
  { session_id: z.number(), message_id: z.number() },
  async ({ session_id, message_id }) => {
    const out = promoteMessage(session_id, message_id);
    if (!out) return text(`Message ${message_id} not found in session ${session_id}. Use list_messages to find message ids.`);
    if (!out.already) { await enrichMemoryKeys(out.memory.id); await enrichMemoryTitle(out.memory.id); }
    return text(out.already
      ? `Message ${message_id} is already memory #${out.memory.id}: ${out.memory.title}`
      : `Saved message ${message_id} as memory #${out.memory.id}: ${out.memory.title}`);
  });

server.tool("feedback_memory",
  "Record feedback on a memory (signal up or down), adjusting its trust standing for future ranking, exactly like the feedback buttons in the web app.",
  { memory_id: z.number(), signal: z.enum(["up", "down"]) },
  async ({ memory_id, signal }) => {
    const m = addFeedback(memory_id, signal);
    if (!m) return text(`Memory ${memory_id} not found. Use list_memories or search_memories.`);
    return text(`Feedback '${signal}' recorded on memory #${m.id}: ${m.title} (confidence now ${m.confidence})`);
  });

server.tool("add_open_question",
  "Add an open question to a context session, so any client working in that session can see what is still unresolved.",
  { session_id: z.number(), question: z.string() },
  async ({ session_id, question }) => {
    const s = addOpenQuestion(session_id, question);
    if (!s) return text(`Session ${session_id} not found, or the question was empty. Use list_sessions.`);
    return text(`Open question added to session ${session_id}. Open questions now: ${s.open_questions.join(" | ")}`);
  });

server.tool("close_open_question",
  "Mark an open question in a context session as resolved, removing it from the session's open list. Identify it by its exact question text, or by its zero-based index from get_session/pull_context.",
  { session_id: z.number(), question: z.string().optional(), index: z.number().optional() },
  async ({ session_id, question, index }) => {
    const out = removeOpenQuestion(session_id, { question, index });
    if (!out) return text(`Open question not found in session ${session_id}. Use get_session to see the open questions.`);
    return text(`Resolved open question in session ${session_id}: "${out.removed}". Still open: ${out.session.open_questions.length ? out.session.open_questions.join(" | ") : "(none)"}`);
  });

server.tool("evolution",
  "Show how knowledge about a topic evolved over time: every memory mentioning the topic, oldest to current, including retired ones kept for history.",
  { topic: z.string() },
  async ({ topic }) => text(JSON.stringify(
    { topic, chain: evolutionChain(listMemories().map(withMeta), topic) }, null, 2)));

server.tool("guardrail_check",
  "Check a planned action against Tribe's warning memories before doing it. Returns blocked with the warning when a memory prohibits or warns against the action.",
  { action: z.string() },
  async ({ action }) => text(JSON.stringify(guardrailCheck(action), null, 2)));

server.tool("evolve_index",
  "Help Tribe's index learn from a question that failed to find its memory: proposes new index keys for a memory and keeps them only if validation shows the question now retrieves it without breaking an existing lookup. Optionally scoped to a session.",
  { question: z.string(), session_id: z.number().optional() },
  async ({ question, session_id }) => text(JSON.stringify(await evolveIndex(question, session_id || null), null, 2)));

await server.connect(new StdioServerTransport());
