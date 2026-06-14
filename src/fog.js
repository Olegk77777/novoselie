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
//   ПЕРФ. Дешёвый value-noise (как в walls.js), без fbm выше 3 октав. На слабом железе
//   (ретина+сенсор ≈ iPad) — реальный препроцессорный #define LOW_END выкидывает дальний слой,
//   домен-warp и вторые октавы (мёртвые ветки компилятор удаляет совсем).
//
// Архитектура и числа — из дизайн-воркфлоу (4 арт-направления + сведение), плюс правка
// математики рассеивания: при uClear=0 туман на ВЕСЬ экран (а не только у низа).

import * as THREE from 'three';

// Слабое устройство: режем число слоёв/октав через настоящий препроцессорный #define.
const LOW_END = window.devicePixelRatio > 1.5 && 'ontouchstart' in window;

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

// 2 октавы (8 hash). На LOW_END — 1 октава (4 hash).
float fbm2(vec2 p){
#ifdef LOW_END
  return vnoise(p);
#else
  return vnoise(p) * 0.65 + vnoise(p * 2.03 + 7.3) * 0.35;
#endif
}

// 3 октавы (12 hash) — тело среднего/ближнего слоёв на десктопе.
float fbm3(vec2 p){
  float s = 0.0;
  s += 0.5000 * vnoise(p); p *= 2.02;
  s += 0.2500 * vnoise(p); p *= 2.03;
  s += 0.1250 * vnoise(p);
  return s / 0.875;
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
#ifndef LOW_END
  vec2 warp = vec2(
      vnoise(pF * 1.6 + uTime * 0.015),
      vnoise(pF * 1.6 - uTime * 0.012 + 19.3)
  ) - 0.5;
  pF += warp * 0.30;
#endif
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

  // ====== БЛИЖНИЙ слой (только десктоп) ======
#ifndef LOW_END
  vec2 pN = uv + cz * (uZoom - 1.0) * 0.075;
  pN.x *= uAspect;
  pN = pN * 4.5 + vec2(-1.0, 0.25) * (uTime * 0.040);
  float fNear = fbm3(pN);
  float mNear = smoothstep(0.40, 0.96, fNear) * densMul;
  col = mix(col, cNear, mNear * 0.55);
  // светлые гребни — лёгкий объём (всё ещё ниже порога bloom)
  col += vec3(0.05, 0.065, 0.10) * smoothstep(0.62, 0.98, fNear) * heightFall;
#endif

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
    col += poolCol * (body * 0.46 + core * 0.95) * glowMul;
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
    col += poolCol * (body * 0.40 + core * 0.80) * glowMul;
  }
#ifndef LOW_END
  // лужа 3 (выше, слабее — «дальний фонарь во дворе»)
  {
    vec2 pc = vec2(0.50 + 0.06 * sin(uTime * 0.029 + 1.7),
                   0.18 + 0.04 * cos(uTime * 0.024));
    vec2 q = (uv - pc); q.x *= uAspect;
    float ragged = 0.60 + 0.40 * vnoise(q * 7.0 + 21.0 + uTime * 0.04);
    float d2 = dot(q, q);
    float body = exp(-d2 * 18.0) * ragged;
    float core = exp(-d2 * 60.0);
    col += poolCol * (body * 0.30 + core * 0.58) * glowMul;
  }
#endif

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
#ifdef LOW_END
  return vnoise(p);
#else
  return vnoise(p) * 0.65 + vnoise(p * 2.07 + 4.1) * 0.35;
#endif
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

#ifndef LOW_END
  // узкий вертикальный warp — рвём ровную пелену на щупальца
  float w = vnoise(p * vec2(1.0, 0.6) + 11.0) - 0.5;
  p.x += w * 0.6;
#endif

  float body = fbm2(p);
#ifndef LOW_END
  // второй, мельче и быстрее — глубина язычков (только десктоп)
  body = 0.6 * body + 0.4 * fbm2(p * 1.9 + vec2(2.3, -uTime * 0.07));
#endif

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
  // На LOW_END выкидываем тяжёлые ветки настоящим препроцессорным define
  // (мёртвый код удаляется компилятором, а не множится рантайм-флагом).
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
