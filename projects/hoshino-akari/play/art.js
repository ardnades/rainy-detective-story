/* art.js —— 全部用 inline SVG 線稿，無外部素材。風格：歪歪的手繪貓 + 暖色細線。 */
(function () {
  const S = (inner, vb = '0 0 200 200') =>
    `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#ffd9a8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

  // 歪歪的小貓（她）—— 貫穿符號
  const cat = (c = '#ffd9a8') => `
    <g stroke="${c}">
      <path d="M70 96 q-6 -34 8 -40 q6 14 14 16"/>
      <path d="M130 96 q6 -34 -8 -40 q-6 14 -14 16"/>
      <path d="M62 104 q-8 40 38 44 q50 -2 40 -46 q-4 -30 -39 -30 q-34 0 -39 32z"/>
      <circle cx="84" cy="110" r="3.4" fill="${c}"/>
      <circle cx="116" cy="110" r="3.4" fill="${c}"/>
      <path d="M96 120 l0 6 M96 126 q-7 5 -13 2 M96 126 q7 5 13 2"/>
      <path d="M58 118 l-22 -5 M60 126 l-22 4 M142 118 l22 -5 M140 126 l22 4"/>
    </g>`;

  // 肉球印
  const paw = (x, y, s = 1, c = '#ff9d6e') => `
    <g stroke="${c}" fill="${c}" transform="translate(${x} ${y}) scale(${s})">
      <ellipse cx="0" cy="6" rx="9" ry="7"/>
      <circle cx="-8" cy="-6" r="3"/><circle cx="-1" cy="-10" r="3.2"/>
      <circle cx="6" cy="-9" r="3"/><circle cx="11" cy="-2" r="2.6"/>
    </g>`;

  window.ART = {
    title: () => S(`
      <g stroke="#ff9d6e" opacity=".9"><path d="M30 150 h140 M44 150 v-10 M156 150 v-10"/>
      <path d="M52 140 q48 -28 96 0" stroke="#ffd9a8"/></g>
      ${cat()}
      ${paw(150, 60, .8)} ${paw(40, 78, .6)}`),

    cat_meet: () => S(`${cat()}
      <path d="M150 150 q-20 6 -40 0" stroke="#ff9d6e"/>
      ${paw(150, 150, .7)}
      <text x="100" y="184" fill="#9aa7b4" stroke="none" font-size="12" text-anchor="middle">一隻很急的貓</text>`),

    oden: () => S(`
      <path d="M52 96 q48 26 96 0 l-8 56 q-40 18 -80 0 z" stroke="#ffd9a8"/>
      <ellipse cx="100" cy="96" rx="48" ry="16"/>
      <rect x="84" y="60" width="32" height="30" rx="6" stroke="#ff9d6e"/>
      <path d="M100 60 l0 -26" stroke="#ff9d6e"/>
      <path d="M70 110 q4 8 0 16 M130 110 q-4 8 0 16" stroke="#9aa7b4"/>
      <text x="100" y="180" fill="#9aa7b4" stroke="none" font-size="12" text-anchor="middle">最油的那塊・自己准的</text>`),

    pudding: () => S(`
      <path d="M64 84 q36 22 72 0 l-12 64 q-24 14 -48 0 z" stroke="#ffd9a8"/>
      <ellipse cx="100" cy="84" rx="36" ry="12"/>
      <path d="M76 70 q24 -20 48 0 q-24 10 -48 0z" stroke="#ff9d6e"/>
      <text x="100" y="178" fill="#9aa7b4" stroke="none" font-size="12" text-anchor="middle">焦糖布丁・普通很貴</text>`),

    cocoa: () => S(`
      <rect x="72" y="60" width="56" height="92" rx="9" stroke="#ffd9a8"/>
      <ellipse cx="100" cy="60" rx="28" ry="8"/>
      <path d="M84 96 h32 M84 110 h32" stroke="#ff9d6e"/>
      <path d="M150 76 q14 6 0 18" stroke="#9aa7b4"/>
      <text x="100" y="178" fill="#9aa7b4" stroke="none" font-size="12" text-anchor="middle">還溫的熱可可・剛好</text>`),

    lipbalm: () => S(`
      <rect x="86" y="58" width="28" height="58" rx="8" stroke="#ffd9a8"/>
      <rect x="90" y="116" width="20" height="34" rx="5" stroke="#ff9d6e"/>
      <path d="M96 150 q4 6 8 0" stroke="#9aa7b4"/>
      <text x="100" y="178" fill="#9aa7b4" stroke="none" font-size="11" text-anchor="middle">如果明天還在這，就還給你</text>`),

    receipt: () => S(`
      <path d="M66 44 h68 v108 l-10 -6 -12 8 -12 -8 -12 8 -12 -8 -10 6 z" stroke="#ffd9a8"/>
      <path d="M78 66 h44 M78 80 h30" stroke="#9aa7b4" stroke-width="2"/>
      <text x="80" y="104" fill="#ff9d6e" stroke="none" font-size="13">01:03</text>
      ${paw(126, 100, .5)}
      <path d="M84 122 q14 -10 28 0" stroke="#ff9d6e" stroke-width="2"/>
      <line x1="118" y1="118" x2="132" y2="132" stroke="#ff5b5b" stroke-width="2"/>
      <line x1="132" y1="118" x2="118" y2="132" stroke="#ff5b5b" stroke-width="2"/>
      <text x="100" y="182" fill="#9aa7b4" stroke="none" font-size="11" text-anchor="middle">圖不用字・比較像回信</text>`),

    note: () => S(`
      <rect x="58" y="66" width="84" height="68" rx="4" stroke="#ffd9a8" transform="rotate(-4 100 100)"/>
      ${paw(86, 96, .7)}
      <text x="118" y="92" fill="#ff9d6e" stroke="none" font-size="13">17:40</text>
      <path d="M96 116 l28 -14" stroke="#9aa7b4" stroke-width="2"/>
      <circle cx="126" cy="100" r="3" fill="#ff9d6e" stroke="#ff9d6e"/>
      <text x="100" y="166" fill="#9aa7b4" stroke="none" font-size="11" text-anchor="middle">她漏掉的，那隻貓</text>`),

    akari_studio: () => S(`
      <circle cx="100" cy="70" r="40" fill="rgba(255,217,168,.08)" stroke="#ffd9a8"/>
      ${cat('#ffe9cc')}
      <path d="M40 150 q60 -24 120 0" stroke="#ff9d6e"/>
      <rect x="120" y="120" width="14" height="22" rx="4" stroke="#ff9d6e"/>
      <text x="100" y="178" fill="#9aa7b4" stroke="none" font-size="11" text-anchor="middle">攝影棚的光裡，她按著口袋</text>`),

    // 結局徽記
    end_warm: () => S(`<circle cx="100" cy="100" r="60" stroke="#ff9d6e"/>${paw(100,96,1.3,'#ffd9a8')}<text x="100" y="172" fill="#ffd9a8" stroke="none" font-size="13" text-anchor="middle">暖・真結局</text>`),
    end_quiet: () => S(`<circle cx="100" cy="100" r="60" stroke="#9aa7b4"/>${paw(100,96,1.3,'#9aa7b4')}<text x="100" y="172" fill="#9aa7b4" stroke="none" font-size="13" text-anchor="middle">靜・常結局</text>`),
    end_bitter: () => S(`<circle cx="100" cy="100" r="60" stroke="#6b7785" stroke-dasharray="5 7"/>${paw(100,96,1.3,'#6b7785')}<text x="100" y="172" fill="#6b7785" stroke="none" font-size="13" text-anchor="middle">苦・餘味結局</text>`),
    end_hidden: () => S(`<circle cx="100" cy="100" r="60" stroke="#ffd9a8"/><circle cx="100" cy="100" r="46" stroke="#ff9d6e" stroke-dasharray="3 6"/>${cat()}<text x="100" y="178" fill="#ffd9a8" stroke="none" font-size="12" text-anchor="middle">隱藏・灯視點</text>`),

    locked: () => '🔒',
  };
})();
