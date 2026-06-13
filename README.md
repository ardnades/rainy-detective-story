# 星野灯 (Hoshino Akari)

A 7-night **idol-romance AVG** (static web game, zero backend at runtime) plus a local **Anima / ComfyUI character-art pipeline**.

> 她是全國的偶像；對她來說，「自己走進便利店買一個布丁」才是奢侈品。
> 男主角的價值，是他從頭到尾什麼都沒對她做。

- Player runtime: pure static HTML/JS/CSS — no API keys, no server, progress in `localStorage`.
- Production tools (art generation, validators, inspector) may use local AI / ComfyUI; they never ship to players.
- Personal, **non-commercial** project (see [LICENSE](LICENSE)).

## Repository layout

```
ai-interactive-story-factory/            (local dir name; GitHub repo = hoshino-akari)
├── projects/hoshino-akari/              ← the game
│   ├── brief/        canon-log (事實台帳) + voice/ (角色語氣表)
│   ├── episodes/     day1–7.md          劇本源稿 (source scripts)
│   ├── spec/         資料契約 + per-day specs
│   ├── play/         RUNTIME — engine.js, data/*.js, art.js, index.html, assets/
│   └── tools/        validate_story.js, story_inspector.*, qa_smoke.js, story_schema.js
├── art_tool/                            ← Python ComfyUI/Anima art backend (+ tests/)
├── scripts/          check-text.ps1     繁中文字規範檢查
├── templates/        character-sheet.md 角色語氣表範本
└── archive/                             ← retired, reference only (see below)
```

Note: the **canonical performance text is `play/data/*.js`** (already iceberg-rewritten); `episodes/*.md` are kept as source drafts and are no longer word-for-word identical.

## Quick start

```bash
# Play the game (serve the play/ dir, then open it in a browser)
npm run serve            # → http://localhost:3000  (or: python -m http.server -d projects/hoshino-akari/play)

# Validate the story data contract
npm run validate         # → node projects/hoshino-akari/tools/validate_story.js

# Story inspector (read-only data browser): serve play/ then open
#   projects/hoshino-akari/tools/story_inspector.html

# Traditional-Chinese text check (punctuation / AI-phrasing blacklist)
pwsh scripts/check-text.ps1 projects/hoshino-akari/episodes/day1.md

# Art tool (local ComfyUI + Anima) — see art_tool/README.md
python -m pytest art_tool/tests        # backend tests
pwsh art_tool/start_art_tool.ps1       # launch the art studio server
```

## Character-art flow

`art_tool` generates candidates → adopts approved images into `public/assets/characters/hoshino_akari/` (state dirs `approved/ bustup_approved/ … ` + `manifest.json`). Approved busts are then copied into `projects/hoshino-akari/play/assets/characters/` so the runtime's paths stay self-consistent relative to `play/index.html`. The game falls back to inline SVG (`art.js`) for any missing asset, so it never breaks on absent art.

Model: **Anima Base v1.0** (a Cosmos-Predict2-2B DiT, *not* SDXL/Qwen-Image) — non-commercial license. See `art_tool/` docs and the project art notes.

## Archive

`archive/` holds retired work, kept for reference only — **do not wire into the Akari runtime**:

- `archive/yuye-detective/` — the abandoned 《雨夜偵探社：第七封情書》 detective AVG (story, player frontend, ops docs, old writing-constitution).
- `archive/story-factory/prompts/` — the generic 20-prompt SNS story-factory.
