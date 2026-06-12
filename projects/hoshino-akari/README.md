# 星野灯線 —— 7 天戀愛 AVG（子專案）

本資料夾是 story-factory 底下的獨立作品，與「雨夜偵探社」互不共用人名、線索、結局條件。

## 沿用的規範

- **文字規範與 AI 慣用語黑名單**：沿用根目錄 `ai-interactive-story-factory/CLAUDE.md`「文字規範」「AI 慣用語黑名單」。全形標點、`……`（六點）、`——`（雙字）、禁簡體、禁黑名單詞。
- **事實台帳**：本作專用 `projects/hoshino-akari/brief/canon-log.md`（append-only，只增不改）。
- **角色語氣**：依 `templates/character-sheet.md` 建表，存於 `projects/hoshino-akari/brief/voice/`。生成台詞前必讀。
- **驗證**：新增／修改劇情文字後跑 `pwsh scripts/check-text.ps1 <檔案>`，違規清零前視為未完成。

## 檔案

| 檔案 | 內容 |
|---|---|
| `brief/canon-log.md` | 確定事實台帳（Day1～3 已凍結） |
| `brief/voice/星野灯.md` | 女主角語氣表 |
| `episodes/day1.md` | Day1 定稿 |
| `episodes/day2.md` | Day2 自然化定稿 |
| `episodes/day3.md` | Day3 新稿 |
| `episodes/day4.md` | Day4 定稿（轉折日：外部壓力初現） |
| `episodes/day5.md` | Day5 定稿（不見面的一天：貓圖暗號） |

## 一句話定位

她是全國的偶像；對她來說，「自己走進便利店買一個布丁」才是奢侈品。男主角的價值，是他從頭到尾什麼都沒對她做。
