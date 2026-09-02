import { spawn } from "node:child_process";

const tsc = spawn(
  process.platform === "win32" ? "tsc.cmd" : "tsc",
  ["--watch", "-p", "tsconfig.json"],
  {
    stdio: "inherit",
    env: process.env,
  },
);
const server = spawn(process.execPath, ["--watch", "dist/main.js"], {
  stdio: "inherit",
  env: process.env,
});

let shuttingDown = false;

function stop(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  tsc.kill(signal);
  server.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

server.on("exit", (code) => {
  if (!shuttingDown) {
    stop();
    process.exit(code ?? 1);
  }
});

tsc.on("exit", (code) => {
  if (!shuttingDown && code !== 0) {
    stop();
    process.exit(code ?? 1);
  }
});
