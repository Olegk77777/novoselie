// fog.js — думерский туман-фон вокруг квартиры (вместо плоской синей заливки).
//
// ИДЕЯ. За пределами комнаты — холодная светящаяся мгла «нежилых комнат»: пустота,
// которую игрок отвоёвывает. Многослойный анимированный туман с параллаксом и лёгким
// синим свечением. По мере открытия новых комнат (v0.3+) мгла ОТСТУПАЕТ — это и есть
// настроенческая награда (один юниформ uClear 0..1 рассеивает туман сверху вниз).
//
// КАК УСТРОЕНО (важно — не сломать перф iPad и взаимодействие с bloom):
//   Два полноэкранных квада в КЛИП-ПРОСТРАНСТВЕ (PlaneGeometry 2×2 → −1..1), камера им
//   не нужна (вершинный шейдер кладёт позицию напрямую). Поэтому туман всегда на весь
//   экран, не зависит от зума/сдвига комнаты и не «вырезается» (frustumCulled=false):
//     • BACKDROP — рисуется ПЕРВЫМ (renderOrder −1000, depthTest/Write=false), НЕпрозрачный,
//       перекрывает плоский фон. Это главный туман: 3 параллакс-слоя value-noise с разной
//       скоростью/масштабом (дрейф = глубина при статичной камере) + «фонарные лужи».
//     • VEIL — рисуется ПОСЛЕ комнаты (renderOrder +1000, transparent, NormalBlending),
//       почти прозрачный: редкие холодные язычки только у НИЗА кадра — наползают на открытые
//       ближние кромки пола (там не нарисованы ближние стены). Не светит, не мутит интерьер.
//
//   СВЕЧЕНИЕ. Тело тумана держим НИЖЕ порога bloom (luma ~0.64): оно не засвечивает комнату.
//   Светятся только мелкие «фонарные лужи» (барвинково-синие ядра, luma ~0.72) — их центры
//   пробивают порог, и пост-эффект bloom (src/bloom.js) сам подмешивает им мягкое синее гало.
//   Поэтому оба квада — toneMapped:false (иначе ACES сожмёт ядра обратно под порог и убьёт гало,
//   как у оконного/ТВ-шейдеров).
//
//   ПЕРФ. Дешёвый value-noise (как в walls.js), без fbm выше 3 октав. На слабое железо
//   (ретина+сенсор ≈ iPad) включается препроцессорный #define LOW_END. Раньше он резал
//   агрессивно (1 октава, без домен-warp и ближнего слоя) — на iPad это выглядело «просто
//   разблюром». Олег подтвердил: планшет тянет туман без лагов, поэтому LOW_END теперь
//   почти равен десктопу (та же многослойность, клубы и фонари) — экономит только на
//   ОКТАВАХ среднего/ближнего слоёв (fbm2 вместо fbm3), это небольшой запас по перфу.
//
// Архитектура и числа — из дизайн-воркфлоу (4 арт-направления + сведение), плюс правка
// математики рассеивания: при uClear=0 туман на ВЕСЬ экран (а не только у низа).

import * as THREE from 'three';

// Слабое устройство (ретина+сенсор ≈ iPad): чуть режем октавы через настоящий #define.
// ?lowend в URL — принудительно включить «планшетный» путь на десктопе для проверки.
const LOW_END = (window.devicePixelRatio > 1.5 && 'ontouchstart' in window) ||
  (typeof location !== 'undefined' && /[?&]lowend\b/.test(location.search));

