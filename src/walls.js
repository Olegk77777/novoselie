// walls.js — стены комнаты: две дальние (видимые в изометрии), окно и дверной проём.
// Ближние к камере стены не рисуем, чтобы видеть внутрь комнаты — приём всех изо-игр.
// Позиции окна и двери пока константы здесь; при переходе на data/layouts.json переедут в данные.

import * as THREE from 'three';

// Высота стен в юнитах (1 клетка = 1 юнит). Экспортируется для вписывания камеры.
export const WALL_HEIGHT = 2.5;
const THICKNESS = 0.2; // толщина стен
const CONCRETE_COLOR = 0x8f8f88; // голая штукатурка — старт до ремонта
// Один "лист" текстуры обоев покрывает квадрат 2×2 юнита
const WALLPAPER_TILE = 2;
// Один "лист" бетона крупнее (2.5×2.5), чтобы не бросался в глаза повтор
const CONCRETE_TILE = 2.5;

// Окно в дальней стене (z = -rows/2): границы по X и по высоте
const WINDOW = { from: -1.5, to: 1.5, bottom: 0.8, top: 2.1 };
// Дверной проём в левой стене (x = -cols/2): границы по Z и высота проёма.
// Центр проёма (z=2.0) выровнен на полуклеточную сетку, чтобы ковёр и мебель
// вставали ровно по центру входа.
const DOOR = { from: 1.25, to: 2.75, top: 2.1 };
// Центр дверного проёма по мировой оси Z (=2.0) — кот появляется отсюда (cat.js).
// DOOR.from/to заданы в координате «вдоль» левой стены, а это и есть мировой Z.
export const DOOR_CENTER_Z = (DOOR.from + DOOR.to) / 2;

// Описание лицевых поверхностей стен — для размещения настенных предметов (placement.js).
// Координата "along" — положение вдоль стены, "h" — высота от пола.
// cutouts — вырезы (окно, дверь), куда вешать нельзя.
export function getWallSurfaces(cols, rows) {
  const halfW = cols / 2;
  const halfD = rows / 2;
  return [
    {
      id: 'back',          // дальняя стена, идёт вдоль X
      axis: 'x',           // "along" откладывается по мировой оси X
      normalAxis: 'z',     // нормаль (внутрь комнаты) — по оси Z
      plane: -halfD,       // координата лицевой поверхности по нормали
      alongMin: -halfW, alongMax: halfW,
      heightMax: WALL_HEIGHT,
      rotationY: 0,        // поворот модели, чтобы лечь на эту стену
      cutouts: [{ alongMin: WINDOW.from, alongMax: WINDOW.to, hMin: WINDOW.bottom, hMax: WINDOW.top }],
    },
    {
      id: 'left',          // левая стена, идёт вдоль Z
      axis: 'z',
      normalAxis: 'x',
      plane: -halfW,
      alongMin: -halfD, alongMax: halfD,
      heightMax: WALL_HEIGHT,
      rotationY: Math.PI / 2,
      cutouts: [{ alongMin: DOOR.from, alongMax: DOOR.to, hMin: 0, hMax: DOOR.top }],
    },
  ];
}

