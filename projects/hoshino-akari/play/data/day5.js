/* Day5 —— 她不在，可是痕跡在（缺席日・收據解謎＋留物回應） */
window.HOSHINO.days[5] = [
  /* ── D5-S1：午休・決定要不要去 ── */
  { type: "scene", place: "白天・公司", time: "午休", mood: "store" },

  { type: "line", who: "narration", text: "我又點開那則貼文。", bgm: "rain" },
  { type: "line", who: "narration", text: "轉貼還在增加。" },
  { type: "line", who: "narration", text: "留言更多了。", se: "buzz" },
  {
    type: "line", who: "narration", text: "", ui: "sns",
    sns: {
      title: "推薦欄",
      posts: [
        { text: "路燈的位置查到了，江東區沒錯。" },
        { text: "她這週是不是住那邊的飯店？", acct: true },
        { text: "有人去蹲點了嗎？" },
        { text: "不要去啦，造成困擾。", reply: true },
      ],
    },
  },
  { type: "line", who: "narration", text: "還沒有人說出那間便利店。" },
  { type: "line", who: "narration", text: "但留言往那個方向，一步一步靠近。", speed: "slow", pause: 0.8 },

  { type: "line", who: "narration", text: "我把手機收進口袋。" },
  { type: "line", who: "narration", text: "指尖碰到護唇膏的外殼。", se: "pat" },
  { type: "line", who: "narration", text: "隔著一層布，它抵著我的手背。" },
  { type: "line", who: "narration", text: "比手機還有存在感。", speed: "slow", pause: 0.8 },

  { type: "line", who: "narration", text: "下午開會，我又摸了一次。" },
  { type: "line", who: "narration", text: "還在。", pause: 0.6 },
  { type: "line", who: "narration", text: "她說，可能來不了。", speed: "slow", pause: 1.0 },
  { type: "line", who: "narration", text: "那我今天，還要去嗎？", pause: 0.6 },
  { type: "line", who: "narration", text: "去了，她沒來，我就是站在巷子裡發呆的笨蛋。" },
  { type: "line", who: "narration", text: "不去——", speed: "instant", pause: 0.5 },
  { type: "line", who: "narration", text: "她說的是「可能來不了」。" },
  { type: "line", who: "narration", text: "不是「不要來」。", speed: "slow", pause: 1.0 },
  { type: "line", who: "narration", text: "那就去。", speed: "slow", pause: 0.8 },

  /* ── D5-S2：等待・空位（無人的後巷）── */
  { type: "scene", place: "深夜・便利商店 後巷", time: "凌晨一點", mood: "night" },

  { type: "line", who: "narration", text: "一點零五分。沒有人。", speed: "instant", bgm: "night", pause: 0.8 },
  { type: "line", who: "narration", text: "一點十五分。沒有人。", speed: "instant", pause: 0.8 },
  { type: "line", who: "narration", text: "一點二十分。連腳步聲都沒有。", speed: "slow", pause: 1.0 },
  { type: "line", who: "narration", text: "風把巷子吹得很乾淨。", se: "wind" },

  { type: "line", who: "narration", text: "我進店裡買了關東煮。", se: "store" },
  { type: "line", who: "narration", text: "竹輪、蘿蔔、蛋——", speed: "instant" },
  { type: "line", who: "narration", text: "結帳時才發現，袋子裡有兩塊油豆腐。", cg: "oden", se: "pat" },
  { type: "line", who: "narration", text: "我什麼時候夾的？", pause: 1.2 },
  { type: "line", who: "narration", text: "……自己都沒注意。", speed: "slow" },
  { type: "line", who: "narration", text: "替她留一份，已經變成手的習慣了。", speed: "slow", pause: 1.0, cg: "clear" },

  { type: "line", who: "narration", text: "我提著袋子回到巷子。" },
  { type: "line", who: "narration", text: "她平常站的那個位置，路燈照不到的角落。" },
  { type: "line", who: "narration", text: "空的。", pause: 1.0 },

  { type: "line", who: "narration", text: "但牆角有東西。" },
  { type: "line", who: "narration", text: "一張白色的小紙，折成四折，壓在半塊磚頭下面。" },
  { type: "line", who: "narration", text: "像怕被風吹走。" },
  { type: "line", who: "narration", text: "又像怕太顯眼。", pause: 0.8 },
  { type: "line", who: "narration", text: "我撿起來，打開。", se: "give" },

  /* ── D5-S3：解謎・收據正背面（軟分歧1）── */
  { type: "line", who: "narration", text: "邊角有一點泥印，像曾被人踩過。", bgm: "warm" },
  { type: "line", who: "narration", text: "是收據。", speed: "slow" },
  { type: "line", who: "narration", text: "不是今天的。", speed: "slow", pause: 0.6 },
  { type: "line", who: "narration", text: "日期是前天。" },
  { type: "line", who: "narration", text: "那天，她久違地自己走進便利店，自己選、自己拿、自己付錢。" },
  { type: "line", who: "narration", text: "品項只有一個。", pause: 0.8 },
  { type: "line", who: "narration", text: "焦糖布丁。", speed: "slow" },
  { type: "line", who: "narration", text: "她第一次自己選的那一個。", speed: "slow", pause: 1.0 },
  { type: "line", who: "narration", text: "時間印在上面：01:03。" },
  { type: "line", who: "narration", text: "那串數字旁邊，有人用原子筆畫了一個很小的東西。" },
  { type: "line", who: "narration", text: "一個肉球印。", speed: "slow", pause: 0.8 },

  { type: "line", who: "narration", text: "我把收據翻到背面。", se: "give" },
  { type: "line", who: "narration", text: "背面的線條比正面的字色深，像是後來補上的。" },

  /* gate：affection>=4 護唇膏記號版／else 原文版 */
  {
    type: "gate", cond: "affection>=4",
    then: [
      { type: "line", who: "narration", text: "一隻畫得很歪的小貓。", cg: "receipt" },
      { type: "line", who: "narration", text: "便利店的玻璃門上，打了一個大大的叉。" },
      { type: "line", who: "narration", text: "貓沒有走向門。" },
      { type: "line", who: "narration", text: "牠的肉球印繞過去，繞到一台四四方方的機器旁邊。" },
      { type: "line", who: "narration", text: "販賣機。", speed: "slow", pause: 0.8 },
      { type: "line", who: "narration", text: "肉球印停在販賣機旁邊。" },
      { type: "line", who: "narration", text: "那裡，點了一個小小的、長條形的記號。" },
      { type: "line", who: "narration", text: "護唇膏。", speed: "slow", pause: 0.8 },
      { type: "line", who: "narration", text: "她連這個都畫上去了。", speed: "slow", pause: 1.2 },
      { type: "line", who: "narration", text: "沒有任何字。", speed: "instant", pause: 1.5, cg: "clear" },
    ],
    else: [
      { type: "line", who: "narration", text: "一隻畫得很歪的小貓。", cg: "receipt" },
      { type: "line", who: "narration", text: "便利店的玻璃門上，打了一個大大的叉。" },
      { type: "line", who: "narration", text: "貓沒有走向門。" },
      { type: "line", who: "narration", text: "牠的肉球印繞過去，繞到一台四四方方的機器旁邊。" },
      { type: "line", who: "narration", text: "販賣機。", speed: "slow", pause: 0.8 },
      { type: "line", who: "narration", text: "肉球印停在販賣機旁邊。", pause: 0.8 },
      { type: "line", who: "narration", text: "沒有任何字。", speed: "instant", pause: 1.5, cg: "clear" },
    ],
  },

  { type: "line", who: "narration", text: "我又翻回正面，看著那個 01:03，和旁邊的肉球印。" },
  { type: "line", who: "narration", text: "……這是什麼意思？", speed: "slow", pause: 1.2 },

  {
    type: "choice", id: "d5s3",
    options: [
      {
        label: "「01:03，是她來過的時間。」", _dbg: "+0",
        reaction: [
          { type: "line", who: "me", text: "「01:03，是她來過的時間。」" },
          { type: "line", who: "narration", text: "她來過？" },
          { type: "line", who: "narration", text: "那她可能還沒走遠——", speed: "instant" },
          { type: "line", who: "narration", text: "我下意識朝玻璃門看。" },
          { type: "line", who: "narration", text: "門上打了一個叉。", pause: 0.8 },
          { type: "line", who: "narration", text: "對。" },
          { type: "line", who: "narration", text: "她要我去的不是門口。", speed: "slow" },
          { type: "line", who: "narration", text: "我把收據捏在手裡，順著背面那排肉球印的方向，朝停車場走。" },
        ],
      },
      {
        label: "「01:03，是她買到布丁的時間。」", _dbg: "+0",
        reaction: [
          { type: "line", who: "me", text: "「01:03，是她買到布丁的時間。」" },
          { type: "line", who: "narration", text: "那是前天，她自己買到布丁的時間。" },
          { type: "line", who: "narration", text: "她把這個數字留下來，不是要我算什麼。" },
          { type: "line", who: "narration", text: "是要我記得，有過那一刻。", speed: "slow" },
          { type: "line", who: "narration", text: "我把收據對折，朝停車場走，比剛才慢了一點。" },
        ],
      },
      {
        label: "「重點不是時間，是肉球印的方向。」", _dbg: "affection +1",
        add: { affection: 1 },
        reaction: [
          { type: "line", who: "me", text: "「重點不是時間，是肉球印的方向。」" },
          { type: "line", who: "narration", text: "門上打了叉。" },
          { type: "line", who: "narration", text: "肉球印繞過去，停在販賣機旁邊。", pause: 0.6 },
          { type: "line", who: "narration", text: "我直接朝停車場盡頭走。" },
          { type: "line", who: "narration", text: "腳先動的。" },
          { type: "line", who: "narration", text: "後來才知道，自己沒有猶豫。", speed: "slow" },
        ],
      },
    ],
  },

  /* ── D5-S4：停車場・還溫的熱可可（軟分歧2匯合）── */
  { type: "scene", place: "深夜・便利商店後方 停車場", time: "凌晨一點半", mood: "night" },

  { type: "line", who: "narration", text: "販賣機的燈，在黑暗裡亮著。", bgm: "warm" },
  { type: "line", who: "narration", text: "塑膠長椅空著。" },
  { type: "line", who: "narration", text: "她沒有坐在那裡。", pause: 0.8 },
  { type: "line", who: "narration", text: "但取出口旁邊，立著一罐熱可可。", cg: "cocoa" },
  { type: "line", who: "narration", text: "我拿起來。", se: "give" },
  { type: "line", who: "narration", text: "還是溫的。", speed: "slow", pause: 1.2 },
  { type: "line", who: "narration", text: "罐子還溫著。" },
  { type: "line", who: "narration", text: "表示把它放在這裡的人，離開沒多久。" },
  { type: "line", who: "narration", text: "也許就差十分鐘。", pause: 0.6 },
  { type: "line", who: "narration", text: "也許就差一個轉角。", speed: "slow", pause: 1.0 },
  { type: "line", who: "narration", text: "她不在。", speed: "instant", pause: 1.0 },
  { type: "line", who: "narration", text: "可是那罐熱可可，像是替她，坐在這裡。", speed: "slow" },

  { type: "line", who: "narration", text: "她沒有選完全沒人的地方，也沒有選太亮的地方。" },
  { type: "line", who: "narration", text: "在亮和暗的邊界，挑了一個剛好能逃走的位置。", speed: "slow" },
  { type: "line", who: "narration", text: "連留東西，都像貓。", pause: 0.8, cg: "clear" },

  { type: "line", who: "narration", text: "我在長椅上坐下，把那袋關東煮打開。" },
  { type: "line", who: "narration", text: "兩塊油豆腐，並排躺著。" },
  { type: "line", who: "narration", text: "一塊是我的。" },
  { type: "line", who: "narration", text: "另一塊，是手自己多夾的那塊。", speed: "slow" },
  { type: "line", who: "narration", text: "她今天不會來。" },
  { type: "line", who: "narration", text: "這我知道。", pause: 0.8 },

  {
    type: "choice", id: "d5s4",
    prompt: "（兩塊油豆腐。）",
    options: [
      {
        label: "「兩塊油豆腐，都吃掉。」", _dbg: "+0（情緒選擇）",
        reaction: [
          { type: "line", who: "narration", text: "吃吧。" },
          { type: "line", who: "narration", text: "她看到剩菜，大概又要唸浪費。" },
          { type: "line", who: "narration", text: "我把兩塊都吃了。" },
          { type: "line", who: "narration", text: "第二塊不知道為什麼，燙得很過分。", speed: "slow", pause: 0.8 },
        ],
      },
      {
        label: "「留一塊，陪一會。」", _dbg: "+0（情緒選擇）",
        reaction: [
          { type: "line", who: "narration", text: "我吃了一塊。" },
          { type: "line", who: "narration", text: "另一塊留在盒子裡，蓋好。" },
          { type: "line", who: "narration", text: "擺在長椅上，挨著我坐。" },
          { type: "line", who: "narration", text: "明知道她今天不會來。" },
          { type: "line", who: "narration", text: "湯涼掉之前，我還是讓那塊油豆腐，在旁邊多待了一會。" },
          { type: "line", who: "narration", text: "像替誰佔著位子。", speed: "slow", pause: 1.0 },
          { type: "line", who: "narration", text: "最後，我還是把盒子收好。" },
          { type: "line", who: "narration", text: "放在外面，她不一定拿得到。" },
          { type: "line", who: "narration", text: "也可能被踩到、被撿走。" },
          { type: "line", who: "narration", text: "這種東西，留在這裡只會變髒。" },
          { type: "line", who: "narration", text: "不如，我替她收著。", speed: "slow" },
        ],
      },
    ],
  },

  /* ── D5-S5：實物回應・護唇膏不留（關鍵選項）── */
  { type: "line", who: "narration", text: "我把手伸進口袋。" },
  { type: "line", who: "narration", text: "護唇膏還在。", speed: "instant" },
  { type: "line", who: "narration", text: "我把它拿出來，在販賣機的燈光下看了一眼。", cg: "lipbalm" },
  { type: "line", who: "narration", text: "要不要……也留在這裡？", speed: "slow", pause: 1.0 },
  { type: "line", who: "narration", text: "——不行。", speed: "instant", pause: 0.4 },
  { type: "line", who: "narration", text: "留在這裡太顯眼。" },
  { type: "line", who: "narration", text: "被風吹走、被人撿走，哪一種都不行。" },
  { type: "line", who: "narration", text: "這東西，只能在我這裡。", speed: "slow" },
  { type: "line", who: "narration", text: "我把它放回口袋最深的地方。", cg: "clear", pause: 0.6 },

  {
    type: "choice", id: "d5s5",
    options: [
      {
        label: "投一罐未開封熱可可，立在她放罐的位置；把焦糖布丁收據收好。",
        _dbg: "affection +1・確認 vending_machine_memory",
        add: { affection: 1 }, flag: { vending_machine_memory: true },
        reaction: [
          { type: "line", who: "narration", text: "我沒有寫字，也沒有畫圖。" },
          { type: "line", who: "narration", text: "只走到販賣機前，投了一罐熱可可。", se: "give" },
          { type: "line", who: "narration", text: "咚。", speed: "instant", se: "bump", pause: 0.8 },
          { type: "line", who: "narration", text: "沒有開。", speed: "instant" },
          { type: "line", who: "narration", text: "把它立在她剛才放罐子的那個位置。" },
          { type: "line", who: "narration", text: "未開封的，不會涼得太快，也不會弄髒地方。" },
          { type: "line", who: "narration", text: "位置跟她放的，一模一樣。", speed: "slow", pause: 0.8 },
          { type: "line", who: "narration", text: "意思她會懂——", speed: "slow" },
          { type: "line", who: "narration", text: "我來過。" },
          { type: "line", who: "narration", text: "我看懂了。", speed: "slow", pause: 0.8 },
          { type: "line", who: "narration", text: "那塊手自己多夾的油豆腐，連盒蓋好，立在熱可可旁邊乾淨的地方。" },
          { type: "line", who: "narration", text: "她拿得到的話，就拿得到。", speed: "slow" },
          { type: "line", who: "narration", text: "那張焦糖布丁的收據，我重新折好，收進口袋最裡面。", se: "give" },
          { type: "line", who: "narration", text: "別的可以不留。" },
          { type: "line", who: "narration", text: "這張，我不能弄丟。", speed: "slow" },
        ],
      },
      {
        label: "什麼都不留，只把收據收好。",
        _dbg: "regret +1",
        add: { regret: 1 },
        reaction: [
          { type: "line", who: "narration", text: "我沒有寫字，也沒有畫圖。" },
          { type: "line", who: "narration", text: "只走到販賣機前，投了一罐熱可可。", se: "give" },
          { type: "line", who: "narration", text: "咚。", speed: "instant", se: "bump", pause: 0.8 },
          { type: "line", who: "narration", text: "沒有開。", speed: "instant" },
          { type: "line", who: "narration", text: "把它立在她剛才放罐子的那個位置。" },
          { type: "line", who: "narration", text: "位置跟她放的，一模一樣。" },
          { type: "line", who: "narration", text: "意思她會懂——", speed: "slow" },
          { type: "line", who: "narration", text: "我來過。" },
          { type: "line", who: "narration", text: "我看懂了。", speed: "slow", pause: 0.8 },
          { type: "line", who: "narration", text: "別的什麼都沒多留。" },
          { type: "line", who: "narration", text: "那張焦糖布丁的收據，我重新折好，收進口袋最裡面。", se: "give" },
          { type: "line", who: "narration", text: "別的可以不留。" },
          { type: "line", who: "narration", text: "這張，我不能弄丟。", speed: "slow" },
        ],
      },
    ],
  },

  { type: "line", who: "narration", text: "像在替自己確認一件事：" },
  { type: "line", who: "narration", text: "沒丟。", speed: "slow", pause: 0.6 },
  { type: "line", who: "narration", text: "也沒走。", speed: "slow", pause: 1.0 },

  /* ── D5-S6：店前・地點開始暴露（結尾Hook）── */
  { type: "scene", place: "深夜・便利商店 前", time: "凌晨一點半", mood: "store" },

  { type: "line", who: "narration", text: "繞回店門口的時候，手機震了一下。", bgm: "rain", se: "buzz" },
  { type: "line", who: "narration", text: "推薦欄，新的貼文。" },
  {
    type: "line", who: "narration", text: "", ui: "sns",
    sns: {
      title: "推薦欄",
      posts: [
        { text: "拍到了！便利店後方那排販賣機。" },
        { text: "畫質好差……不過長椅角落那個，是不是有東西？", acct: true },
        { text: "放大看看，好像真的有人放了什麼。", reply: true },
        { text: "所以這間店到底在哪？" },
      ],
    },
  },
  { type: "line", who: "narration", text: "照片裡沒有人。", speed: "instant" },
  { type: "line", who: "narration", text: "拍的是便利店後方，那一排自動販賣機。" },
  { type: "line", who: "narration", text: "畫質很差。" },
  { type: "line", who: "narration", text: "但長椅的角落，拍到了一點，不該被拍到的東西。", speed: "slow", pause: 0.8 },

  { type: "line", who: "narration", text: "我站在原地。", speed: "instant", pause: 1.5 },
  { type: "line", who: "narration", text: "回頭，看向停車場的方向。" },
  { type: "line", who: "narration", text: "販賣機的燈還亮著。" },
  { type: "line", who: "narration", text: "我剛剛留下的東西，還在那裡。", speed: "slow", pause: 1.0 },

  { type: "line", who: "narration", text: "她拿得到嗎？" },
  { type: "line", who: "narration", text: "還是會先被別人拿走？", speed: "slow", pause: 0.8 },
  { type: "line", who: "narration", text: "還有——", speed: "instant", pause: 0.6 },
  { type: "line", who: "narration", text: "明天，連這裡，還能來嗎？", speed: "slow", pause: 1.2, screen: "black" },
];
