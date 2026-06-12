/* endings.js —— 四結局後日談（依結局調味；引擎依 tone 播放對應陣列）
   骨架取材 Day7【後日談・幾天後】：電車訪談「焦糖布丁」→ 便利店甜點櫃 → 自己買下布丁、不要袋子
   → 落點「這一次，不是替誰買的。是我自己，選的。」（cg:"pudding"）；口袋肉球印紙片仍在。
   hidden_pov_tail 接在 warm_true 之後播；who 用 akari（灯內心第一人稱），收在半句留白。 */
window.HOSHINO.endings = {

  /* ─────────── warm_true（暖・真）：後日談偏甜 ─────────── */
  warm_true: [
    { type: "scene", place: "幾天後・通勤電車", time: "傍晚", mood: "warm" },

    { type: "line", who: "narration", text: "那之後，我沒有刻意找她的消息。", bgm: "warm" },
    { type: "line", who: "narration", text: "只是眼睛開始容易停在她的名字旁邊——招牌上、手機推薦欄、電車廂的廣告欄。" },
    { type: "line", who: "narration", text: "回家路上，我路過那間便利店，沒有停。" },
    { type: "line", who: "narration", text: "路過那台販賣機，想起 Day5 放在取出口的那罐熱可可，不知道她後來有沒有拿到。" },
    { type: "line", who: "narration", text: "今天，我沒有多買油豆腐。因為那一份，已經真的還給她了。", pause: 0.6 },

    { type: "line", who: "narration", text: "幾天後，我在通勤的電車上，滑到一段訪談剪輯。", pause: 0.5 },
    { type: "line", who: "manager", text: "「最近，有沒有什麼小小的獎勵？」", expr: "主持人" },
    { type: "line", who: "narration", text: "星野灯想了一下。" },
    { type: "line", who: "akari", text: "「焦糖布丁。」", speed: "slow" },
    { type: "line", who: "manager", text: "「意外地普通呢。」", expr: "主持人" },
    { type: "line", who: "akari", text: "「普通的東西，有時候很貴。」", speed: "slow", pause: 0.6 },
    { type: "line", who: "narration", text: "她也笑。一般觀眾聽不懂。", pause: 0.5 },
    { type: "line", who: "narration", text: "只有我懂。", speed: "slow", pause: 0.8 },
    { type: "line", who: "narration", text: "影片就停在那裡。" },

    { type: "line", who: "narration", text: "下車之後，我走進車站旁的便利店。" },
    { type: "line", who: "narration", text: "走到甜點櫃前。焦糖布丁，還擺在老位置。" },
    { type: "line", who: "narration", text: "我拿起一個。", pause: 0.4 },
    { type: "line", who: "narration", text: "店員問我，要不要袋子。" },
    { type: "line", who: "me", text: "「不用。」" },
    { type: "line", who: "narration", text: "這一次，不是替誰買的。", speed: "slow", pause: 0.6 },
    { type: "line", who: "narration", text: "是我自己，選的。", speed: "slow", cg: "pudding", pause: 1.0 },
    { type: "line", who: "narration", text: "口袋裡，那片歪歪的肉球印紙片還在。她把該收的都收走了，就漏了這隻貓。", speed: "slow", pause: 0.8 },
  ],

  /* ─────────── quiet_normal（靜・常・保底）：平實版 ─────────── */
  quiet_normal: [
    { type: "scene", place: "幾天後・通勤電車", time: "傍晚", mood: "night" },

    { type: "line", who: "narration", text: "那之後，我沒有刻意找她的消息。", bgm: "night" },
    { type: "line", who: "narration", text: "偷來的七天，安靜地還了回去。", speed: "slow", pause: 0.7 },
    { type: "line", who: "narration", text: "回家路上，我路過那間便利店，沒有停。" },
    { type: "line", who: "narration", text: "路過那台販賣機，想起 Day5 放在取出口的那罐熱可可。" },
    { type: "line", who: "narration", text: "今天，我沒有多買油豆腐。那一份，已經還給她了。", pause: 0.5 },

    { type: "line", who: "narration", text: "幾天後，我在通勤的電車上，滑到一段訪談剪輯。" },
    { type: "line", who: "manager", text: "「最近，有沒有什麼小小的獎勵？」", expr: "主持人" },
    { type: "line", who: "narration", text: "星野灯想了一下。" },
    { type: "line", who: "akari", text: "「焦糖布丁。」" },
    { type: "line", who: "manager", text: "「意外地普通呢。」", expr: "主持人" },
    { type: "line", who: "narration", text: "她也笑。影片一閃而過，就停在那裡。", pause: 0.5 },

    { type: "line", who: "narration", text: "下車之後，我走進車站旁的便利店。" },
    { type: "line", who: "narration", text: "走到甜點櫃前。焦糖布丁，還擺在老位置。" },
    { type: "line", who: "narration", text: "我拿起一個。" },
    { type: "line", who: "narration", text: "店員問我，要不要袋子。" },
    { type: "line", who: "me", text: "「不用。」" },
    { type: "line", who: "narration", text: "這一次，不是替誰買的。", pause: 0.5 },
    { type: "line", who: "narration", text: "是我自己選的。", speed: "slow", cg: "pudding", pause: 0.8 },
    { type: "line", who: "narration", text: "口袋裡，那片肉球印紙片還在。我看了它一眼，把布丁帶回家。", pause: 0.6 },
  ],

  /* ─────────── bitter（苦・餘味）：加一句、只一句錯過尾句 ─────────── */
  bitter: [
    { type: "scene", place: "幾天後・通勤電車", time: "傍晚", mood: "night" },

    { type: "line", who: "narration", text: "那之後，我沒有刻意找她的消息。", bgm: "night" },
    { type: "line", who: "narration", text: "回家路上，我路過那間便利店，沒有停。" },
    { type: "line", who: "narration", text: "路過那台販賣機，想起 Day5 放在取出口的那罐熱可可。" },
    { type: "line", who: "narration", text: "今天，我沒有多買油豆腐。那一份，已經還給她了。", pause: 0.5 },

    { type: "line", who: "narration", text: "幾天後，我在通勤的電車上，滑到一段訪談剪輯。" },
    { type: "line", who: "manager", text: "「最近，有沒有什麼小小的獎勵？」", expr: "主持人" },
    { type: "line", who: "narration", text: "星野灯想了一下。" },
    { type: "line", who: "akari", text: "「焦糖布丁。」" },
    { type: "line", who: "manager", text: "「意外地普通呢。」", expr: "主持人" },
    { type: "line", who: "narration", text: "她也笑。影片一閃而過。", pause: 0.5 },

    { type: "line", who: "narration", text: "下車之後，我走進車站旁的便利店。" },
    { type: "line", who: "narration", text: "走到甜點櫃前。焦糖布丁，還擺在老位置。" },
    { type: "line", who: "narration", text: "我拿起一個。" },
    { type: "line", who: "narration", text: "店員問我，要不要袋子。" },
    { type: "line", who: "me", text: "「不用。」" },
    { type: "line", who: "narration", text: "這一次，不是替誰買的。是我自己選的。", cg: "pudding", pause: 0.6 },
    { type: "line", who: "narration", text: "我學會了自己選。", speed: "slow", pause: 0.6 },
    { type: "line", who: "narration", text: "只是學得太晚，沒能跟她說一聲。", speed: "slow", pause: 1.0 },
    { type: "line", who: "narration", text: "口袋裡那片肉球印紙片還在。她漏收的這隻貓，我也沒能還回去。", pause: 0.7 },
  ],

  /* ─────────── hidden_pov_tail（接在 warm_true 之後播）：灯視角內心半句 ─────────── */
  hidden_pov_tail: [
    { type: "scene", place: "同一個傍晚・攝影棚", time: "收工後", mood: "warm" },

    { type: "line", who: "narration", text: "——而那一頭，她拍完了最後一個工作。", speed: "slow", bgm: "warm", pause: 0.6 },
    { type: "line", who: "akari", text: "燈一盞一盞暗下去，只剩我站的這一塊還亮著。", speed: "slow", cg: "akari_studio" },
    { type: "line", who: "akari", text: "工作人員的腳步在遠處收線，誰都沒注意我。" },
    { type: "line", who: "akari", text: "我把手伸進外套最裡面的口袋，按了一下。" },
    { type: "line", who: "akari", text: "那支用了七天的護唇膏，還在。", speed: "slow", pause: 0.6 },
    { type: "line", who: "akari", text: "那隻很急的貓，今天……", speed: "slow", pause: 1.0 },
    { type: "line", who: "manager", text: "「灯，下一場。」", expr: "工作人員" },
    { type: "line", who: "akari", text: "我把手從口袋裡收回來。", speed: "slow" },
    { type: "line", who: "akari", text: "「來了。」", pause: 0.8 },
  ],

};
