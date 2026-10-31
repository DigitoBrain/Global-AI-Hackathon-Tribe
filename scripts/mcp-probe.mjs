// Verifies the MCP context bus incl. session portability:
// list -> create -> push into it -> pull it back -> append chat.
// Run: node scripts/mcp-probe.mjs   (reset the demo afterwards from the web UI)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: process.execPath, args: ["mcp/server.mjs"] });
const client = new Client({ name: "tribe-probe", version: "0.2.0" });
await client.connect(transport);
const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));
const listed = await client.callTool({ name: "list_sessions", arguments: {} });
console.log("list_sessions:", listed.content[0].text.slice(0, 200));
const created = await client.callTool({ name: "create_session", arguments: { title: "Probe session from IDE" } });
const sid = JSON.parse(created.content[0].text).id;
console.log("create_session id:", sid);
const pushed = await client.callTool({
  name: "push_context",
  arguments: { title: "MCP probe finding", body: "Second AI client resumed work in a session created from the IDE.", type: "note", session_id: sid },
});
console.log("push_context:", pushed.content[0].text);
const appended = await client.callTool({ name: "append_chat", arguments: { session_id: sid, content: "IDE client continued this session." } });
console.log("append_chat:", appended.content[0].text);
const pulled = await client.callTool({ name: "pull_context", arguments: { session_id: sid } });
console.log("pull_context (same session continued):", pulled.content[0].text.slice(0, 400));
await client.close();
process.exit(0);
