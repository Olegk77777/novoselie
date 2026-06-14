// cinema.js — РЕЖИМ ЛЮБОВАНИЯ (созерцание): превращает игру в lo-fi кадр, который можно
// записать как видео (канал «Пыль на кассете»). Включается «глазом» в углу (ui.js ставит
// body.cinema), и тогда:
//   • камера НАЧИНАЕТ ЕЛЕ ДЫШАТЬ — медленная орбита ±1.5° (настоящий параллакс на орто-камере:
//     передний план плывёт относительно дальней стены), вертикальное оседание и зум-бриз ±2.5%.
//     Всё на несоизмеримых синусах → дрейф апериодичен, «петли» не слышно (Бела Тарр, не дрон).
//   • поверх кадра ложатся CSS-слои: чёрные кино-полосы (letterbox 2.40:1), плёночное зерно,
//     тёплая виньетка, сумеречный грейд и VHS-датакод в углу (часы СИНХРОННЫ с днём за окном).
//   • при простое прячется курсор, любое касание/клавиша — выход. На входе — тихая титульная строка.
//
// ПОЧЕМУ ТАК (важно — не сломать перф и обычную игру):
//   – Движение — это ПРАВКА ПОЗЫ камеры (4 синуса + lookAt за кадр), НИ ОДНОГО нового прохода
//     рендера. Поворот вьюпорт-камеры НЕ трогает карту теней (тень от направленного оконного
//     света камеро-независима, autoUpdate=false не трогаем) и безразличен bloom (он снимает
//     ГОТОВЫЙ кадр). При weight=0 поза БИТ-В-БИТ игровая — raycast-расстановка не сдвигается.
//   – cinema.update() зовётся в game.js СРАЗУ ПОСЛЕ updateCameraAnim(dt) и пишет camera.zoom
//     ПОСЛЕДНИМ за кадр (через getBaseZoom() из camera.js), поэтому applyZoom его не перетирает.
//   – Все эффекты — CSS-оверлеи (композитятся браузером ПОСЛЕ bloom, ноль WebGL-проходов) →
//     дёшево на iPad. Зерно — PNG-тайл (не SVG-turbulence, который дорог в Safari).
//   – prefers-reduced-motion: все амплитуды ×0.25 (бережём тех, кому качание мешает).

import * as THREE from 'three';

