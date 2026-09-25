// `npm run dev`: makes sure Postgres is running, then starts the API
// (http://localhost:3001) and the web app (http://localhost:3000) together in this terminal,
// both reloading on changes. Ctrl+C stops both. Postgres keeps running; stop it with
// `docker compose stop`.
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));

// npm sets npm_execpath (its own entry point) for the scripts it runs.
const npm = process.env.npm_execpath;
if (!npm) {
  console.error("Start this with `npm run dev`.");
  process.exit(1);
}

try {
  execSync("docker compose up -d --wait", { stdio: "inherit" });
} catch {
  console.error("\nCouldn't start Postgres. Is Docker running?");
  process.exit(1);
}

// Each app runs through npm's entry point with this Node, instead of spawning `npm` through
// a shell. The web app's port is fixed: if 3000 were taken, Next.js would otherwise move to
// 3001 and take the API's port, since the API starts a few seconds later.
const apps = [
  { name: "API", args: ["run", "start:dev", "--workspace", "apps/api"] },
  {
    name: "web app",
    args: ["run", "dev", "--workspace", "apps/web", "--", "--port", "3000"],
  },
];
for (const app of apps) {
  const child = spawn(process.execPath, [npm, ...app.args], {
    stdio: "inherit",
  });
  // The other app keeps running, so say so rather than let it scroll past.
  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(
        `\nThe ${app.name} stopped (exit code ${code}). Press Ctrl+C to stop the rest.`,
      );
    }
  });
}
