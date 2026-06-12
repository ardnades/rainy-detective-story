/* Day2 —— 兩塊油豆腐（驗證之夜・首張素顏 CG） */
window.HOSHINO.days[2] = [
  /* ===== D2-S1　口袋裡的謊（純內心戲） ===== */
  { type: "scene", place: "白天・主角的日常", time: "白天", mood: "stop" },

  { type: "line", who: "narration", text: "口袋裡有個硬硬的東西。", screen: "black", bgm: "stop" },
  { type: "line", who: "narration", text: "一支護唇膏。", pause: 0.6 },
  { type: "line", who: "narration", text: "我又摸到它。今天第幾次了。", se: "cloth" },
  { type: "line", who: "narration", text: "她塗過這個。", speed: "slow", pause: 0.4 },
  { type: "line", who: "narration", text: "——不，我在想什麼。", speed: "instant", pause: 1.0 },
  { type: "line", who: "narration", text: "我只是要還她。還完，這件事就結束。", pause: 0.8, add: { distance: 1 } },
  { type: "line", who: "narration", text: "……為什麼非得等到凌晨一點還？", pause: 1.5 },
  { type: "line", who: "narration", text: "我沒去想。", speed: "instant" },

  /* ===== D2-S2　暗處的聲音 ===== */
  { type: "scene", place: "深夜・便利商店", time: "凌晨零點五十分", mood: "store" },

  { type: "line", who: "narration", text: "凌晨零點五十分。推開門，暖氣撲到臉上。", bgm: "store" },
  { type: "line", who: "narration", text: "關東煮的湯氣，把玻璃霧出一片白。", se: "heater" },
  { type: "line", who: "narration", text: "我夾了竹輪、蘿蔔、蛋。手停在油豆腐上。最油的那塊。" },
  { type: "line", who: "me", text: "「……多買一塊也還好。」" },
  { type: "line", who: "narration", text: "我夾了兩塊。" },

  { type: "scene", place: "便利商店 後巷", time: "凌晨一點", mood: "night" },

  { type: "line", who: "narration", text: "外面，呼出的氣是白的。我靠在牆邊。", bgm: "night" },
  { type: "line", who: "narration", text: "手裡那袋關東煮，是整條巷子唯一熱的東西。" },
  { type: "line", who: "narration", text: "一點零五分。一點零八分。沒有人來。" },
  { type: "line", who: "narration", text: "我笑了一下。我在幹嘛。" },
  { type: "line", who: "narration", text: "一個國民偶像，會為了一支便利商店的護唇膏，半夜溜出來見一個陌生人？" },
  { type: "line", who: "narration", text: "一點十三分。指尖開始凍了。算了，回家。" },
  { type: "line", who: "narration", text: "轉身的瞬間——", speed: "instant" },
  { type: "line", who: "akari", text: "「你站了二十分鐘。」", se: "step" },
  { type: "line", who: "narration", text: "聲音從巷口傳來。我回頭。", pause: 0.6 },
  { type: "line", who: "narration", text: "她站在路燈照不到的地方，帽子壓得很低，手插在連帽衣口袋裡。圍巾把半張臉埋了進去。", expr: "戒備遮臉" },
  { type: "line", who: "me", text: "「……妳什麼時候來的？」" },
  { type: "line", who: "akari", text: "「比你早。」" },
  { type: "line", who: "me", text: "「那為什麼不出來？」" },
  { type: "line", who: "narration", text: "她沒有立刻回答。視線落在我手上，和口袋。", pause: 1.2 },
  { type: "line", who: "akari", text: "「你都沒拿出來。」" },
  { type: "line", who: "me", text: "「拿什麼？」" },
  { type: "line", who: "akari", text: "「手機。」" },
  { type: "line", who: "narration", text: "我下意識摸了一下口袋。她看著這個動作，笑了一下。", se: "pat" },
  { type: "line", who: "akari", text: "「也沒往那邊看。」" },
  { type: "line", who: "narration", text: "她朝街角輕輕抬了下下巴。我順著看過去。" },
  { type: "line", who: "narration", text: "街角那棟高樓頂上，亮著一塊飯店招牌。" },
  { type: "line", who: "me", text: "「……妳在看我？」" },
  { type: "line", who: "akari", text: "「嗯。」" },
  { type: "line", who: "narration", text: "她答得很乾脆。乾脆到，我接不下去。" },
  { type: "line", who: "akari", text: "「會跟過來的人，眼睛會先飄過去。」", speed: "slow" },
  { type: "line", who: "akari", text: "「你連看都沒看。」", speed: "instant" },
  { type: "line", who: "akari", text: "「別誤會。」", pause: 0.6, expr: "別過視線" },
  { type: "line", who: "akari", text: "「不是因為你特別。」" },
  { type: "line", who: "me", text: "「那是因為？」" },
  { type: "line", who: "akari", text: "「因為昨天，看到我這張臉的人裡——」" },
  { type: "line", who: "narration", text: "她停了一下。用鞋尖踢了踢地上的小石子。", se: "pebble", expr: "鬆動" },
  { type: "line", who: "akari", text: "「……你是唯一一個，什麼都沒做的。」", speed: "slow" },
  { type: "line", who: "narration", text: "風從巷子裡穿過去。她呼出的氣，白白的一團，散掉。", se: "wind" },

  /* seen_through_flag 判定 → awareness 早鳥 */
  {
    type: "gate", cond: "flag:seen_through_flag",
    then: [
      { type: "line", who: "narration", text: "她看的不是我的臉，是我的手、我的口袋。她在算我會不會變成下一個麻煩。", speed: "slow", add: { awareness: 1 } },
      { type: "line", who: "narration", text: "她沒說破，只是默默把這點記下來。這一點，我也默默記下了。" },
    ],
    else: [
      { type: "line", who: "narration", text: "她說得淡，像在陳述一件早就確認過的事。" },
    ],
  },

  /* ===== D2-S3　兩塊油豆腐 ===== */
  { type: "line", who: "narration", text: "下一秒，她忽然抬頭，指向我手上的袋子。" },
  { type: "line", who: "akari", text: "「所以呢。」" },
  { type: "line", who: "me", text: "「所以什麼？」" },
  { type: "line", who: "akari", text: "「今天的貓糧——」" },
  { type: "line", who: "narration", text: "她踮起腳，往袋子裡瞄。", se: "tiptoe" },
  { type: "line", who: "akari", text: "「有油豆腐嗎？」" },
  { type: "line", who: "narration", text: "我把袋子打開。湯氣冒上來。", se: "bag" },
  { type: "line", who: "narration", text: "兩塊油豆腐，並排躺在最上面。", pause: 1.0, cg: "oden", add: { affection: 1 } },
  { type: "line", who: "narration", text: "她的動作停住了。抬眼看我。", expr: "怔住" },
  { type: "line", who: "akari", text: "「……怎麼有兩塊。」", pause: 0.8 },
  { type: "line", who: "me", text: "「剛好買多了。」" },
  { type: "line", who: "akari", text: "「剛好。剛好多一塊，剛好是昨天那塊。」", speed: "slow", expr: "抓到把柄的笑" },
  { type: "line", who: "narration", text: "我語塞。" },

  {
    type: "choice", id: "d2s3",
    prompt: "面對她戳破的那句「剛好」——",
    options: [
      {
        label: "（不解釋，看著她）", _dbg: "接近 +0",
        reaction: [
          { type: "line", who: "narration", text: "我沒接話，只是看著她。" },
          { type: "line", who: "akari", text: "「……你不解釋，更糟。」", speed: "slow", expr: "別過視線" },
        ],
      },
      {
        label: "「就買多了。」", _dbg: "嘴硬 +0",
        reaction: [
          { type: "line", who: "me", text: "「就買多了。」", speed: "instant" },
          { type: "line", who: "akari", text: "「嗯，買多了。」", expr: "憋笑" },
        ],
      },
      {
        label: "「……當作沒這回事吧。」", _dbg: "逃避 distance +1",
        add: { distance: 1 },
        reaction: [
          { type: "line", who: "me", text: "「……當作沒這回事吧。」" },
          { type: "line", who: "narration", text: "她沉默了半拍。", expr: "收笑" },
          { type: "line", who: "akari", text: "「……也好。」" },
        ],
      },
    ],
  },

  { type: "line", who: "narration", text: "她沒有再追問。帽簷下，她先笑了。", pause: 0.6, expr: "素顏微笑" },
  { type: "line", who: "akari", text: "「你啊。」" },
  { type: "line", who: "akari", text: "「真的很不會說謊。」" },
  { type: "line", who: "narration", text: "她伸手夾走一塊。只是側著身，拉下口罩，咬了一口。", se: "mask" },
  { type: "line", who: "narration", text: "熱氣燙得她瞇起眼。招牌的光打在她半張臉上。", expr: "素顏", se: "steam" },
  { type: "line", who: "narration", text: "沒有妝。就是一個普通女生，在寒夜裡吃一塊很燙的油豆腐。" },
  { type: "line", who: "akari", text: "「……嗯。還是這塊好吃。」", speed: "slow" },

  /* ===== D2-S4　漂亮的數值與泳裝 ===== */
  { type: "line", who: "me", text: "「對了，今天早上的檢查？」" },
  { type: "line", who: "akari", text: "「過了。」", pause: 0.5 },
  { type: "line", who: "akari", text: "「數值很漂亮。」", expr: "無表情" },
  { type: "line", who: "narration", text: "那個「漂亮」，她說得像在唸別人的成績單。" },
  { type: "line", who: "akari", text: "「然後，明天拍泳裝。」" },
  { type: "line", who: "me", text: "「……現在是冬天吧？」" },
  { type: "line", who: "akari", text: "「春夏號要提前拍。」", expr: "聳肩" },
  { type: "line", who: "akari", text: "「所以才煩。」" },
  { type: "line", who: "narration", text: "她低頭，咬了一口油豆腐。" },
  { type: "line", who: "akari", text: "「大家夏天看到的笑臉，都是冬天餓出來的。」", speed: "slow", pause: 1.2 },
  { type: "line", who: "narration", text: "她自己先抬起頭。" },
  { type: "line", who: "akari", text: "「所以——今天這塊，特別好吃。」", expr: "素顏微笑" },

  /* ===== D2-S5　她又一次沒拿走 ===== */
  { type: "line", who: "narration", text: "她吃完，把竹籤折好，放回袋子裡。", cg: "clear", se: "stick" },
  { type: "line", who: "narration", text: "我把護唇膏掏出來。", cg: "lipbalm" },
  { type: "line", who: "me", text: "「對了，還妳。」" },
  { type: "line", who: "narration", text: "她看著我的手。沒有接。", pause: 1.0 },
  { type: "line", who: "akari", text: "「……先放你那。」", pause: 0.6, expr: "別過視線" },
  { type: "line", who: "me", text: "「啊？昨天不是說好——」" },
  { type: "line", who: "akari", text: "「我改主意了。」" },
  { type: "line", who: "narration", text: "她把帽子重新壓低，後退一步。然後看向便利店那扇亮著的玻璃門。" },
  { type: "line", who: "akari", text: "「明天。」", pause: 0.6 },
  { type: "line", who: "me", text: "「明天怎樣？」" },
  { type: "line", who: "akari", text: "「裡面。」", pause: 0.6 },
  { type: "line", who: "me", text: "「便利店？」" },
  { type: "line", who: "narration", text: "她點頭。" },
  { type: "line", who: "akari", text: "「我想自己買一次。」", speed: "slow", expr: "收起玩笑" },
  { type: "line", who: "akari", text: "「學術考察。庶民便利店生態。」", speed: "instant", expr: "立刻嘴硬" },
  { type: "line", who: "me", text: "「生態。」" },
  { type: "line", who: "akari", text: "「對。」" },
  { type: "line", who: "narration", text: "她轉身。" },
  { type: "line", who: "akari", text: "「明天別遲到。」" },

  {
    type: "choice", id: "d2s5",
    prompt: "她又一次沒拿走護唇膏——在心裡，我把它當成……",
    options: [
      {
        label: "（先收回口袋，什麼都不定義）", _dbg: "+0",
        reaction: [
          { type: "line", who: "narration", text: "我把護唇膏收回口袋。" },
          { type: "line", who: "narration", text: "我沒去想它代表什麼。至少今晚沒有。" },
        ],
      },
      {
        label: "（這是再見的理由）", _dbg: "試探 +0",
        reaction: [
          { type: "line", who: "narration", text: "她沒拿走，就是還想見。" },
          { type: "line", who: "narration", text: "這個我懂。", speed: "slow" },
        ],
      },
      {
        label: "（還完就結束，這只是還沒還成的任務）", _dbg: "逃避 distance +1",
        add: { distance: 1 },
        reaction: [
          { type: "line", who: "narration", text: "還沒還成而已。" },
          { type: "line", who: "narration", text: "明天還，後天還，總會還掉。" },
        ],
      },
    ],
  },

  { type: "line", who: "narration", text: "她走進巷子深處。走了幾步，沒回頭，丟下一句：", se: "step" },

  /* affection 門檻 → 結尾截圖句兩版 */
  {
    type: "gate", cond: "affection>=2",
    then: [
      { type: "line", who: "narration", text: "招牌的光剛好掃過她半側的臉。沒有妝，只有一點被風吹紅的鼻尖。", expr: "素顏微笑" },
      { type: "line", who: "akari", text: "「還有——謝謝你，記得那塊油豆腐。」", speed: "slow", pause: 1.2, expr: "素顏微笑" },
    ],
    else: [
      { type: "line", who: "akari", text: "「還有——謝謝你，記得那塊油豆腐。」" },
    ],
  },

  { type: "line", who: "narration", text: "聲音很小。小到差點被風蓋掉。", se: "wind", cg: "clear" },
  { type: "line", who: "narration", text: "我站在原地，手裡捏著那支她又一次沒拿走的護唇膏。", screen: "black" },
  { type: "line", who: "narration", text: "明天。便利店裡面。", pause: 0.8, bgm: "warm" },
  { type: "line", who: "narration", text: "她說「自己買一次」的樣子，像在許願。", speed: "slow" },
];
