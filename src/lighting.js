// lighting.js — освещение в духе Эдварда Хоппера / Limbo-в-цвете.
//
// ИДЕЯ (по запросу Олега): НЕ заливать комнату тёплым светом «лампочки сверху».
// Основное заполнение идёт ОТ ОКНА — холодный дневной/сумеречный свет, который
// отбрасывает длинные тени мебели вглубь комнаты (хопперовская «трапеция света»).
// Базовый полумрак — синеватый и глубокий, но НЕ чёрный («Limbo в цвете»). А тёплый
// свет игрок зажигает сам — торшер/ТВ/аквариум, — и он резко КОНТРАСТИРУЕТ с холодной
// мглой. В этом вся атмосфера: маленькое тёплое против большого холодного.
//
// Рига:
//   • WINDOW — главный свет и заполнение. Падает из окна (дальняя стена, проём по центру),
//     ЕДИНСТВЕННЫЙ кастует тень. Направление ФИКСИРОВАНО (тень статична между перестановками
//     — дёшево для iPad), а цвет и яркость реактивны к времени за окном: день холодный →
//     закат янтарный → ночь почти тьма → полнолуние серебро → дождь свинцовый.
//   • HEMI — холодный синеватый ambient: глубокий, но цветной полумрак (тени синие, не чёрные).
//   • FILL — еле заметный холодный отскок спереди: дальняя стена/теневая сторона не проваливаются.
//   ТЁПЛОГО ВЕРХНЕГО КЛЮЧА НЕТ. Тепло создаёт только игрок (см. makeApplianceLight в items.js).

import * as THREE from 'three';

// Слабое устройство (ретина + сенсор ≈ iPad): режем разрешение теней.
const LOW_END = window.devicePixelRatio > 1.5 && 'ontouchstart' in window;