// Создаёт обе стены, окно и проём; возвращает группу для добавления в сцену
export function createWalls(cols, rows) {
  const group = new THREE.Group();
  const halfW = cols / 2;
  const halfD = rows / 2;

  // Общий материал стен; обои клеятся при ремонте (applyWallpaper)
  const wallMaterial = new THREE.MeshLambertMaterial({ color: CONCRETE_COLOR });

  // Вспомогалка: добавляет кусок стены (бокс) с центром в (x, y, z).
  // texW/texH — размеры лицевой стороны, по ним потом считается повтор обоев.
  function addSegment(w, h, d, x, y, z, texW, texH) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMaterial);
    mesh.position.set(x, y, z);
    mesh.userData.wallpaper = { texW, texH };
    group.add(mesh);
  }

  // === Дальняя стена (вдоль X, у края z = -halfD), с окном ===
  const backZ = -halfD - THICKNESS / 2;
  const backFrom = -halfW - THICKNESS; // заходим за угол, чтобы стены сомкнулись
  const backTo = halfW;
  // Слева от окна
  addSegment(
    WINDOW.from - backFrom, WALL_HEIGHT, THICKNESS,
    (backFrom + WINDOW.from) / 2, WALL_HEIGHT / 2, backZ,
    WINDOW.from - backFrom, WALL_HEIGHT
  );
  // Справа от окна
  addSegment(
    backTo - WINDOW.to, WALL_HEIGHT, THICKNESS,
    (WINDOW.to + backTo) / 2, WALL_HEIGHT / 2, backZ,
    backTo - WINDOW.to, WALL_HEIGHT
  );
  // Под окном
  addSegment(
    WINDOW.to - WINDOW.from, WINDOW.bottom, THICKNESS,
    (WINDOW.from + WINDOW.to) / 2, WINDOW.bottom / 2, backZ,
    WINDOW.to - WINDOW.from, WINDOW.bottom
  );
  // Над окном
  addSegment(
    WINDOW.to - WINDOW.from, WALL_HEIGHT - WINDOW.top, THICKNESS,
    (WINDOW.from + WINDOW.to) / 2, (WINDOW.top + WALL_HEIGHT) / 2, backZ,
    WINDOW.to - WINDOW.from, WALL_HEIGHT - WINDOW.top
  );
  // На старте окна нет — пустой проём (видно тёмный «провал» наружу).
  // Стекло вставляется при ремонте (applyWindow), до укладки паркета.

  // === Левая стена (вдоль Z, у края x = -halfW), с дверным проёмом ===
  const leftX = -halfW - THICKNESS / 2;
  const leftFrom = -halfD - THICKNESS;
  const leftTo = halfD;
  // До проёма
  addSegment(
    THICKNESS, WALL_HEIGHT, DOOR.from - leftFrom,
    leftX, WALL_HEIGHT / 2, (leftFrom + DOOR.from) / 2,
    DOOR.from - leftFrom, WALL_HEIGHT
  );
  // После проёма
  addSegment(
    THICKNESS, WALL_HEIGHT, leftTo - DOOR.to,
    leftX, WALL_HEIGHT / 2, (DOOR.to + leftTo) / 2,
    leftTo - DOOR.to, WALL_HEIGHT
  );
  // Перемычка над проёмом
  addSegment(
    THICKNESS, WALL_HEIGHT - DOOR.top, DOOR.to - DOOR.from,
    leftX, (DOOR.top + WALL_HEIGHT) / 2, (DOOR.from + DOOR.to) / 2,
    DOOR.to - DOOR.from, WALL_HEIGHT - DOOR.top
  );

  // Одеваем голые стены в бетон (до ремонта). Нет файла — остаётся серый цвет.
  applyConcrete(group);

  return group;
}

// Натягивает текстуру бетона на голые стены при старте (по аналогии с обоями:
// каждому сегменту своя копия текстуры с повтором под его размер). Файла нет —
// стены остаются цветом CONCRETE_COLOR, игра не ждёт.
function applyConcrete(wallsGroup) {
  new THREE.TextureLoader().load(
    'textures/concrete_bare.jpg',
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      wallsGroup.children.forEach((mesh) => {
        if (!mesh.userData.wallpaper) return; // только стеновые сегменты (не «стекло» окна)
        const { texW, texH } = mesh.userData.wallpaper;
        const tex = texture.clone();
        tex.repeat.set(texW / CONCRETE_TILE, texH / CONCRETE_TILE);
        mesh.material = new THREE.MeshLambertMaterial({ map: tex });
      });
    },
    undefined,
    () => {} // нет текстуры — остаётся серый CONCRETE_COLOR (стартовый материал)
  );
}

