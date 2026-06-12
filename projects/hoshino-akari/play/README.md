# 星野灯線 —— 可試玩網頁 VN（dev note）

**獨立專案。** 不接任何其他作品的首頁、不與舊作並列。零後端、零 API key、純靜態，可直接用瀏覽器開 `index.html` 或丟 GitHub Pages。

線上試玩：<https://ardnades.github.io/rainy-detective-story/projects/hoshino-akari/play/index.html>

## 玩法
- 點文字框／Enter／空白 前進；右上 `▶自動`、`»快進`。
- 四分數（affection / distance / awareness / regret）**全程隱藏**，只用星野的反應與旁白讓玩家感覺到。
- 四結局：暖・真／靜・常／苦・餘味／隱藏・灯視點。通關解鎖**回想室**（章節回想＋四錨點 CG＋暗號圖鑑＋結局徽記）。
- 存檔以「天」為單位。選單可重玩本日。
- 按 `D`：開發者模式（顯示即時分數＋預測結局，可跳天，皆顯示日標題）。

## 章節節奏（每日如一章）
- `data/meta.js` 的 `meta.days[d]` = 每日標題／副標（**章節標題單一真實來源**）。
- `data/chapters.js` = 每日「極短引子(intro)／收束(outro)」。
- 流程：`Day 標題卡` →（intro）→ 當日劇情 →（outro）→ `Day End 卡` → 下一日標題卡。Day7 結束卡為「全七日　終」後進結局。
- 實作位置：`engine.js` 的 `showDayCard()`（標題/結束卡）、`runDay()`（intro/outro/轉場串接）。

## 素材接入（ComfyUI / 配樂之後再做，現在不阻塞）
**現況：完全沒有真素材，一律 fallback 到 inline SVG（`art.js`）／CSS 漸層／靜音＋視覺脈衝。缺圖缺音不會讓遊戲壞掉。**

未來只改 `data/assets.js` 一個檔即可接入，引擎不用動：

| 類別 | manifest key | 沒填時的 fallback |
|---|---|---|
| 立繪 sprite | `characters[who][expr] = url` | 不顯示立繪，改用右上表情徽章＋旁白 |
| 單張 CG | `cg[cgKey] = url` | `art.js` 的 inline SVG |
| 背景 background | `background[mood] = url` | CSS 漸層（night/warm/rain/stop/store）|
| 背景音樂 BGM | `bgm[mood] = url`＋`enabled.bgm=true` | 靜音（mood 仍改變背景色調）|
| 音效 SE | `se[seKey] = url`＋`enabled.se=true` | 畫面視覺脈衝（`flashSE`）|

- key 對照：`cgKey` ∈ oden/pudding/cocoa/lipbalm/cat_meet/receipt/note/akari_studio；`mood` ∈ night/warm/rain/stop/store；`expr` 用 data 裡的表情字串（如「素顏微笑」「拉低帽簷」）；`seKey` 用 data 裡的 `se` 字串（rush/bump/wind/tummy/give/steam/buzz…）。
- 建議把素材放 `play/assets/`（`characters/ cg/ bg/ bgm/ se/`），路徑相對 `index.html`。
- `enabled.bgm/se` 預設 `false`：先放好音檔再開，避免半套素材出現 404／破音。圖片用 `<img onerror>` 安全降級，404 自動隱藏。

## 檔案
```
index.html        畫面結構（含 spriteLayer / galChapters）
style.css         樣式（含章節卡、立繪層、章節回想格）
engine.js         播放器：打字機/停頓/打斷、選項、隱藏四分數、gate、SNS、CG、章節卡與日切換、結局判定、回想室、存檔、開發者模式、素材解析(fallback)
art.js            全 inline SVG 手繪貓/道具/暗號/結局徽記
data/meta.js      角色、四分數、結局判定、每日標題(meta.days)、圖鑑定義
data/assets.js    素材 manifest（未來替換點；目前全空→fallback）
data/chapters.js  每日 intro/outro
data/day1-7.js    各日劇本節點（對白沿用 episodes/，僅「便利商店」用語統一；旁白經冰山化改寫，以此處為演出正典）
data/endings.js   四結局後日談
```