// --- чистые хелперы: JS-двойники функций GLSL из walls.js ---
function smoothstep(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
const fract = (x) => x - Math.floor(x);
const hash1 = (n) => fract(Math.sin(n * 91.37) * 43758.5453);

export function createLighting(scene, opts = {}) {
  // Якорь дверного проёма (левая стена): из game.js передаём мировые координаты.
  const doorX = opts.doorX ?? -5; // x левой стены
  const doorZ = opts.doorZ ?? 2; // центр проёма по Z
  // HEMI — мягкое РАССЕЯННОЕ заполнение «от окна», покрывает всю комнату (как нейтральный
  // киношный fill «за кадром»: вроде источника нет, а тени не проваливаются). Низ заметно
  // поднят (0x242a36), чтобы свет доставал и до обращённых вниз граней — комната ровно залита.
  const hemi = new THREE.HemisphereLight(0x45526e, 0x242a36, 0.6);
  scene.add(hemi);

  // WINDOW — главный свет/заполнение, падает ИЗ окна (дальняя стена z≈-4, проём по центру).
  // Источник за стеной сверху-сзади, бьёт вперёд-вниз-влево в комнату → длинные тени к зрителю.
  // ЕДИНСТВЕННЫЙ кастует тень. Направление фиксировано (shadow map статична, autoUpdate=false).
  const win = new THREE.DirectionalLight(0xaecbf2, 1.0);
  win.position.set(2.2, 4.6, -8.5);
  win.target.position.set(-1.2, 0, 1.8);
  scene.add(win.target);
  win.castShadow = true;
  const SHADOW = LOW_END ? 512 : 1024;
  win.shadow.mapSize.set(SHADOW, SHADOW);
  // Ортографический фрустум тени накрывает комнату + дальнюю стену (свет идёт из-за неё).
  win.shadow.camera.left = -8;
  win.shadow.camera.right = 8;
  win.shadow.camera.top = 8;
  win.shadow.camera.bottom = -8;
  win.shadow.camera.near = 0.5;
  win.shadow.camera.far = 32;
  win.shadow.bias = -0.0005;
  win.shadow.normalBias = 0.02;
  win.shadow.radius = 4; // мягче край тени
  scene.add(win);

  // WINDOW SPILL — ВИДИМЫЙ поток света из окна в комнату: широкий мягкий конус на пол перед
  // окном. Это и делает окно ОЩУТИМЫМ главным источником (на полу — пятно света, как в кино),
  // а не просто ярким прямоугольником. Цвет и яркость реактивны (= оконному свету), decay 1 —
  // мягкий широкий спад. Без тени (единственный кастер — направленный win).
  const winSpill = new THREE.SpotLight(0xaecbf2, 0, 16, 1.0, 0.9, 1.0);
  winSpill.position.set(0, 2.8, -4.8); // над/за окном (дальняя стена z≈-4)
  winSpill.target.position.set(0, 0, 0.8); // на пол, вглубь комнаты — поток достаёт дальше
  scene.add(winSpill.target);
  winSpill.castShadow = false;
  scene.add(winSpill);

  // DOOR — мягкий НЕЙТРАЛЬНЫЙ свет из дверного проёма (свет из коридора квартиры). Рассеянный
  // широкий конус (большая penumbra), без тени. НЕ жёлтый — нейтральный, чтобы не спорил с окном.
  const door = new THREE.SpotLight(0xd2d6de, 16.0, 9.0, 0.85, 0.92, 2.0);
  door.position.set(doorX - 0.4, 1.7, doorZ); // чуть за стеной, на высоте дверного проёма
  door.target.position.set(doorX + 2.8, 0.2, doorZ + 0.4); // вперёд-вниз в комнату → мягкая лужица у входа
  scene.add(door.target);
  door.castShadow = false;
  scene.add(door);

  // Опорные цвета оконного света (между ними интерполируем по времени/погоде/луне).
  const C_DAY = new THREE.Color(0xaecbf2); // холодный дневной
  const C_DUSK = new THREE.Color(0xff8a44); // тёплый закат (золотой час)
  const C_NIGHT = new THREE.Color(0x0c1430); // почти тьма, глубокий синий
  const C_RAIN = new THREE.Color(0x586781); // свинцовый дождь
  const C_MOON = new THREE.Color(0xbcd0f4); // серебро полнолуния
  const HEMI_NIGHT = new THREE.Color(0x3c465c); // ночной полумрак — синеватый, но поднятый (не чёрный)
  const HEMI_DAY = new THREE.Color(0x586a88);
  const scratch = new THREE.Color();
  const scratch2 = new THREE.Color();

  // Троттлинг: сутки = 360 c, глаз не заметит пересчёт раз в 4 кадра — CPU почти в ноль.
  let frame = 0;

  // === SYNC: формулы сезона/суток/погоды/полнолуния продублированы из walls.js (applyWindow).
  //     Эти величины живут только в GPU-шейдере — общий импорт в GLSL невозможен.
  //     ПРАВИШЬ ОКОННЫЙ ШЕЙДЕР — ПРАВЬ И ЗДЕСЬ, иначе свет комнаты разойдётся с картинкой. ===
  function update(time, hasWindow) {
    if (frame++ % 4 !== 0) return; // считаем на каждом 4-м кадре (первый — сразу)

    // Окна-стекла ещё нет (комната до ремонта) — холодный дневной свет из проёма (видно
    // прибраться), без сезонной математики (картинка за стеклом ещё не идёт).
    if (!hasWindow) {
      win.color.setHex(0x9ab0d0);
      win.intensity = 1.3;
      winSpill.color.setHex(0x9ab0d0);
      winSpill.intensity = 7.0; // холодный поток из пустого проёма (видно прибраться)
      hemi.color.setHex(0x45526e);
      hemi.intensity = 0.7;
      return;
    }

    const t = time;
    const TAU = Math.PI * 2;

    // (1) сезон: год = 4320 c, 4 сезона по 3 суток, плавный кроссфейд (XFADE=0.15)
    const yf = fract(t / 4320);
    const si = yf * 4;
    const cur = Math.floor(si);
    const blend = smoothstep(1 - 0.15, 1, si - cur);
    const nxt = (cur + 1) % 4;
    const w = [0, 0, 0, 0]; // [осень, зима, весна, лето]
    w[cur] += 1 - blend;
    w[nxt] += blend;
    const mood = 0.94 * w[0] + 0.8 * w[1] + 0.97 * w[2] + 0.92 * w[3]; // зима тусклее

    // (2) сутки: 1 сутки = 360 c; зимой короче/темнее (bias)
    const phase = fract(t / 360);
    const sun = Math.cos(phase * TAU); // +1 — полдень, -1 — полночь
    const bias = 0.16 * w[1] - 0.1 * w[2] - 0.06 * w[3];
    const dayF = smoothstep(-0.08 + bias, 0.45 + bias, sun);
    const nightF = 1 - dayF;
    const duskMix = smoothstep(0.55, 0, Math.abs(sun)); // максимум на закате/рассвете

    // (3) погода: окно дождя/тумана по кругу (110 c)
    const wc = fract(t / 110);
    const rainRaw = smoothstep(0.34, 0.44, wc) * smoothstep(0.66, 0.56, wc);
    const fog = smoothstep(0.18, 0.34, wc) * smoothstep(0.82, 0.64, wc);
    const cloud = THREE.MathUtils.clamp(Math.max(rainRaw * (w[0] + w[2] * 0.6), fog), 0, 1) * (1 - 0.4 * w[3]);
    const clarity = 1 - 0.9 * cloud;

    // (4) полнолуние: стабильно на ночь. «Лунная ванна» — только в ГЛУБОКУЮ ночь
    //     (на закате duskMix→1 гасим, иначе серебро размывает янтарь заката).
    const moonF = smoothstep(0.62, 0.72, hash1(Math.floor(t / 360) * 1.731 + 4.2));
    const moonWash = moonF * nightF * (1 - duskMix);

    // --- цвет оконного света ---
    scratch.copy(C_NIGHT).lerp(C_DAY, dayF);
    scratch.lerp(C_DUSK, duskMix * 0.85);
    scratch.lerp(C_RAIN, rainRaw * 0.4);
    scratch.lerp(C_MOON, moonWash * 0.6);
    win.color.copy(scratch);
    winSpill.color.copy(scratch); // поток из окна — того же цвета, что оконный свет

    // --- яркость направленного окна (даёт форму и мягкую тень) ---
    win.intensity = (2.0 * dayF * clarity + duskMix * 1.0 * clarity + moonWash * 0.6 + 0.06) * mood;

    // --- ВИДИМЫЙ поток из окна на пол — основная «масса» света от окна (decay 1, широкий) ---
    winSpill.intensity = (16.0 * dayF * clarity + duskMix * 8.0 * clarity + moonWash * 4.5) * mood;

    // --- HEMI — мягкое рассеянное заполнение, покрывает всю комнату; дышит сутками ---
    hemi.intensity = 0.5 + 0.4 * dayF + 0.12 * moonWash;
    scratch2.copy(HEMI_NIGHT).lerp(HEMI_DAY, dayF);
    hemi.color.copy(scratch2);
  }

  return { hemi, win, winSpill, door, update, lowEnd: LOW_END };
}