// Вставляет окно: стекло (шейдер — вечернее небо, луна, косые блики) + белая
// рама с переплётом. Вызывается при ремонте (до паркета). Добавляет всё в группу стен.
export function applyWindow(wallsGroup, cols, rows) {
  const backZ = -rows / 2 - THICKNESS / 2;
  const cx = (WINDOW.from + WINDOW.to) / 2;
  const cy = (WINDOW.bottom + WINDOW.top) / 2;
  const w = WINDOW.to - WINDOW.from;
  const h = WINDOW.top - WINDOW.bottom;

  // Стекло — анимированный ShaderMaterial: думерский пейзаж за окном.
  // Сутки идут по кругу (день → закат → ночь с огнями панелек → рассвет).
  // uTime обновляется из game.js в кадровом цикле.
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTime: { value: 0 }, uAspect: { value: w / h } },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uTime;
        uniform float uAspect;   // ширина/высота окна — чтобы капли на стекле были круглыми
        varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float hash1(float n){ return fract(sin(n * 91.37) * 43758.5453); }

        // Думерский пейзаж за окном. Вынесен в функцию, чтобы капли на стекле
        // могли его ПРЕЛОМЛЯТЬ (вызываем scene() со смещёнными uv — эффект линзы).
        vec3 scene(vec2 uv, float phase, float dayF, float nightF, float duskMix, float clarity){
          float TAU = 6.28318;
          // Небо: ночь / день / закат
          float g = smoothstep(0.0, 1.0, uv.y);
          vec3 night = mix(vec3(0.09,0.09,0.18), vec3(0.02,0.02,0.07), g);
          vec3 day   = mix(vec3(0.70,0.71,0.70), vec3(0.42,0.50,0.62), g);
          vec3 dusk  = mix(vec3(0.96,0.50,0.28), vec3(0.20,0.13,0.33), smoothstep(0.0,0.85,uv.y));
          vec3 col = mix(night, day, dayF);
          col = mix(col, dusk, duskMix * 0.75);

          // Звёзды (ночью, мерцают)
          vec2 sg = floor(uv * vec2(70.0, 45.0));
          float sh = hash(sg);
          float star = smoothstep(0.975, 1.0, sh) * (0.6 + 0.4 * sin(uTime * 2.5 + sh * 40.0));
          col += vec3(0.9, 0.92, 1.0) * star * nightF * clarity;  // в тучах звёзд не видно

          // Светило на дуге (солнце днём, луна ночью) + мягкое гало
          float ang = phase * TAU;
          vec2 lp = vec2(0.5 + 0.42 * sin(ang), 0.32 + 0.52 * cos(ang));
          float dl = distance((uv - lp) * vec2(1.0, 0.9), vec2(0.0));
          vec3 discCol = mix(vec3(0.86,0.89,0.97), vec3(1.0,0.92,0.74), dayF);
          col += discCol * smoothstep(0.3, 0.0, dl) * 0.22 * clarity;        // гало гаснет в тучах
          col = mix(col, discCol, smoothstep(0.05, 0.035, dl) * clarity);    // и сам диск солнца/луны

          // Город — силуэты панелек, ночью часть окон горит тёплым
          vec3 cityCol = mix(vec3(0.04,0.04,0.07), vec3(0.11,0.11,0.14), dayF);
          for (int i = 0; i < 7; i++){
            float fi = float(i);
            float bx = fi * 0.145 + 0.01;
            float bw = 0.125;
            float topY = 0.19 + hash(vec2(fi, 3.0)) * 0.20;
            if (uv.x > bx && uv.x < bx + bw && uv.y < topY){
              vec2 wcell = vec2((uv.x - bx) / bw, uv.y / topY) * vec2(4.0, 9.0);
              vec2 wf = fract(wcell);
              float win = step(0.22, wf.x) * step(wf.x, 0.78) * step(0.22, wf.y) * step(wf.y, 0.82);
              float lit = step(0.52, hash(floor(wcell) + fi * 11.0));
              col = mix(cityCol, vec3(1.0, 0.78, 0.40), win * lit * nightF * 0.92);
            }
          }

          // Дымка у горизонта
          float haze = smoothstep(0.45, 0.16, uv.y) * smoothstep(0.0, 0.16, uv.y);
          col = mix(col, mix(vec3(0.5,0.5,0.55), vec3(0.16,0.15,0.22), nightF), haze * 0.35);

          // Провода ЛЭП — две провисающие линии
          col = mix(col, vec3(0.03,0.03,0.05), smoothstep(0.005, 0.0, abs(uv.y - (0.60 + 0.025*sin(uv.x*7.0+1.0)))) * 0.7);
          col = mix(col, vec3(0.03,0.03,0.05), smoothstep(0.004, 0.0, abs(uv.y - (0.66 + 0.02*sin(uv.x*7.0)))) * 0.5);
          return col;
        }

        // Косой дождь-струи за стеклом: 3 слоя для глубины (параллакс).
        // Капля = тонкая вытянутая чёрточка, непрерывно падающая вниз.
        float rainFall(vec2 uv, float t){
          uv.x += uv.y * 0.16;                 // наклон от ветра
          float acc = 0.0;
          for (int k = 0; k < 3; k++){
            float fk = float(k);
            float n = 70.0 + fk * 46.0;        // плотность колонок (дальше — гуще и мельче)
            float x = uv.x * n;
            float coli = floor(x);
            float fx = fract(x) - 0.5;
            float seed = hash1(coli + fk * 57.0);
            float speed = (0.55 + seed * 0.5) * (1.0 + fk * 0.45);
            float seg = 0.10 + seed * 0.10;    // расстояние между каплями в колонке
            float ph = fract((uv.y + t * speed) / seg);   // линия постоянной фазы падает вниз
            float drop = smoothstep(0.5, 0.0, abs(fx))
                       * smoothstep(0.0, 0.14, ph) * smoothstep(1.0, 0.35, ph);
            drop *= step(0.30, seed);          // не все колонки заняты — реже, живее
            acc += drop * (0.65 - fk * 0.13);
          }
          return clamp(acc, 0.0, 1.0);
        }

        void main() {
          float t = uTime;
          float TAU = 6.28318;
          vec2 uv = vUv;

          // --- Фаза суток (как раньше): день → закат → ночь → рассвет ---
          float phase = fract(t / 360.0);
          float sun = cos(phase * TAU);
          float dayF = smoothstep(-0.08, 0.45, sun);
          float nightF = 1.0 - dayF;
          float duskMix = smoothstep(0.55, 0.0, abs(sun));

          // --- Погодный цикл: ясно → туман → дождь → туман → ясно ---
          // Период ~110 c, не кратен суткам (360 c) — дождь застаёт разное время суток.
          // Вне окон дождя/тумана (wc 0..0.18 и 0.82..1.0) — ясно, окно «отдыхает».
          float wc = fract(t / 110.0);
          float rain = smoothstep(0.34, 0.44, wc) * smoothstep(0.66, 0.56, wc);  // ливень в середине цикла
          float wetW = smoothstep(0.32, 0.44, wc) * smoothstep(0.78, 0.60, wc);  // капли держатся дольше дождя
          float fog  = smoothstep(0.18, 0.34, wc) * smoothstep(0.82, 0.64, wc);  // туман шире: раньше приходит, позже тает
          float cloud = clamp(max(rain, fog), 0.0, 1.0);                         // облачность
          float clarity = 1.0 - 0.9 * cloud;                                     // в дождь/туман светило и звёзды гаснут

          // --- Капли на стекле: смещение преломления (refr), блик (spec), мокрость (wet) ---
          vec2 refr = vec2(0.0);
          float spec = 0.0;
          float wet = 0.0;

          // Стекающие подтёки — крупные капли ползут вниз с извилистым следом
          for (int i = 0; i < 8; i++){
            float fi = float(i);
            float s1 = hash1(fi * 12.9 + 0.5);
            float s2 = hash1(fi * 4.7 + 1.3);
            float colX = fract(s1 * 7.3);                       // своя колонка у каждой капли
            float speed = 0.04 + s2 * 0.09;                     // скорость стекания
            float headY = 1.0 - fract(s1 * 3.1 + t * speed);    // голова капли: сверху вниз
            float sway = sin((1.0 - headY) * 9.0 + s1 * 30.0) * 0.010; // лёгкое виляние следа
            float dxw = uv.x - colX - sway;                     // отклонение по X (в uv)
            float dx = dxw * uAspect;                           // то же, но «круглое» (с учётом пропорций)
            float dyH = uv.y - headY;
            float head = smoothstep(0.05, 0.0, sqrt(dx*dx + dyH*dyH));
            float above = uv.y - headY;                         // мокрый след тянется НАД головой (где капля прошла)
            float trail = smoothstep(0.016, 0.0, abs(dx))
                        * smoothstep(0.0, 0.03, above) * smoothstep(0.5, 0.0, above);
            float d = max(head, trail * 0.65);
            refr -= vec2(dxw, dyH) * head * 0.5;                // голова — сильная линза
            refr.x -= dxw * trail * 0.25;                       // след слегка смещает по X
            spec += smoothstep(0.03, 0.0, sqrt((dx+0.012)*(dx+0.012) + (dyH-0.012)*(dyH-0.012))) * head;
            wet = max(wet, d);
          }

          // Россыпь мелких капель — «запотевшее» стекло; медленно набухают и сохнут
          vec2 q = vec2(uv.x * uAspect, uv.y) * 24.0;
          vec2 id = floor(q);
          vec2 f = fract(q) - 0.5;
          vec2 jit = (vec2(hash(id), hash(id + 7.1)) - 0.5) * 0.7;  // случайный сдвиг центра в клетке
          float dd = length(f - jit);
          float sz = 0.16 + 0.16 * hash(id + 3.3);
          float md = smoothstep(sz, sz * 0.35, dd);
          md *= smoothstep(-0.2, 0.5, sin(t * 0.22 + hash(id + 1.9) * TAU)); // «жизнь» капли
          refr -= (f - jit) * md * 0.015;
          spec += smoothstep(sz * 0.5, 0.0, length((f - jit) + vec2(0.05, -0.05))) * md * 0.6;
          wet = max(wet, md * 0.6);

          // Капли есть, только пока сыро (во время дождя и немного после)
          refr *= wetW; spec *= wetW; wet *= wetW;

          // --- Пейзаж, преломлённый каплями ---
          vec3 col = scene(uv + refr, phase, dayF, nightF, duskMix, clarity);

          // Пасмурность: во время дождя пейзаж сереет (свинцовое небо)
          vec3 overcast = mix(vec3(0.20,0.21,0.24), vec3(0.08,0.08,0.12), nightF);
          col = mix(col, overcast, rain * 0.4);

          // Дождь-струи поверх пейзажа
          float fall = rainFall(uv, t) * rain;
          col += vec3(0.55, 0.60, 0.68) * fall * 0.30;

          // --- Туман: молочная пелена, гуще у низа (стелется), медленно клубится ---
          vec3 fogCol = mix(vec3(0.62,0.63,0.67), vec3(0.17,0.18,0.25), nightF);
          float fy = smoothstep(0.85, 0.05, uv.y);                    // плотнее к горизонту
          float swirl = 0.82 + 0.18 * sin(uv.x * 5.0 - t * 0.18 + uv.y * 4.0);
          col = mix(col, fogCol, fog * (0.34 + 0.55 * fy) * swirl);

          // --- Редкие вспышки молнии во время сильного дождя ---
          // Время бьётся на «слоты» ~6 c; в части слотов случается вспышка.
          float strongRain = smoothstep(0.6, 0.95, rain);
          float lt = t * 0.16;
          float lseg = floor(lt);
          float strike = step(0.82, hash1(lseg + 41.0));          // ~18% слотов — с молнией
          float lph = fract(lt);
          // Двойное мигание: резкий пик + дрожание + быстрый спад
          float flash = strike * exp(-lph * 26.0) * (0.65 + 0.35 * sin(lph * 130.0)) * strongRain;
          float skyHi = 0.45 + 0.6 * smoothstep(0.0, 0.7, uv.y);  // вверху неба ярче
          col += vec3(0.72, 0.80, 1.0) * max(flash, 0.0) * skyHi * 0.82;

          // Косой блик на стекле (в ливень приглушаем, чтобы не спорил со струями)
          col += vec3(0.6,0.65,0.7) * smoothstep(0.02, 0.0, abs((uv.x - uv.y) + 0.18)) * 0.12 * (1.0 - rain * 0.5);

          // Капли на стекле — самый ближний слой, поверх всего: тень линзы + яркий блик
          col *= (1.0 - wet * 0.12);
          col += vec3(0.85, 0.9, 1.0) * spec * 0.55;

          gl_FragColor = vec4(col, 0.93);
        }
      `,
    })
  );
  glass.position.set(cx, cy, backZ + 0.02);
  glass.userData.windowGlass = true;
  wallsGroup.add(glass);

  // Белая крашеная рама + переплёт-крестовина
  const frameMat = new THREE.MeshLambertMaterial({ color: 0xe2ddd0 });
  const fz = backZ + 0.05;
  const bar = (bw, bh, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.1), frameMat);
    m.position.set(x, y, fz);
    m.userData.windowGlass = true;
    wallsGroup.add(m);
  };
  bar(0.08, h + 0.16, WINDOW.from - 0.04, cy); // левый брус
  bar(0.08, h + 0.16, WINDOW.to + 0.04, cy);   // правый брус
  bar(w + 0.16, 0.08, cx, WINDOW.bottom - 0.04); // низ
  bar(w + 0.16, 0.08, cx, WINDOW.top + 0.04);    // верх
  bar(0.06, h, cx, cy); // вертикальная перекладина переплёта
  bar(w, 0.06, cx, cy); // горизонтальная перекладина переплёта
  return glass.material; // game.js крутит ему uTime в кадровом цикле
}

// Клеит обои на стены (вызывается при ремонте из game.js).
// Грузим текстуру один раз, каждому сегменту — своя копия с повтором под его
// размер, чтобы узор был одного масштаба на кусках разной величины.
export function applyWallpaper(wallsGroup) {
  new THREE.TextureLoader().load(
    'textures/wall_wallpaper.jpg',
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      wallsGroup.children.forEach((mesh) => {
        if (!mesh.userData.wallpaper) return;
        const { texW, texH } = mesh.userData.wallpaper;
        const tex = texture.clone();
        tex.repeat.set(texW / WALLPAPER_TILE, texH / WALLPAPER_TILE);
        mesh.material = new THREE.MeshLambertMaterial({ map: tex });
      });
    },
    undefined,
    () => {
      // Нет текстуры — красим в тёплую краску, чтобы было видно, что ремонт сделан
      wallsGroup.children.forEach((mesh) => {
        if (mesh.userData.wallpaper) mesh.material = new THREE.MeshLambertMaterial({ color: 0x9aa07a });
      });
      console.warn('Текстура обоев не найдена (textures/wall_wallpaper.jpg) — стены краской.');
    }
  );
}
