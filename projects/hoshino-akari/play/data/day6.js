/* Day6 —— 轉折日・地點曝光與雨棚並肩（不能被同一個鏡頭看成一組人） */
window.HOSHINO.days[6] = [
  /* ── D6-S1 白天・公司：地點被說出來了 ── */
  { type: "scene", place: "白天・公司", time: "下午", mood: "rain" },

  { type: "line", who: "narration", text: "那張販賣機的照片，傳開了。", bgm: "rain", pause: 0.6 },
  { type: "line", who: "narration", text: "留言區終於出現那一句。" },

  {
    type: "line", who: "narration", text: "我往下滑著推薦欄。", ui: "sns",
    sns: {
      title: "推薦欄",
      posts: [
        { text: "我知道這間，是車站後面那家。", acct: "夜貓子R", num: 482 },
        { text: "（拍的是後方那排自動販賣機）", acct: "路過的人", reply: true },
        { text: "有人要去蹲點嗎？", acct: "追星小隊", num: 211 },
        { text: "我今晚過去看看。", acct: "匿名訪客", reply: true },
        { text: "不要造成困擾啦。", acct: "理性粉", reply: true },
      ],
    },
  },

  { type: "line", who: "narration", text: "那間便利店的位置，被說出來了。", speed: "slow" },
  { type: "line", who: "narration", text: "我把手機收進口袋。" },
  { type: "line", who: "narration", text: "便利店不能去了。", speed: "slow", pause: 0.8 },
  { type: "line", who: "narration", text: "販賣機，也不能去了。", speed: "slow", pause: 0.8 },
  { type: "line", who: "narration", text: "那個只屬於我們兩個人的、凌晨一點的小小夜晚——", pause: 1.0 },
  { type: "line", who: "narration", text: "被世界，找到入口了。", speed: "slow", pause: 0.8 },
  { type: "line", who: "narration", text: "我握著手機，指尖碰到口袋裡的護唇膏外殼。", se: "pat" },
  { type: "line", who: "narration", text: "她今天，大概連飯店都出不來。", pause: 0.6 },

  { type: "line", who: "narration", text: "下班的時候，外面下著雨。" },
  { type: "line", who: "narration", text: "冬天的雨，又細又冷。", se: "rain" },
  { type: "line", who: "narration", text: "我沒有撐傘。" },
  { type: "line", who: "narration", text: "回家的路上有一段商店街，有長長的雨棚。" },
  { type: "line", who: "narration", text: "便利店不能去。販賣機不能去。" },
  { type: "line", who: "narration", text: "那我還能去哪？", pause: 0.8 },
  { type: "line", who: "narration", text: "……哪裡都不去。", speed: "instant" },
  { type: "line", who: "narration", text: "就走平常那條，回家的路。", pause: 0.6 },

  /* ── D6-S2 雨棚・相遇：不要回頭 ── */
  { type: "scene", place: "深夜・商店街 雨棚下", time: "深夜", mood: "rain" },

  { type: "line", who: "narration", text: "鐵門大半都拉下來了。" },
  { type: "line", who: "narration", text: "只剩雨棚的燈，一盞一盞，把濕掉的地面照成亮黃色。" },
  { type: "line", who: "narration", text: "雨打在棚頂，聲音很密。", se: "rain" },
  { type: "line", who: "narration", text: "我把手插進口袋，走在中間。", set: { rain_shelter_flag: true } },
  { type: "line", who: "narration", text: "護唇膏還在。" },

  { type: "line", who: "narration", text: "前面，一個戴口罩、圍著圍巾的人，迎面走來。" },
  { type: "line", who: "narration", text: "低著頭。走得很普通。" },
  { type: "line", who: "narration", text: "擦肩的那一瞬間，那個人沒有停。", se: "give", pause: 0.6 },
  { type: "line", who: "akari", text: "「不要回頭。」", speed: "slow", expr: "口罩圍巾" },
  { type: "line", who: "narration", text: "然後繼續往前走。" },
  { type: "line", who: "narration", text: "我愣了半秒。", pause: 0.8 },
  { type: "line", who: "narration", text: "那個聲音，我認得。", speed: "slow", pause: 0.6 },

  {
    type: "choice", id: "d6s2",
    options: [
      {
        label: "照她說的，不回頭。", _dbg: "distance +1・regret +1",
        add: { distance: 1, regret: 1 },
        reaction: [
          { type: "line", who: "narration", text: "我沒有回頭。" },
          { type: "line", who: "narration", text: "腳步放慢，等她繞回來，走到我背後。" },
          { type: "line", who: "akari", text: "「……今天很聽話。」", speed: "slow", expr: "眼神放軟" },
          { type: "line", who: "me", text: "「妳說的。」" },
          { type: "line", who: "akari", text: "「嗯。」" },
          { type: "line", who: "akari", text: "「難得。」" },
        ],
      },
      {
        label: "差點回頭，硬忍住。", _dbg: "set almost_confession_flag",
        flag: { almost_confession_flag: true },
        reaction: [
          { type: "line", who: "narration", text: "我的肩膀動了一下，脖子已經要轉。" },
          { type: "line", who: "narration", text: "半路又僵住，轉了回來。" },
          { type: "line", who: "akari", text: "「……差一點。」", speed: "slow", expr: "口罩圍巾" },
          { type: "line", who: "me", text: "「沒回頭就好。」" },
          { type: "line", who: "akari", text: "「差點，不算合格。」" },
          { type: "line", who: "narration", text: "但聽得出來，她沒有真的在生氣。" },
        ],
      },
    ],
  },

  /* ── D6-S3 雨棚・並肩：像剛好同路（同框風險名場面） ── */
  { type: "line", who: "narration", text: "她繞到我側後方，跟我隔著半步，往同一個方向走。" },
  { type: "line", who: "me", text: "「妳怎麼知道我會走這裡？」" },
  { type: "line", who: "akari", text: "「便利店不能去，販賣機也不能去。」", expr: "" },
  { type: "line", who: "akari", text: "「你回家只剩這條路了。」" },
  { type: "line", who: "me", text: "「妳想到這個？」" },
  { type: "line", who: "akari", text: "「貓看到獵物，盯著不放。」", speed: "instant" },
  { type: "line", who: "narration", text: "我差點笑出來，又忍住。" },
  { type: "line", who: "akari", text: "「別笑。」" },
  { type: "line", who: "akari", text: "「站著說話太顯眼。」" },
  { type: "line", who: "me", text: "「所以走路？」" },
  { type: "line", who: "akari", text: "「所以走路。」" },
  { type: "line", who: "me", text: "「不看妳？」" },
  { type: "line", who: "akari", text: "「你也不要看我。」" },
  { type: "line", who: "narration", text: "我把視線收回前面那盞燈。" },
  { type: "line", who: "akari", text: "「不要走太近。」" },
  { type: "line", who: "akari", text: "「也不要離太遠。」" },
  { type: "line", who: "me", text: "「那要怎樣？」" },
  { type: "line", who: "akari", text: "「像剛好同路。」", speed: "slow" },

  {
    type: "choice", id: "d6s3",
    options: [
      {
        label: "「像剛好同路？」", _dbg: "affection +1（鬥嘴）",
        add: { affection: 1 }, flag: { tag_banter: true },
        reaction: [
          { type: "line", who: "me", text: "「像剛好同路？」" },
          { type: "line", who: "akari", text: "「對。」", expr: "眼神彎" },
          { type: "line", who: "akari", text: "「今天稍微有點聰明。」" },
          { type: "line", who: "me", text: "「只有今天？」" },
          { type: "line", who: "akari", text: "「別得寸進尺。」" },
        ],
      },
      {
        label: "「很難。」", _dbg: "affection +1（坦白）",
        add: { affection: 1 }, flag: { tag_honest: true },
        reaction: [
          { type: "line", who: "me", text: "「很難。」" },
          { type: "line", who: "narration", text: "她沉默了半步。", pause: 0.8 },
          { type: "line", who: "akari", text: "「……我也覺得。」", speed: "slow", expr: "眼神低" },
          { type: "line", who: "akari", text: "「但今天，只能這樣。」" },
        ],
      },
    ],
  },

  { type: "line", who: "narration", text: "我們並排走在雨棚下。" },
  { type: "line", who: "narration", text: "不看彼此。不叫名字。" },
  { type: "line", who: "narration", text: "像兩個剛好同路的陌生人。", pause: 0.6 },
  { type: "line", who: "akari", text: "「便利店，不要去了。」" },
  { type: "line", who: "me", text: "「販賣機也？」" },
  { type: "line", who: "akari", text: "「也不要。」" },

  { type: "line", who: "narration", text: "前面，有個人舉起手機，對著雨棚拍了一張。", se: "flash" },
  { type: "line", who: "narration", text: "星野立刻慢了半步。", expr: "" },
  { type: "line", who: "narration", text: "我們之間，多出一個人的距離。", pause: 1.0 },
  { type: "line", who: "narration", text: "那個人收起手機，走遠了。" },
  { type: "line", who: "narration", text: "她才跟上來。", pause: 0.6 },

  {
    type: "gate", cond: "awareness>=2",
    then: [
      { type: "line", who: "narration", text: "我這時候才懂。" },
      { type: "line", who: "narration", text: "不是不能見面，是不能被同一個鏡頭，看成一組人。", speed: "slow", pause: 0.8 },
      { type: "line", who: "me", text: "「貓被看到？」" },
      { type: "line", who: "akari", text: "「不是。」" },
      { type: "line", who: "akari", text: "「貓窩，被看到了。」", speed: "slow" },
    ],
    else: [
      { type: "line", who: "me", text: "「貓被看到？」" },
      { type: "line", who: "akari", text: "「不是。」" },
      { type: "line", who: "akari", text: "「貓窩，被看到了。」", speed: "slow", pause: 0.8 },
      { type: "line", who: "narration", text: "我這時候才懂。" },
      { type: "line", who: "narration", text: "不是不能見面，是不能被同一個鏡頭，看成一組人。", speed: "slow" },
    ],
  },

  { type: "line", who: "narration", text: "她沒有再多說。" },
  { type: "line", who: "narration", text: "但那半步的距離，比任何一句話都清楚。" },

  /* ── D6-S4 雨棚・中段：油豆腐都還沒吃膩 ── */
  { type: "line", who: "narration", text: "我們又走過一盞燈。" },
  { type: "line", who: "akari", text: "「經理人，發現了。」", set: { manager_warning_flag: true } },
  { type: "line", who: "me", text: "「很生氣？」" },
  { type: "line", who: "akari", text: "「沒有。」", pause: 0.8 },
  { type: "line", who: "me", text: "「……那更可怕。」" },
  { type: "line", who: "akari", text: "「她只說，今晚開始，房卡由工作人員保管。」" },
  { type: "line", who: "narration", text: "她頓了一下。", pause: 0.6 },
  { type: "line", who: "akari", text: "「還說，照片被放上去之後，沒有人會照事實寫。」" },
  { type: "line", who: "narration", text: "我沒接話。" },

  { type: "line", who: "akari", text: "「明天，」" },
  { type: "line", who: "akari", text: "「最後一個工作。」" },
  { type: "line", who: "narration", text: "我的腳步差點停下來。" },
  { type: "line", who: "akari", text: "「拍完，我就不住這邊了。」", speed: "slow" },
  { type: "line", who: "me", text: "「那便利店呢？」" },
  { type: "line", who: "akari", text: "「貓會搬家。」" },
  { type: "line", who: "akari", text: "「那條巷子，那台販賣機，都不能再用了。」" },
  { type: "line", who: "narration", text: "很輕的一句。" },
  { type: "line", who: "narration", text: "但我知道，她說的不只是那些地方。" },

  {
    type: "choice", id: "d6s4",
    options: [
      {
        label: "「護唇膏，還在我這裡。」", _dbg: "affection +1",
        add: { affection: 1 },
        reaction: [
          { type: "line", who: "me", text: "「護唇膏，還在我這裡。」" },
          { type: "line", who: "narration", text: "口罩遮住了她的嘴。" },
          { type: "line", who: "narration", text: "但她的眼睛，稍微彎了一下。", expr: "眼神彎" },
          { type: "line", who: "akari", text: "「……那就還有理由。」", speed: "slow" },
          { type: "line", who: "akari", text: "「最後一個。」" },
        ],
      },
      {
        label: "「那明天，還來嗎？」", _dbg: "set almost_confession_flag",
        flag: { almost_confession_flag: true },
        reaction: [
          { type: "line", who: "me", text: "「那明天，還來嗎？」" },
          { type: "line", who: "narration", text: "她沉默了一下。", pause: 0.6 },
          { type: "line", who: "akari", text: "「你問得太直了。」", speed: "slow", expr: "口罩圍巾" },
          { type: "line", who: "narration", text: "聲音壓得更低。" },
          { type: "line", who: "narration", text: "但她沒有說不來。" },
        ],
      },
    ],
  },

  { type: "line", who: "narration", text: "她的手機，在口袋裡震。", se: "buzz" },
  { type: "line", who: "narration", text: "一次。又一次。", se: "buzz", pause: 0.6 },
  { type: "line", who: "narration", text: "她沒有拿出來。" },
  { type: "line", who: "narration", text: "雨還在下。", se: "rain" },

  { type: "line", who: "akari", text: "「我以為七天很長。」" },
  { type: "line", who: "me", text: "「現在呢？」" },
  { type: "line", who: "narration", text: "「現在覺得，」她的聲音輕得快被雨聲蓋掉，", pause: 1.0 },
  { type: "line", who: "akari", text: "「油豆腐都還沒吃膩。」", speed: "slow", cg: "oden", expr: "眼神放軟" },
  { type: "line", who: "narration", text: "我差點笑出來。", cg: "clear" },
  { type: "line", who: "me", text: "「完全沒有？」" },
  { type: "line", who: "akari", text: "「完全沒有。」" },

  /* ── D6-S5 商店街盡頭：明天再還，最後一次 ── */
  { type: "scene", place: "商店街 盡頭", time: "深夜", mood: "rain" },

  { type: "line", who: "narration", text: "雨棚到頭了。" },
  { type: "line", who: "narration", text: "前面是一條大馬路。" },
  { type: "line", who: "narration", text: "路燈很亮，車燈很亮。" },
  { type: "line", who: "narration", text: "亮得，容不下兩個並排的影子。" },
  { type: "line", who: "narration", text: "再往前，她就不能和我，走在同一個畫面裡。", speed: "slow" },

  { type: "line", who: "narration", text: "她停下來。" },
  { type: "line", who: "narration", text: "沒有回頭。" },
  { type: "line", who: "narration", text: "只伸出一隻手，手心朝上。" },
  { type: "line", who: "akari", text: "「護唇膏。」", speed: "slow" },
  { type: "line", who: "narration", text: "我把護唇膏，放到她手裡。", cg: "lipbalm" },
  { type: "line", who: "narration", text: "她握了一下。" },
  { type: "line", who: "narration", text: "那支用了好幾天的護唇膏，被她整個握進掌心。", pause: 2.0 },
  { type: "line", who: "narration", text: "然後——", pause: 0.6 },
  { type: "line", who: "narration", text: "下一秒，又塞回我手裡。", se: "give" },
  { type: "line", who: "akari", text: "「明天再還。」", speed: "slow" },
  { type: "line", who: "me", text: "「……又來？」" },
  { type: "line", who: "akari", text: "「今天不算。」" },
  { type: "line", who: "me", text: "「什麼不算？」" },
  { type: "line", who: "akari", text: "「你沒有看著我，把它還給我。」" },
  { type: "line", who: "me", text: "「……不是妳叫我不要看？」" },
  { type: "line", who: "akari", text: "「所以不算。」" },
  { type: "line", who: "narration", text: "她的聲音很輕，卻很硬。" },
  { type: "line", who: "akari", text: "「明天再還一次。」", speed: "slow" },
  { type: "line", who: "akari", text: "「最後一次。」", speed: "slow" },
  { type: "line", who: "akari", text: "「真的，最後一次。」", speed: "slow" },
  { type: "line", who: "narration", text: "我才發現，今天連這一次，我都沒能好好看她的臉。" },
  { type: "line", who: "narration", text: "她把圍巾往上拉，遮住半張臉。", expr: "圍巾遮臉" },
  { type: "line", who: "narration", text: "走進大馬路的燈光裡。" },
  { type: "line", who: "narration", text: "那團白氣跟在她身後，很快就散了。", expr: "", pause: 0.8 },

  { type: "line", who: "narration", text: "我站在雨棚的盡頭。" },
  { type: "line", who: "narration", text: "我低頭看著掌心裡的護唇膏。", cg: "lipbalm" },

  {
    type: "gate", cond: "distance>=3 || regret>=2",
    then: [
      { type: "line", who: "narration", text: "我又一次，什麼都沒說。", speed: "slow", pause: 1.0 },
    ],
    else: [
      { type: "line", who: "narration", text: "原來一支這麼小的東西，", pause: 0.6 },
      { type: "line", who: "narration", text: "也能把明天留住。", speed: "slow", pause: 1.0 },
    ],
  },

  { type: "line", who: "narration", text: "明天。", speed: "slow", cg: "clear", pause: 0.8 },
  { type: "line", who: "narration", text: "最後一天。", speed: "slow", bgm: "" },
];
