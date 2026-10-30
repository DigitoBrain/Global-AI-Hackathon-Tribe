import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getSession, listSessions, createMemory, compileBrief } from "../server/store.mjs";
import { seedIfEmpty } from "../server/seed.mjs";

seedIfEmpty();
const server = new McpServer({ name: "tribe", version: "0.1.0" });

server.tool("pull_context",
  "Pull the compiled Tribe brief for a session so another AI tool can resume without re-explanation.",
  { session_id: z.number().optional().describe("Session id; defaults to the most recent session") },
  async ({ session_id }) => {
    const id = session_id || listSessions()[0]?.id;
    const s = id ? getSession(id) : null;
    if (!s) return { content: [{ type: "text", text: "No Tribe session found." }] };
    return { content: [{ type: "text", text: JSON.stringify(compileBrief(s), null, 2) }] };
  });

server.tool("push_context",
  "Push a finding into Tribe as a memory, optionally attached to the demo session flow.",
  { title: z.string(), body: z.string(), type: z.string().optional() },
  async ({ title, body, type }) => {
    const { memory, redactions } = createMemory({ title, body, type: type || "note", source: "mcp" });
    return { content: [{ type: "text", text: `Stored memory #${memory.id}: ${memory.title} (secret redactions: ${redactions})` }] };
  });

await server.connect(new StdioServerTransport());
