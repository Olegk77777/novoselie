// lighting.js — система освещения комнаты: фотографическая трёхточка + «свет от окна».
//
// ИДЕЯ (думерская и фотографическая): комната — холодная бетонная «коробка» в вечных
// сумерках, в которой игрок САМ зажигает тёплый свет (лампа, ТВ, аквариум). Атмосферу
// «Молчат Дома» делает не яркость, а РАЗНИЦА ТЕМПЕРАТУР (тёплый вольфрам против холодной
// улицы) и КОНТРОВОЙ свет, отрывающий силуэты мебели от стены.
//
// Трёхточка (как на съёмочной площадке):
//   • KEY  — тёплый ключ сверху-справа-спереди: лепит светотень, бьёт тени мебели вглубь.
//            Единственный источник, который кастует тень (дёшево для iPad).
//   • FILL — холодный заполняющий слева: снимает черноту с теневой стороны, не убивая контраст.
//   • RIM  — контровой из-за дальней стены = ОН ЖЕ «свет от окна». Его цвет/яркость/наклон
//            каждый кадр считаются из того же времени, что крутит оконный шейдер (walls.js):
//            день — холодный, закат — янтарный, ночь — почти тьма (+ серебро в полнолуние),
//            дождь — свинцовый. Это и есть «заполняющий свет, реагирующий на окно».
//   • HEMI — полусферический ambient вместо плоского: верх холодный (небо), низ тёплый (тлен).
//
// Свет конкретных приборов (торшер/ТВ/аквариум) живёт в их моделях (src/items.js, buildLight),
// чтобы ехать и поворачиваться вместе с предметом; здесь — только глобальный риг и окно.

import * as THREE from 'three';

// Слабое устройство (ретина + сенсор ≈ iPad): режем разрешение теней и тяжёлый свет.
// Тот же признак используется в items.js для отключения второстепенного света.
const LOW_END = window.devicePixelRatio > 1.5 && 'ontouchstart' in window;