// Общий вершинный шейдер: позиции уже в клип-пространстве, камера не нужна. Пробрасываем uv.
const VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// ============================ BACKDROP — главный туман ============================
const BACKDROP_FRAG = `
precision highp float;

uniform float uTime;   // секунды, всё время растёт
uniform float uAspect; // ширина/высота холста — круглые лужи и неискажённые клубы
uniform float uZoom;   // 0.6..3.0, 1.0 — норма (микропараллакс по зуму)
uniform float uClear;  // 0 = полный туман, 1 = мгла отступила
varying vec2 vUv;      // экранные координаты 0..1

// дешёвый хэш — как в оконном шейдере walls.js
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// value-noise: 4 угла клетки + smoothstep-интерполяция (4 hash/вызов)
float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 2 октавы (8 hash) — на всех устройствах (1 октава выглядела «разблюром» на iPad).
float fbm2(vec2 p){
  return vnoise(p) * 0.65 + vnoise(p * 2.03 + 7.3) * 0.35;
}

// 3 октавы (12 hash) — тело среднего/ближнего слоёв на десктопе.
float fbm3(vec2 p){
  float s = 0.0;
  s += 0.5000 * vnoise(p); p *= 2.02;
  s += 0.2500 * vnoise(p); p *= 2.03;
  s += 0.1250 * vnoise(p);
  return s / 0.875;
}

// ============================ ЛИМБО-ДЕРЕВЬЯ ============================
// Голые качающиеся силуэты в тумане-фоне (без листьев) — «тени» в духе Limbo.
// Только тёмные силуэты: ствол + ветки + прутья из отрезков-SDF; гнутся по ветру
// (верхушка сильнее комля). Читаются на фоне дымки и фонарных луж, тонут в мгле.
// Дёшево: пара десятков отрезков, ноль текстур; на iPad (LOW_END) меньше веток и без прутьев.
#ifdef LOW_END
  #define TREE_NB 3
#else
  #define TREE_NB 5
#endif

// покрытие отрезка a-b с конусной толщиной (wa у a, wb у b). x домножен на aspect,
// чтобы ветка была одинаково толстой по обеим осям.
float seg(vec2 uv, float aspect, vec2 a, vec2 b, float wa, float wb){
  vec2 P = vec2(uv.x*aspect, uv.y);
  vec2 A = vec2(a.x*aspect, a.y);
  vec2 B = vec2(b.x*aspect, b.y);
  vec2 pa = P - A, ba = B - A;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float d = length(pa - ba * h);
  float w = mix(wa, wb, h);
  return smoothstep(w, w * 0.35, d);
}

// силуэт одного дерева; base — комель (низ кадра), H — высота, seed — вариация,
// wind — общий знакопеременный порыв ветра, t — время.
float oneTree(vec2 uv, float aspect, vec2 base, float H, float seed, float wind, float t){
  float cov  = 0.0;
  float ts   = H / 1.1;                                          // толщина пропорц. размеру
  float lean = (hash(vec2(seed, 3.7)) - 0.5) * 0.10;             // постоянный наклон
  float bend = wind * 0.020 + sin(t * 0.6 + seed * 6.2) * 0.006; // амплитуда качания

  // ствол ломаной: S-извилина + наклон + ветер (к верхушке сильнее, h*h)
  float hp = 0.0; vec2 prev = base;
  for (int i = 1; i <= 5; i++){
    float h = float(i) / 5.0;
    float x = base.x + lean*H*h + sin(h*2.6 + seed*4.0)*0.016*H + bend*h*h*H;
    vec2 cur = vec2(x, base.y + H*h);
    cov = max(cov, seg(uv, aspect, prev, cur,
                       mix(0.016, 0.0035, hp)*ts, mix(0.016, 0.0035, h)*ts));
    prev = cur; hp = h;
  }

  // ветки вверх-наружу от точек на стволе + по два прутика с конца
  for (int k = 0; k < TREE_NB; k++){
    float fk = float(k);
    float s  = hash(vec2(seed, fk + 11.0));
    float s2 = hash(vec2(seed*1.7, fk + 4.0));
    float ht = 0.34 + 0.60 * (fk + s) / float(TREE_NB);          // высота крепления
    float x  = base.x + lean*H*ht + sin(ht*2.6 + seed*4.0)*0.016*H + bend*ht*ht*H;
    vec2  a  = vec2(x, base.y + H*ht);
    float side = (fract(s2*3.0) < 0.5) ? -1.0 : 1.0;
    float ang  = mix(1.05, 0.42, ht) * (0.7 + 0.6*s);            // у макушки круче вверх
    float len  = H * mix(0.30, 0.11, ht) * (0.7 + 0.7*s2);
    float tipB = bend * (0.7 + ht) + sin(t*1.1 + seed*9.0 + fk) * 0.004; // кончик дрожит сильнее
    vec2  dir  = vec2(side*sin(ang), cos(ang));
    vec2  b    = a + dir*len + vec2(side*tipB*H, 0.0);
    cov = max(cov, seg(uv, aspect, a, b, 0.0060*ts, 0.0022*ts));
#ifndef LOW_END
    for (int j = 0; j < 2; j++){
      float fj = float(j);
      float sj = hash(vec2(seed + fk, fj + 21.0));
      float aj = ang + (fj < 0.5 ? -1.0 : 1.0) * (0.35 + 0.45*sj);
      float lj = len * (0.45 + 0.30*sj);
      float tj = tipB * 1.7 + sin(t*1.6 + sj*12.0) * 0.004;
      vec2  dj = vec2(side*sin(aj), cos(aj));
      vec2  c  = b + dj*lj + vec2(side*tj*H, 0.0);
      cov = max(cov, seg(uv, aspect, b, c, 0.0026*ts, 0.0011*ts));
    }
#endif
  }
  return cov;
}

void main(){
  vec2 uv = vUv;
  vec2 cz = uv - 0.5; // смещение от центра кадра для микропараллакса на зуме
  float clear = clamp(uClear, 0.0, 1.0);

  // --- цвета палитры (синий void + выцветшие слои + барвинковая лужа) ---
  vec3 voidTop = vec3(0.043, 0.055, 0.094); // #0b0e18 (верх темнее)
  vec3 voidBot = vec3(0.063, 0.075, 0.122); // #10131f (низ чуть глубже-синий)
  vec3 cFar    = vec3(0.247, 0.322, 0.455); // #3f5274 — далёкий, выцветший
  vec3 cMid    = vec3(0.169, 0.212, 0.314); // #2b3650 — средний
  vec3 cNear   = vec3(0.102, 0.122, 0.188); // #1a1f30 — ближний, тёмный
  vec3 poolCol = vec3(0.620, 0.720, 1.000); // барвинок/циан, luma ~0.72 > 0.64

  // базовый void-градиент (проступает, когда туман рассеивается)
  vec3 base = mix(voidBot, voidTop, smoothstep(0.0, 1.0, uv.y));
  vec3 col  = base;

  // --- рассеивание по высоте: при clear=0 туман на ВЕСЬ экран; с ростом clear линия
  //     опускается — небо чистится первым, мгла оседает вниз (поправка к блюпринту:
  //     старт clearLine ВЫШЕ верха кадра, иначе верх пустел бы и при полном тумане) ---
  float clearLine  = mix(1.60, -0.15, clear);
  float heightFall = smoothstep(clearLine, clearLine - 0.60, uv.y);
  // лёгкий вечный профиль: туман чуть гуще книзу, но присутствует и наверху
  float vProfile   = mix(0.78, 1.0, smoothstep(1.0, 0.0, uv.y));
  float densMul    = (1.0 - 0.88 * clear) * heightFall * vProfile;

  // ====== ДАЛЬНИЙ слой (единственный с domain-warp) ======
  vec2 pF = uv + cz * (uZoom - 1.0) * 0.02;
  pF.x *= uAspect;
  pF = pF * 1.4 + vec2(0.7, -0.20) * (uTime * 0.010);
  // домен-warp — на всех устройствах (это он даёт закручивание клубов, без него — пелена)
  vec2 warp = vec2(
      vnoise(pF * 1.6 + uTime * 0.015),
      vnoise(pF * 1.6 - uTime * 0.012 + 19.3)
  ) - 0.5;
  pF += warp * 0.30;
  float fFar = fbm2(pF);
  float mFar = smoothstep(0.32, 0.95, fFar) * densMul;
  // воздушная перспектива: дальний слой растворён в синем void (и сильнее при расчистке)
  vec3 farCol = mix(cFar, base, 0.45 + 0.25 * clear);
  col = mix(col, farCol, mFar * 0.55);

  // ====== СРЕДНИЙ слой ======
  vec2 pM = uv + cz * (uZoom - 1.0) * 0.045;
  pM.x *= uAspect;
  pM = pM * 2.6 + vec2(0.6, 0.40) * (uTime * 0.022);
#ifdef LOW_END
  float fMid = fbm2(pM);
#else
  float fMid = fbm3(pM);
#endif
  float mMid = smoothstep(0.34, 0.92, fMid) * densMul;
  col = mix(col, cMid, mMid * 0.62);

  // ====== БЛИЖНИЙ слой (контраст/объём; шум 3 окт. на десктопе, 2 окт. на iPad) ======
  vec2 pN = uv + cz * (uZoom - 1.0) * 0.075;
  pN.x *= uAspect;
  pN = pN * 4.5 + vec2(-1.0, 0.25) * (uTime * 0.040);
#ifdef LOW_END
  float fNear = fbm2(pN);
#else
  float fNear = fbm3(pN);
#endif
  float mNear = smoothstep(0.40, 0.96, fNear) * densMul;
  col = mix(col, cNear, mNear * 0.55);
  // светлые гребни — лёгкий объём (всё ещё ниже порога bloom)
  col += vec3(0.05, 0.065, 0.10) * smoothstep(0.62, 0.98, fNear) * heightFall;

  // ====== ФОНАРНЫЕ ЛУЖИ — источник синего свечения ======
  // Каждая лужа = мягкое широкое ГАЛО (дымка вокруг фонаря) + тугое яркое ЯДРО.
  // Ядро по яркости пробивает порог bloom (~0.66) — пост-эффект сам раздувает его в
  // мягкое синее свечение (как фонарь во дворе сквозь мглу). Тело гало остаётся ниже
  // порога и комнату не засвечивает.
  // несущая дымка: свет ярче там, где есть туман; gate не даёт ему пропасть совсем,
  // когда фонарь медленно выплывает из клубов (свечение «дышит», а не моргает).
  float carrier = fbm2(uv * vec2(1.8 * uAspect, 1.8)
                       + vec2(uTime * 0.020, -uTime * 0.015));
  float gate = 0.38 + 0.62 * smoothstep(0.25, 0.75, carrier);
  float glowMul = (1.0 - 0.85 * clear) * gate; // фонари «уходят» при расчистке

  // лужа 1 (главный «дворовый фонарь» слева-внизу)
  {
    vec2 pc = vec2(0.32 + 0.10 * sin(uTime * 0.050),
                   0.40 + 0.07 * cos(uTime * 0.037));
    vec2 q = (uv - pc); q.x *= uAspect;
    float ragged = 0.55 + 0.45 * vnoise(q * 6.0 + uTime * 0.06);
    float d2 = dot(q, q);
    float body = exp(-d2 * 11.0) * ragged;  // широкое мягкое гало
    float core = exp(-d2 * 42.0);           // тугое ядро → bloom
    // Приглушено (фидбек Олега): ядро больше НЕ выжигается в белый — синий канал poolCol=1.0
    // раньше уходил >1 и bloom добивал до пересвета. Теперь фонарь мягко СВЕТИТСЯ сквозь мглу.
    col += poolCol * (body * 0.28 + core * 0.55) * glowMul;
  }
  // лужа 2 (справа, ниже окна)
  {
    vec2 pc = vec2(0.72 + 0.08 * cos(uTime * 0.041),
                   0.30 + 0.06 * sin(uTime * 0.058));
    vec2 q = (uv - pc); q.x *= uAspect;
    float ragged = 0.55 + 0.45 * vnoise(q * 6.0 + 9.0 + uTime * 0.05);
    float d2 = dot(q, q);
    float body = exp(-d2 * 15.0) * ragged;
    float core = exp(-d2 * 52.0);
    col += poolCol * (body * 0.26 + core * 0.48) * glowMul;
  }
  // лужа 3 (выше, слабее — «дальний фонарь во дворе»)
  {
    vec2 pc = vec2(0.50 + 0.06 * sin(uTime * 0.029 + 1.7),
                   0.18 + 0.04 * cos(uTime * 0.024));
    vec2 q = (uv - pc); q.x *= uAspect;
    float ragged = 0.60 + 0.40 * vnoise(q * 7.0 + 21.0 + uTime * 0.04);
    float d2 = dot(q, q);
    float body = exp(-d2 * 18.0) * ragged;
    float core = exp(-d2 * 60.0);
    col += poolCol * (body * 0.20 + core * 0.38) * glowMul;
  }

  // ====== ЛИМБО-ДЕРЕВЬЯ: качающиеся голые силуэты в тумане ======
  // только тени; живут в дымке — тают при расчистке (uClear) и у самого низа кадра
  // (там нарисована комната). Дальнее дерево бледнее и тонет в мгле — воздушная перспектива.
  float wind  = sin(uTime*0.20) + 0.5*sin(uTime*0.53 + 1.7);
  float trees = oneTree(uv, uAspect, vec2(0.11, -0.02), 1.18, 1.0, wind,       uTime);
  trees = max(trees, oneTree(uv, uAspect, vec2(0.90, -0.02), 0.98, 2.0, wind*0.85, uTime + 13.0));
#ifndef LOW_END
  trees = max(trees, oneTree(uv, uAspect, vec2(0.63, -0.02), 0.74, 3.0, wind*1.10, uTime + 7.0));
#endif
  float treeVis  = (1.0 - 0.92*clear) * smoothstep(0.0, 0.16, uv.y);
  vec3  treeDark = vec3(0.012, 0.017, 0.030);                          // почти чёрный, холодный
  vec3  treeCol  = mix(treeDark, base*0.62, smoothstep(0.25, 0.98, uv.y) * 0.7); // верх растворяется
  col = mix(col, treeCol, clamp(trees, 0.0, 1.0) * treeVis * 0.9);

  // ====== финальная расчистка: к чистому void-градиенту ======
  col = mix(col, base, clear * 0.6);

  // дизер против бандинга на 8-битном холсте (одна hash, без новых юниформ)
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0); // непрозрачно — перекрывает плоский фон
}
`;