export function createCinema({ camera, targetY, getBaseZoom, cards, osdLabel, osdDate, getFocusAnchors }) {
  // База орбиты = исходная поза камеры из camera.js: позиция (10, 10+targetY, 10), смотрит в
  // (0, targetY, 0). R и азимут A0 описывают её в полярных координатах вокруг центра комнаты.
  const R = Math.hypot(10, 10);
  const A0 = Math.atan2(10, 10); // 45°

  // prefers-reduced-motion → приглушаем все амплитуды (но не выключаем — лёгкое дыхание остаётся).
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const M = reduce ? 0.25 : 1;
  const A_ORBIT = THREE.MathUtils.degToRad(1.5) * M; // свинг азимута (даёт параллакс)
  const A_BOB = 0.04 * M;                            // вертикальное оседание кадра (heave)
  const A_ZOOM = 0.025 * M;                          // зум-бриз ±2.5%

  // Дрейф точки внимания: ДОМ — центр комнаты. Камера ненадолго мягко наклоняется к
  // предмету (окно/прибор/кот) и ВОЗВРАЩАЕТСЯ в центр — чередуем «объект ↔ центр», чтобы
  // кадр не парковался в углу. Пан очень мягкий (комната не уезжает), без наезда зумом
  // (масштаб-дрейф давал бы мелькание тонкой рамы окна).
  const DRIFT = 0.15 * M;       // доля пути к предмету — лёгкий наклон, не переезд
  const HOLD = 16;              // секунд на точке (объект / возврат в центр)
  let objects = [];             // якоря-предметы из game.js (окно/приборы/кот)
  let objIdx = 0;
  let goCenter = false;         // следующий переход — в центр? (чередуем объект↔центр)
  let curTarget = { x: 0, z: 0 };
  let switchT = 0;
  const pivot = { x: 0, z: 0 }; // текущее смещение взгляда (мир), плавно догоняет цель

  let weight = 0;       // 0 = игровая поза, 1 = полное дыхание; рампится плавно
  let active = false;   // включён ли режим
  let settled = true;   // поза уже возвращена к игровой (после выхода)
  let placing = false;  // игрок держит/ставит предмет? → камеру замораживаем (точная расстановка)

  // ===================== CSS-СЛОИ ПОВЕРХ ХОЛСТА =====================
  // Все pointer-events:none (касания проходят сквозь к document → tap-to-exit), появляются по
  // body.cinema (CSS-переходы заданы в index.html). Тексты — уже локализованные, из game.js.
  // ВАЖНО: грейд/виньетка/зерно — ПРЯМЫЕ дети body (не в общей обёртке): mix-blend-mode должен
  // смешиваться с холстом, а родитель с opacity<1 изолировал бы их (блендились бы между собой).
  // Порядок добавления = порядок наложения: грейд (низ) → виньетка → зерно (верх).
  const make = (id, parent = document.body) => {
    const el = document.createElement('div');
    el.id = id;
    parent.appendChild(el);
    return el;
  };
  make('cine-bar-top');
  make('cine-bar-bottom');
  make('cine-grade');    // сумеречный грейд (soft-light) — под зерном
  make('cine-vignette'); // тёплая виньетка (multiply)
  make('cine-grain');    // плёночное зерно (overlay) — сверху

  // Слабое железо (ретина+сенсор ≈ iPad): замораживаем «кипение» зерна (анимация полноэкранного
  // блендового слоя — единственный заметный расход; статичный тайл почти не отличим от живого).
  const LOW_END = window.devicePixelRatio > 1.5 && 'ontouchstart' in window;
  if (LOW_END) document.body.classList.add('cine-lowend');

  // VHS-датакод в нижнем поле: мигающая точка REC + дата (вечный ноябрь) + часы суток.
  const osd = make('cine-osd');
  const rec = document.createElement('span');
  rec.className = 'cine-rec';
  rec.textContent = '●'; // ●
  const recLabel = document.createElement('span');
  recLabel.textContent = ' ' + (osdLabel || 'REC') + ' ';
  const dateEl = document.createElement('span');
  dateEl.textContent = (osdDate || '') + ' ';
  const clockEl = document.createElement('span');
  clockEl.className = 'cine-clock';
  clockEl.textContent = '--:--';
  osd.append(rec, recLabel, dateEl, clockEl);

  // Тихая титульная строка на входе (CSS-анимация fade-in → hold → fade-out по классу .show).
  const card = make('cine-card');
  const cardLines = (cards && cards.length) ? cards : [];

  // ===================== ЧАСЫ СУТОК (SYNC со светом окна) =====================
  // lighting.js: phase=fract(time/360), sun=cos(phase·2π) → phase=0 ПОЛДЕНЬ, 0.5 ПОЛНОЧЬ.
  // Чтобы экранные часы СОВПАДАЛИ с днём/ночью за окном, сдвигаем на полдень: 13:00 в полдень,
  // ~01:00 в полночь, закат/рассвет (sun≈0) ≈ 19:00 / 07:00.
  function clockText(time) {
    const phase = time / 360 - Math.floor(time / 360);
    const h = (phase * 24 + 13) % 24;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }
  let lastSec = -1;
  function updateOsd(time) {
    const s = Math.floor(time); // обновляем раз в «секунду» времени, не каждый кадр
    if (s === lastSec) return;
    lastSec = s;
    clockEl.textContent = clockText(time);
  }

  // ===================== КУРСОР (выход — ТОЛЬКО через «глаз») =====================
  // Выхода по любому касанию/клавише НЕТ намеренно: в режиме любования можно спокойно двигать
  // предметы (placement.js) — клики по сцене не должны выкидывать из режима. Вход и выход —
  // кнопкой-«глазом» (она остаётся видимой). Курсор прячется при простое (чистая запись), но
  // любое движение мыши его возвращает — значит при расстановке он всегда на месте.
  let cursorTimer = null;
  function pokeCursor() {
    document.body.style.cursor = '';
    if (cursorTimer) clearTimeout(cursorTimer);
    if (active) cursorTimer = setTimeout(() => { document.body.style.cursor = 'none'; }, 2000);
  }

  // game.js сообщает, держит ли игрок предмет: тогда дыхание камеры гасим (weight→0), камера
  // встаёт в неподвижную центрированную игровую позу — клетка под курсором не «уплывает».
  function setPlacing(v) { placing = !!v; }

  // ===================== ВХОД / ВЫХОД =====================
  function enter() {
    active = true;
    settled = false;
    lastSec = -1;
    // Дрейф начинаем ИЗ ЦЕНТРА (без рывка на входе): комната просто встаёт по центру,
    // первый мягкий наклон к предмету — только спустя HOLD секунд.
    objects = getFocusAnchors ? (getFocusAnchors() || []) : [];
    objIdx = 0;
    goCenter = false;
    curTarget = { x: 0, z: 0 };
    switchT = 0;
    // Титульная строка: выбираем одну (псевдослучайно по времени) и перезапускаем анимацию.
    if (cardLines.length) {
      card.textContent = cardLines[Math.floor(Math.abs(Math.sin(performance.now())) * cardLines.length) % cardLines.length];
      card.classList.remove('show');
      void card.offsetWidth; // reflow — перезапуск CSS-анимации
      card.classList.add('show');
    }
    document.addEventListener('mousemove', pokeCursor); // вернуть курсор при движении мыши
    pokeCursor();
  }

  function exit() {
    active = false;
    placing = false;
    document.removeEventListener('mousemove', pokeCursor);
    if (cursorTimer) clearTimeout(cursorTimer);
    document.body.style.cursor = '';
    card.classList.remove('show');
  }

  // ===================== КАДРОВЫЙ ШАГ ДЫХАНИЯ =====================
  // Вызывается в game.js СРАЗУ ПОСЛЕ updateCameraAnim(dt). dt — секунды с прошлого кадра.
  function update(dt, time) {
    const d = Math.min(Math.max(dt, 0), 0.1);
    // Держит предмет → гасим дыхание (weight→0): камера встаёт в неподвижную центрированную
    // позу, клетка под курсором не уплывает. Отпустил → дыхание плавно возвращается.
    const target = (active && !placing) ? 1 : 0;
    // Вход медленнее (плёнка «разгоняется до скорости»), выход быстрее. Экспоненциальное
    // сглаживание, не зависящее от fps (как updateCameraAnim в camera.js).
    const baseK = active ? 0.06 : 0.0008;
    weight += (target - weight) * (1 - Math.pow(baseK, d));

    // Выход завершён — вернуть РОВНО игровую позу (raycast-расстановка не сдвигается ни на пиксель).
    if (!active && weight < 0.0015) {
      if (!settled) {
        weight = 0;
        camera.position.set(10, 10 + targetY, 10);
        camera.lookAt(0, targetY, 0);
        camera.zoom = getBaseZoom();
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        settled = true;
      }
      return; // в обычной игре цикл сюда заходит и сразу выходит — нулевая стоимость
    }
    settled = false;

    // Дрейф точки внимания: раз в HOLD секунд меняем цель, ЧЕРЕДУЯ предмет и центр —
    // камера ненадолго наклоняется к окну/прибору/коту и возвращается домой, в центр.
    let tx = 0, tz = 0;
    if (active) {
      switchT += d;
      if (switchT >= HOLD) {
        switchT = 0;
        if (getFocusAnchors) objects = getFocusAnchors() || [];
        if (goCenter || objects.length === 0) {
          curTarget = { x: 0, z: 0 };   // возврат в центр
          goCenter = false;
        } else {
          curTarget = objects[objIdx % objects.length]; // наклон к следующему предмету
          objIdx = (objIdx + 1) % objects.length;
          goCenter = true;
        }
      }
      tx = Math.max(-1.0, Math.min(1.0, curTarget.x * DRIFT));
      tz = Math.max(-1.0, Math.min(1.0, curTarget.z * DRIFT));
    }
    // плавная наводка взгляда к цели (медленно, ~3 c) — экспоненциальное сглаживание
    const pk = 1 - Math.pow(0.7, d);
    pivot.x += (tx - pivot.x) * pk;
    pivot.z += (tz - pivot.z) * pk;

    const w = weight;
    const az = A0 + A_ORBIT * Math.sin(time / 29.0) * w;       // орбита (азимут) → параллакс
    const bob = A_BOB * Math.sin(time / 23.5) * w;             // оседание кадра без наклона
    const px = pivot.x * w, pz = pivot.z * w;                  // пан к точке внимания (×weight)
    camera.position.set(R * Math.cos(az) + px, 10 + targetY + bob, R * Math.sin(az) + pz);
    camera.lookAt(px, targetY + bob, pz);                      // сдвиг eye+target = чистый пан, угол тот же
    const zMul = 1 + A_ZOOM * w * (0.6 * Math.sin(time / 17.3) + 0.4 * Math.sin(time / 41.0));
    camera.zoom = getBaseZoom() * zMul;                        // пишем зум ПОСЛЕДНИМ за кадр (без наезда — рама не мелькает)
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    if (active) updateOsd(time);
  }

  return { enter, exit, update, isActive: () => active, setPlacing };
}
