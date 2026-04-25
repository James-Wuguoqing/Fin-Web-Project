#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const projectRoot = process.cwd();
const reportJson = process.argv[2] || join(projectRoot, "reports", "visible-smoke", "latest", "report.json");
const builder = join(projectRoot, "scripts", "build-test-report-docx.py");
const python = findPython();

if (!python) {
  console.error("[FAIL] Could not find Python. Set TEST_PYTHON_PATH to a Python executable with python-docx installed.");
  process.exit(1);
}

const result = spawnSync(python.command, [...python.args, builder, reportJson], {
  cwd: projectRoot,
  stdio: "inherit"
});

process.exit(result.status ?? 1);

function findPython() {
  const candidates = [
    process.env.TEST_PYTHON_PATH,
    process.env.PYTHON,
    process.env.USERPROFILE
      ? join(process.env.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe")
      : null,
    "python",
    "python3"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes("\\") || candidate.includes("/") || candidate.endsWith(".exe")) {
      if (existsSync(candidate)) {
        return { command: candidate, args: [] };
      }
      continue;
    }

    const probe = spawnSync(candidate, ["-c", "import docx"], { stdio: "ignore" });
    if (probe.status === 0) {
      return { command: candidate, args: [] };
    }
  }

  return null;
}
