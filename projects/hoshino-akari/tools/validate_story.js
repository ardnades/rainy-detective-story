#!/usr/bin/env node
/* validate_story.js —— 《星野灯線》Story Schema Validator v0（獨立、唯讀，CLI）
 *
 * 目的：把 runDay() 的資料契約轉成可檢查規則，驗證 play/data 的故事資料是否合法。
 * 規則本體在 story_schema.js（與瀏覽器 inspector 共用，避免規則分裂）；本檔只負責
 * 「以 Node vm/fs 載入瀏覽器端 data 檔 → 呼叫 validateGame → 印報告 → 設 exit code」。
 *
 * 嚴格限制（本工具遵守）：
 *   - 只讀不寫：絕不修改 engine.js / runtime / meta / chapters / day / assets / endings / art。
 *   - 不接 Comfy、不做 UI、不做 multi-game、不做 payment。
 *
 * 執行：
 *   node projects/hoshino-akari/tools/validate_story.js            # 驗證本專案 play/
 *   node projects/hoshino-akari/tools/validate_story.js <play目錄>  # 驗證其他候選輸出（仍唯讀）
 * 結束碼：有 error → 1；只有 warning（或全通過）→ 0。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const StorySchema = require("./story_schema.js");

// 預設驗證本專案 play/；可選傳入其他 play 目錄（供未來 editor 驗證候選輸出，仍唯讀）
const PLAY = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, "..", "play");
const DATA = path.join(PLAY, "data");

// data 檔載入順序（與 index.html 一致；meta 先建立 window.HOSHINO 容器）
const LOAD_ORDER = [
  path.join(DATA, "meta.js"),
  path.join(DATA, "assets.js"),
  path.join(DATA, "chapters.js"),
  path.join(DATA, "day1.js"),
  path.join(DATA, "day2.js"),
  path.join(DATA, "day3.js"),
  path.join(DATA, "day4.js"),
  path.join(DATA, "day5.js"),
  path.join(DATA, "day6.js"),
  path.join(DATA, "day7.js"),
  path.join(DATA, "endings.js"),
  path.join(PLAY, "art.js"),
];

const rel = (p) => path.relative(path.join(__dirname, ".."), p).replace(/\\/g, "/");

// 以 vm sandbox 載入 data 檔（它們只做 window.HOSHINO.* / window.ART 賦值）
function loadGame() {
  const loadIssues = [];
  const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sandbox);
  for (const file of LOAD_ORDER) {
    if (!fs.existsSync(file)) { loadIssues.push({ level: "ERROR", file: rel(file), loc: "-", msg: "找不到檔案，無法載入" }); continue; }
    try {
      vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
    } catch (e) {
      loadIssues.push({ level: "ERROR", file: rel(file), loc: "-", msg: "載入時拋例外：" + e.message });
    }
  }
  return { window: sandbox.window, loadIssues };
}

function main() {
  const { window: W, loadIssues } = loadGame();
  const result = StorySchema.validateGame(W.HOSHINO, W.ART);
  const issues = loadIssues.concat(result.issues);

  const errors = issues.filter((i) => i.level === "ERROR");
  const warns = issues.filter((i) => i.level === "WARN");
  const out = [];
  out.push("Story Schema Validation Report");
  out.push("==============================");
  out.push(`- Errors:   ${errors.length}`);
  out.push(`- Warnings: ${warns.length}`);
  out.push("- Note: 深層 unreachable / always-true-false 可達性分析未做（TODO，見 spec/phase1-data-contract.md D.7）。");
  for (const info of result.infos) out.push(`- INFO: ${info}`);
  out.push("");
  if (issues.length === 0) {
    out.push("PASS: story schema is valid.");
  } else {
    const order = (lvl) => (lvl === "ERROR" ? 0 : 1);
    issues.sort((a, b) => a.file.localeCompare(b.file) || order(a.level) - order(b.level));
    for (const it of issues) out.push(`[${it.level}] ${it.file} ${it.loc} : ${it.msg}`);
    out.push("");
    out.push(errors.length ? `FAIL: ${errors.length} error(s), ${warns.length} warning(s).` : `PASS (with warnings): 0 error(s), ${warns.length} warning(s).`);
  }
  process.stdout.write(out.join("\n") + "\n");
  process.exit(errors.length ? 1 : 0);
}

main();
