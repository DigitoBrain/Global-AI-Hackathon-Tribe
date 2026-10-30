// Verifies the MCP context bus: pulls the compiled brief, pushes a finding.
// Run: node scripts/mcp-probe.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: process.execPath, args: ["mcp/server.mjs"] });
const client = new Client({ name: "tribe-probe", version: "0.1.0" });
await client.connect(transport);
const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));
const pulled = await client.callTool({ name: "pull_context", arguments: {} });
console.log("pull_context:", pulled.content[0].text.slice(0, 300));
const pushed = await client.callTool({
  name: "push_context",
  arguments: { title: "MCP probe finding", body: "Second AI client resumed the checkout session from the compiled brief without re-explanation.", type: "note" },
});
console.log("push_context:", pushed.content[0].text);
await client.close();
process.exit(0);
