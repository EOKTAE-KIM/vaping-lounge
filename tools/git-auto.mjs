#!/usr/bin/env node
import { execSync } from "node:child_process";

function run(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

function runInherit(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

const raw = process.argv.slice(2).join(" ").trim();
const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
const message = raw || `chore: auto sync ${timestamp}`;

const status = run("git status --porcelain");
if (!status) {
  console.log("[git:auto] 변경사항이 없어 스킵합니다.");
  process.exit(0);
}

runInherit("git add .");
runInherit(`git commit -m "${message.replace(/"/g, '\\"')}"`);
runInherit("git push");
console.log("[git:auto] add/commit/push 완료");