// ====================== VEIL — холодные язычки над кромками ======================
const VEIL_FRAG = `
precision highp float;

uniform float uTime;
uniform float uAspect;
uniform float uZoom;
uniform float uClear;
varying vec2 vUv;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm2(vec2 p){
  return vnoise(p) * 0.65 + vnoise(p * 2.07 + 4.1) * 0.35;
}

void main(){
  vec2 uv = vUv;
  float clear = clamp(uClear, 0.0, 1.0);

  // нижняя маска: 1 у самого низа, 0 к ~48% высоты; степень 1.5 — мягче спад вверх,
  // чтобы язычки чуть выше доставали до открытых кромок пола (по просьбе — видимее).
  float bottomMask = smoothstep(0.48, 0.0, uv.y);
  bottomMask = pow(bottomMask, 1.5);

  // РАННИЙ ВЫХОД: выше ~48% и при полной расчистке — чистая прозрачность.
  // Верхние ~52% кадра почти бесплатны и не трогают освещённую комнату.
  if (bottomMask < 0.003 || clear > 0.995){
    gl_FragColor = vec4(0.0);
    return;
  }

  // координаты: восходящий дрейф (язычки «лижут» вверх через открытые кромки)
  vec2 p = uv;
  p.x *= uAspect;
  p *= vec2(2.6, 2.0);
  p.y += uTime * 0.045 * (1.0 - 0.4 * clear); // медленное наползание
  p.x += uTime * 0.012;

  // узкий вертикальный warp — рвём ровную пелену на щупальца (на всех устройствах)
  float w = vnoise(p * vec2(1.0, 0.6) + 11.0) - 0.5;
  p.x += w * 0.6;

  float body = fbm2(p);
  // второй слой, мельче и быстрее — глубина язычков
  body = 0.6 * body + 0.4 * fbm2(p * 1.9 + vec2(2.3, -uTime * 0.07));

  // в «языки»: степень + порог оставляют узкие тяжи (порог пониже — язычки шире/видимее)
  float tongues = pow(clamp(body, 0.0, 1.0), 1.5);
  tongues = smoothstep(0.20, 0.78, tongues);

  // лёгкий прижим к боковым краям (там не нарисованы ближние стены)
  float sideMask = 0.6 + 0.4 * smoothstep(0.55, 0.0, abs(uv.x - 0.5));

  // холодный сине-серый, luma ~0.36 — НИЖЕ порога bloom, не цветёт
  vec3 veilCol = vec3(0.30, 0.36, 0.50);
  veilCol = mix(veilCol, vec3(0.34, 0.41, 0.58), bottomMask);

  // итоговая альфа: только низ, тонко, уходит с расчисткой
  float alpha = bottomMask * tongues * sideMask * 0.40 * (1.0 - clear);

  // дизер в цвет и альфу против ступенек на 8-битном градиенте
  float dz = (hash(gl_FragCoord.xy + fract(uTime) + 3.0) - 0.5);
  veilCol += dz / 255.0;
  alpha   += dz / 255.0;

  gl_FragColor = vec4(veilCol, clamp(alpha, 0.0, 0.42)); // прямой (не premultiplied) alpha
}
`;

