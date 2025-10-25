#!/usr/bin/env bun
import { runDev } from "./commands/dev";
import { runBuild } from "./commands/build";
import { runStart } from "./commands/start";

export async function main(): Promise<void> {
  const [command = "dev", ...rest] = process.argv.slice(2);

  switch (command) {
    case "dev":
      await runDev(rest);
      break;
    case "build":
      await runBuild();
      break;
    case "start":
      await runStart();
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`Unknown command "${command}". Try "the-stack help".`);
      process.exitCode = 1;
  }
}

function printHelp(): void {
  console.log(`the-stack <command>

Commands:
  dev      Start the development server
  build    Build the production server bundle
  start    Run the production server
  help     Show this message
`);
}

if (import.meta.main) {
  await main();
}