// --- чистые хелперы: JS-двойники функций GLSL из walls.js ---
function smoothstep(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
const fract = (x) => x - Math.floor(x);
const hash1 = (n) => fract(Math.sin(n * 91.37) * 43758.5453);

// Создаёт весь глобальный риг и возвращает {update(time, hasWindow), lowEnd, ...источники}.
export function createLighting(scene) {
  // 1) HEMI — полусферический ambient. Небо холодное сине-сиреневое, пол — тёплый тлен.
  //    Даёт вертикальную градацию почти бесплатно (сразу фотографичнее плоского ambient).
  const hemi = new THREE.HemisphereLight(0x2a3358, 0x241c14, 0.55);
  scene.add(hemi);

  // 2) KEY — тёплый вольфрамовый ключ (~2900K) сверху-справа-спереди. Единственная тень.
  const key = new THREE.DirectionalLight(0xffcb8c, 1.6);
  key.position.set(3.5, 8.0, 4.5);
  key.target.position.set(0, 0.6, 0);
  scene.add(key.target);
  key.castShadow = true;
  const SHADOW = LOW_END ? 512 : 1024;
  key.shadow.mapSize.set(SHADOW, SHADOW);
  // Ортографический фрустум тени накрывает всю комнату (x,z ∈ ±5, +запас под наклон).
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 25;
  key.shadow.bias = -0.0005; // против shadow-acne на плоском полу
  key.shadow.normalBias = 0.02; // против артефактов на тонких ножках/деталях
  scene.add(key);

  // 3) FILL — холодный заполняющий слева. Без тени.
  const fill = new THREE.DirectionalLight(0x4a5878, 0.35);
  fill.position.set(-7, 5, 6);
  fill.target.position.set(0, 0.8, 0);
  scene.add(fill.target);
  scene.add(fill);

  // 4) RIM / ОКОННЫЙ — контровой из-за дальней стены (светит внутрь, +z). Цвет/яркость/наклон
  //    реактивны (см. update). Без тени, поэтому «ползущее солнце» не дёргает shadow map.
  const rim = new THREE.DirectionalLight(0xa9c0e8, 0.5);
  rim.position.set(0, 3.5, -7.5);
  rim.target.position.set(0, 1.0, 1.5);
  scene.add(rim.target);
  scene.add(rim);

  // Опорные цвета окна (между ними интерполируем по времени суток/погоде/луне).
  const C_DAY = new THREE.Color(0x9fb3d8); // холодный пасмурный день
  const C_DUSK = new THREE.Color(0xff7a33); // тёплый закат — единственное тёплое от окна
  const C_NIGHT = new THREE.Color(0x10162e); // почти тьма, сине-фиолетовая
  const C_RAIN = new THREE.Color(0x55607a); // свинцовый дождь
  const C_MOON = new THREE.Color(0xb9caf0); // серебро полнолуния
  const HEMI_NIGHT = new THREE.Color(0x2a3358);
  const HEMI_DAY = new THREE.Color(0x4a5578);
  const HEMI_DUSK = new THREE.Color(0x4a3b50);
  const scratch = new THREE.Color();
  const scratch2 = new THREE.Color();

  // Троттлинг: сутки = 360 c, глаз не заметит пересчёт раз в 4 кадра — CPU почти в ноль.
  let frame = 0;

  // === SYNC: формулы сезона/суток/погоды/полнолуния продублированы из walls.js (applyWindow).
  //     Эти величины живут только в GPU-шейдере — общий импорт в GLSL невозможен.
  //     ПРАВИШЬ ОКОННЫЙ ШЕЙДЕР — ПРАВЬ И ЗДЕСЬ, иначе свет комнаты разойдётся с картинкой за стеклом. ===
  function update(time, hasWindow) {
    if (frame++ % 4 !== 0) return; // считаем на каждом 4-м кадре (первый — сразу)

    // Окна ещё нет (комната до ремонта) — нейтрально-холодный минимум, без сезонной математики.
    if (!hasWindow) {
      rim.color.setHex(0x8a93a8);
      rim.intensity = 0.15;
      rim.position.x = 0;
      hemi.intensity = 0.42;
      hemi.color.copy(HEMI_NIGHT);
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

    // (4) полнолуние: стабильно на всю ночь (как в шейдере). «Лунная ванна» работает
    //     только в ГЛУБОКУЮ ночь — на закате (duskMix→1) гасим, иначе серебро луны
    //     размывает тёплый янтарь заката (nightF высок уже на самом закате).
    const moonF = smoothstep(0.62, 0.72, hash1(Math.floor(t / 360) * 1.731 + 4.2));
    const moonWash = moonF * nightF * (1 - duskMix);

    // --- цвет оконного света ---
    scratch.copy(C_NIGHT).lerp(C_DAY, dayF);
    scratch.lerp(C_DUSK, duskMix * 0.85);
    scratch.lerp(C_RAIN, rainRaw * 0.4);
    scratch.lerp(C_MOON, moonWash * 0.6);
    rim.color.copy(scratch);

    // --- яркость оконного света ---
    const rimI =
      0.6 * (0.4 + 0.6 * dayF) * clarity + duskMix * 0.5 * clarity + moonWash * clarity * 0.9;
    rim.intensity = rimI * mood;

    // --- наклон: днём «солнце» ползёт слева→справа, в глубокую ночь луна в противофазе ---
    const ang = phase * TAU + (sun < -0.2 ? Math.PI : 0);
    rim.position.x = Math.sin(ang) * 3.5;

    // --- HEMI «дышит» сутками ---
    hemi.intensity = 0.35 + 0.4 * dayF + 0.18 * moonWash;
    scratch2.copy(HEMI_NIGHT).lerp(HEMI_DAY, dayF).lerp(HEMI_DUSK, duskMix * 0.6);
    hemi.color.copy(scratch2);
  }

  return { hemi, key, fill, rim, update, lowEnd: LOW_END };
}
