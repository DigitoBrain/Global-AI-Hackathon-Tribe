import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getSession, listSessions, createSession, createMemory, attachMemory,
  compileBrief, listMessages, addMessage,
} from "../server/store.mjs";
import { seedIfEmpty } from "../server/seed.mjs";

seedIfEmpty();
const server = new McpServer({ name: "tribe", version: "0.2.0" });
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

server.tool("push_context",
  "Push a finding into Tribe as a memory. Pass session_id to attach it to that context session so it grounds future answers there.",
  { title: z.string(), body: z.string(), type: z.string().optional(), session_id: z.number().optional() },
  async ({ title, body, type, session_id }) => {
    const { memory, redactions } = createMemory({ title, body, type: type || "note", source: "mcp" });
    if (session_id) attachMemory(session_id, memory.id);
    return text(`Stored memory #${memory.id}: ${memory.title}${session_id ? ` (attached to session ${session_id})` : ""} (secret redactions: ${redactions})`);
  });

server.tool("append_chat",
  "Append a message to a context session's chat history (e.g. record what was decided in the IDE), so the same conversation continues in the web app.",
  { session_id: z.number(), role: z.enum(["user", "assistant"]).optional(), content: z.string() },
  async ({ session_id, role, content }) => {
    if (!getSession(session_id)) return text(`Session ${session_id} not found. Use list_sessions or create_session.`);
    const m = addMessage(session_id, role || "assistant", content);
    return text(`Recorded message #${m.id} in session ${session_id}.`);
  });

await server.connect(new StdioServerTransport());