// Создаёт оба квада тумана, добавляет в сцену. Возвращает { update, dispose }.
// scene — общая сцена игры (квады попадают в снимок bloom — так лужи и светятся).
export function createFog(scene) {
  // LOW_END — настоящий препроцессорный #define (компилятор сам выбирает ветку октав
  // среднего/ближнего слоёв: fbm2 вместо fbm3 — небольшой запас по перфу на iPad).
  const defines = LOW_END ? { LOW_END: '' } : {};

  // Один объект юниформов на оба материала — update() обновляет сразу оба квада.
  const aspect0 = window.innerWidth / Math.max(1, window.innerHeight);
  const uniforms = {
    uTime: { value: 0 },
    uAspect: { value: aspect0 },
    uZoom: { value: 1.0 },
    uClear: { value: 0.0 },
  };

  const backMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: BACKDROP_FRAG,
    defines,
    depthTest: false,
    depthWrite: false,
    transparent: false,
    toneMapped: false, // ACES не трогает: иначе сожмёт ядра луж под порог bloom
    blending: THREE.NoBlending,
  });
  const backMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backMat);
  backMesh.renderOrder = -1000; // первым — за комнатой
  backMesh.frustumCulled = false; // клип-квад нельзя отсекать по фрустуму
  scene.add(backMesh);

  const veilMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: VEIL_FRAG,
    defines,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
    blending: THREE.NormalBlending, // мягко притеняет кромки, НЕ светит
  });
  const veilMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), veilMat);
  veilMesh.renderOrder = 1000; // последним — поверх комнаты
  veilMesh.frustumCulled = false;
  scene.add(veilMesh);

  // Кадровый апдейт. aspect — ширина/высота холста (для круглых луж), zoom — ручной
  // зум камеры (микропараллакс), clear — степень расчистки 0..1.
  function update(time, aspect, zoom, clear) {
    uniforms.uTime.value = time;
    if (aspect) uniforms.uAspect.value = aspect;
    uniforms.uZoom.value = zoom ?? 1.0;
    uniforms.uClear.value = clear ?? 0.0;
  }

  return { update };
}
