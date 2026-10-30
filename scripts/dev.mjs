import { spawn } from "node:child_process";

const procs = [
  spawn(process.execPath, ["--watch", "server/index.mjs"], { stdio: "inherit" }),
  spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "--port", "5173"], { stdio: "inherit", shell: process.platform === "win32" }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
procs.forEach((p) => p.on("exit", stop));
