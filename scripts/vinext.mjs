import { spawn } from "node:child_process";

const mode = process.argv[2] ?? "dev";
process.env.WRANGLER_LOG_PATH ??= ".wrangler/wrangler.log";

const child = spawn(process.execPath, ["node_modules/vinext/dist/cli.js", mode], {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 1));
