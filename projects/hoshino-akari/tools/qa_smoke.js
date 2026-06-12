/* tools/qa_smoke.js —— 校稿後可玩性 smoke test（唯讀，不改任何資料）
   1) 以 vm 載入 meta/chapters/day1-7/endings（與 validate_story 同法）
   2) 走訪 Day1→Day7 每個節點（含 choice 全分支 reaction、gate then/else），斷言每個 line.text 為非空字串
   3) 驗證四結局 judge() 皆可達（warm/quiet/bitter/hidden）
   不碰 engine.js、不改分數/flag/gate 邏輯，只讀資料。 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DATA = path.join(__dirname, "..", "play", "data");
const files = ["meta.js","chapters.js","day1.js","day2.js","day3.js","day4.js","day5.js","day6.js","day7.js","endings.js"];

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of files) {
  const code = fs.readFileSync(path.join(DATA, f), "utf8");
  vm.runInContext(code, sandbox, { filename: f });
}
const H = sandbox.window.HOSHINO;

let lineCount = 0, choiceCount = 0, gateCount = 0, problems = [];

function walk(nodes, where) {
  if (!Array.isArray(nodes)) return;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n || typeof n !== "object") continue;
    if (n.type === "line") {
      lineCount++;
      if (typeof n.text !== "string") problems.push(`${where}[${i}] line.text 非字串`);
      else if (n.who !== "narration" && n.text.trim() === "") {
        // narration 容許空字串（純 ui:sns 載體），對白不該空
        problems.push(`${where}[${i}] ${n.who} 對白為空`);
      }
    } else if (n.type === "choice") {
      choiceCount++;
      if (!Array.isArray(n.options) || n.options.length < 2)
        problems.push(`${where}[${i}] choice 選項不足`);
      (n.options || []).forEach((o, j) => {
        if (typeof o.label !== "string" || !o.label.trim())
          problems.push(`${where}[${i}].opt${j} label 缺失`);
        walk(o.reaction, `${where}[${i}].opt${j}.reaction`);
      });
    } else if (n.type === "gate") {
      gateCount++;
      walk(n.then, `${where}[${i}].then`);
      walk(n.else, `${where}[${i}].else`);
    }
  }
}

// Day1→Day7 全走訪（含 chapter intro/outro）
for (let d = 1; d <= 7; d++) {
  if (H.chapters[d]) { walk(H.chapters[d].intro, `ch${d}.intro`); walk(H.chapters[d].outro, `ch${d}.outro`); }
  if (!Array.isArray(H.days[d])) { problems.push(`Day${d} 資料缺失`); continue; }
  walk(H.days[d], `Day${d}`);
}
// 四結局走訪
for (const k of Object.keys(H.endings)) walk(H.endings[k], `ending:${k}`);

// 四結局 judge 可達性（用先前驗證過的分數/flag 組合）
const probes = [
  { tone: "warm_true",    s:{affection:6,distance:1,awareness:2,regret:0}, f:{} },
  { tone: "quiet_normal", s:{affection:2,distance:1,awareness:0,regret:0}, f:{} },
  { tone: "bitter",       s:{affection:2,distance:4,awareness:1,regret:3}, f:{} },
  { tone: "hidden_pov",   s:{affection:6,distance:1,awareness:3,regret:0}, f:{sns_post_seen:true, almost_confession_flag:true} },
];
const judgeResults = probes.map(p => {
  const got = H.meta.judge(p.s, p.f);
  const ok = got === p.tone;
  if (!ok) problems.push(`judge 不可達: 期望 ${p.tone} 得到 ${got}`);
  return `${p.tone}: ${ok ? "OK" : "FAIL("+got+")"}`;
});

console.log("=== 走訪統計 ===");
console.log(`line 節點: ${lineCount} / choice: ${choiceCount} / gate: ${gateCount}`);
console.log("=== 四結局 judge 可達性 ===");
judgeResults.forEach(r => console.log("  " + r));
console.log("=== 問題 ===");
if (problems.length === 0) { console.log("  無。SMOKE PASS"); process.exit(0); }
else { problems.forEach(p => console.log("  [X] " + p)); console.log(`SMOKE FAIL (${problems.length})`); process.exit(1); }
