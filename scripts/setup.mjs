// `npm run setup` (after `npm install`): gets a fresh clone ready to run.
//   1. Creates each missing .env from its .env.example. An existing .env is never changed.
//   2. Starts Postgres with Docker Compose and waits until it's healthy.
//   3. Applies the database migrations.
//   4. Loads the demo data. This DELETES all data in the development database first, so
//      running setup again resets the demo.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));

function step(title, command, hint) {
  console.log(`\n> ${title}: ${command}`);
  try {
    execSync(command, { stdio: "inherit" });
  } catch {
    console.error(`\nSetup stopped: "${command}" failed. ${hint}`);
    process.exit(1);
  }
}

console.log("> Environment files");
for (const env of [".env", "apps/api/.env", "apps/web/.env"]) {
  if (existsSync(env)) {
    console.log(`  ${env} already exists, left as it is`);
  } else {
    copyFileSync(`${env}.example`, env);
    console.log(`  created ${env} from ${env}.example`);
  }
}

step(
  "Start Postgres",
  "docker compose up -d --wait",
  "Is Docker running? If port 5432 is taken, see Prerequisites in README.md.",
);
step(
  "Apply migrations",
  "npm run db:deploy",
  "Check DATABASE_URL in apps/api/.env.",
);
step(
  "Load the demo data, deleting everything in the development database",
  "npm run db:seed",
  "Check DATABASE_URL in apps/api/.env.",
);

console.log(
  "\nReady. Start the app with `npm run dev`, then open http://localhost:3000" +
    "\nand log in as teacher.rana or s10a001 (password Quizora@2026).",
);
