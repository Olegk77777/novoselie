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

// Вставляет окно: стекло (большой думерский шейдер за окном) + белая рама с
// переплётом. Вызывается при ремонте (до паркета). Добавляет всё в группу стен.
export function applyWindow(wallsGroup, cols, rows) {
  const backZ = -rows / 2 - THICKNESS / 2;
  const cx = (WINDOW.from + WINDOW.to) / 2;
  const cy = (WINDOW.bottom + WINDOW.top) / 2;
  const w = WINDOW.to - WINDOW.from;
  const h = WINDOW.top - WINDOW.bottom;

  // Стекло — анимированный ShaderMaterial: думерский пейзаж за окном.
  // Сутки идут по кругу (день → закат → ночь → рассвет, 1 сутки = 360 c).
  // Город — три параллакс-слоя панелек с воздушной перспективой (дальние тонут
  // в дымке), тёплые окна-точки ночью. Сезоны меняются каждые 3 суток
  // (осень-листва → зима-вьюга → весна-оттепель → лето-пух, год = 4320 c).
  // Иногда ночь — полнолуние: звёзд не видно, крупная луна с гало и серебряным
  // светом. Сохранены дождь/туман/молнии/капли на стекле (теперь сезонные).
  // Всё выведено из uTime (+ uAspect для круглых форм); game.js крутит uTime.
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
uniform float uAspect;   // ширина/высота окна (~2.31) — чтобы круглое было круглым
varying vec2 vUv;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash1(float n){ return fract(sin(n * 91.37) * 43758.5453); }

// «круглая» дистанция с учётом пропорций окна
float aspDist(vec2 d, float asp){ d.x *= asp; return length(d); }

// =====================================================================
//  СЕЗОНЫ — всё выведено из uTime. Цикл осень->зима->весна->лето.
//  1 сутки = 360 c, 1 сезон = 3 суток, год = 4320 c.
// =====================================================================
const float YEAR_LEN = 4320.0;
const float XFADE    = 0.15;

// окно «floor(si)==k» через две step(), без int==
float seasonIs(float si, float k){
  return step(k, si) * step(si, k + 0.999);
}

// (wAutumn, wWinter, wSpring, wSummer), сумма == 1.0
vec4 seasonWeights(float t){
  float yf = fract(t / YEAR_LEN);
  float si = yf * 4.0;
  float cur = floor(si);
  float fpart = si - cur;
  float blend = smoothstep(1.0 - XFADE, 1.0, fpart);
  float nxt = cur + 1.0;
  nxt = nxt - 4.0 * step(3.5, nxt);   // 4 -> 0 по кругу

  vec4 w = vec4(0.0);
  float cw = 1.0 - blend;
  float nw = blend;
  w.x += seasonIs(cur, 0.0) * cw + seasonIs(nxt, 0.0) * nw; // осень
  w.y += seasonIs(cur, 1.0) * cw + seasonIs(nxt, 1.0) * nw; // зима
  w.z += seasonIs(cur, 2.0) * cw + seasonIs(nxt, 2.0) * nw; // весна
  w.w += seasonIs(cur, 3.0) * cw + seasonIs(nxt, 3.0) * nw; // лето
  float s = w.x + w.y + w.z + w.w;
  return w / max(s, 1e-4);
}

struct SeasonPalette { vec3 skyTint; vec3 hazeCol; vec3 foliageCol; float mood; };

SeasonPalette seasonPalette(vec4 w){
  // осень — охра/бордо, ржавая дымка, тёплый тлен
  vec3 aSky = vec3(0.92, 0.84, 0.74);
  vec3 aHaze= vec3(0.55, 0.42, 0.30);
  vec3 aFol = vec3(0.46, 0.33, 0.16);
  float aMood = 0.94;
  // зима — холодная сталь, молочный горизонт, самый тусклый день
  vec3 wSky = vec3(0.78, 0.84, 0.96);
  vec3 wHaze= vec3(0.70, 0.74, 0.82);
  vec3 wFol = vec3(0.34, 0.37, 0.42);
  float wMood = 0.80;
  // весна — промытое серо-зелёное, первая бледная зелень
  vec3 sSky = vec3(0.86, 0.90, 0.88);
  vec3 sHaze= vec3(0.52, 0.58, 0.55);
  vec3 sFol = vec3(0.34, 0.45, 0.26);
  float sMood = 0.97;
  // лето (приглушённое) — выгоревшее тёплое небо, пыльная марь
  vec3 uSky = vec3(0.90, 0.88, 0.78);
  vec3 uHaze= vec3(0.58, 0.55, 0.44);
  vec3 uFol = vec3(0.33, 0.40, 0.22);
  float uMood = 0.92;

  SeasonPalette p;
  p.skyTint    = aSky*w.x + wSky*w.y + sSky*w.z + uSky*w.w;
  p.hazeCol    = aHaze*w.x + wHaze*w.y + sHaze*w.z + uHaze*w.w;
  p.foliageCol = aFol*w.x + wFol*w.y + sFol*w.z + uFol*w.w;
  p.mood       = aMood*w.x + wMood*w.y + sMood*w.z + uMood*w.w;
  return p;
}

// сдвиг порога dayF: зима темнее/короче, весна/лето длиннее
float seasonDayBias(vec4 w){
  return 0.16*w.y - 0.10*w.z - 0.06*w.w;
}

// =====================================================================
//  СЕЗОННЫЕ ЧАСТИЦЫ
// =====================================================================

// осень: .x маска листвы, .y разброс оттенка (охра<->бордо)
vec3 autumnLeaves(vec2 uv, float t, float asp){
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 3; k++){
    float fk = float(k);
    float depth = 1.0 - fk * 0.30;
    float n = 5.0 + fk * 3.0;
    float fall = t * (0.045 + fk * 0.02);
    float x = uv.x * n;
    float coli = floor(x);
    float seed = hash1(coli + fk * 31.0);
    float yPos = fract(uv.y + fall + seed);
    float spin = 0.6 + 0.4 * sin(t * (1.5 + seed * 2.0) + seed * 12.0); // кувыркание
    float leaf = smoothstep(0.045 * (0.6 + spin*0.4), 0.0,
                  aspDist(vec2((fract(x)-0.5)/n, uv.y - fract(1.0 - yPos)), asp));
    leaf *= step(0.45, seed);
    float m = leaf * depth;
    acc.x = max(acc.x, m);
    acc.y += (seed - 0.5) * m;
  }
  return acc;
}

// зима: .x хлопья, .y молочная мгла (3 слоя для перфоманса iPad)
vec2 winterSnow(vec2 uv, float t, float asp){
  float flakes = 0.0;
  float gust = sin(t * 0.13) * 0.5 + sin(t * 0.37 + 1.7) * 0.25;
  for (int k = 0; k < 3; k++){
    float fk = float(k);
    float depth = 1.0 - fk * 0.22;
    float n = 22.0 + fk * 26.0;
    float speed = 0.06 + fk * 0.05;
    float drift = gust * (0.10 + fk * 0.06);
    vec2 puv = uv;
    puv.x += uv.y * drift + t * drift * 0.6;
    float x = puv.x * n;
    float coli = floor(x);
    float seed = hash1(coli + fk * 71.0);
    float seg = 0.16 + seed * 0.10;
    float ph = fract((puv.y + t * speed * (0.8 + seed)) / seg);
    float fx = fract(x) - 0.5;
    float fl = smoothstep(0.5, 0.0, aspDist(vec2(fx / n, (ph - 0.5) * seg), asp) * (5.0 + fk));
    fl *= step(0.25, seed);
    flakes += fl * depth * (0.8 - fk * 0.12);
  }
  flakes = clamp(flakes, 0.0, 1.0);
  float haze = (0.30 + 0.30 * (0.5 + 0.5 * gust));
  return vec2(flakes, haze);
}

// весна: .x лепестки, .y лёгкая морось
vec2 springPetals(vec2 uv, float t, float asp){
  float petals = 0.0;
  for (int k = 0; k < 2; k++){
    float fk = float(k);
    float depth = 1.0 - fk * 0.35;
    float n = 4.0 + fk * 3.0;
    float fall = t * (0.03 + fk * 0.012);
    float x = uv.x * n;
    float coli = floor(x);
    float seed = hash1(coli + fk * 23.0);
    float yPos = fract(uv.y + fall + seed);
    float sway = sin(uv.y * 5.0 + t * (1.1 + seed) + seed * 9.0) * 0.08;
    float fx = fract(x) - 0.5 - sway * n;
    float p = smoothstep(0.05, 0.0, aspDist(vec2(fx / n, uv.y - (1.0 - yPos)), asp));
    p *= step(0.6, seed);
    petals = max(petals, p * depth);
  }
  float drizzle = 0.0;
  for (int k = 0; k < 2; k++){
    float fk = float(k);
    float nn = 50.0 + fk * 40.0;
    float x = (uv.x + uv.y * 0.10) * nn;
    float coli = floor(x);
    float seed = hash1(coli + fk * 19.0);
    float seg = 0.18 + seed * 0.10;
    float ph = fract((uv.y + t * (0.5 + seed * 0.3)) / seg);
    float fx = fract(x) - 0.5;
    float d = smoothstep(0.5, 0.0, abs(fx)) * smoothstep(0.0, 0.2, ph) * smoothstep(1.0, 0.4, ph);
    d *= step(0.55, seed);
    drizzle += d * (0.4 - fk * 0.12);
  }
  return vec2(petals, clamp(drizzle, 0.0, 1.0));
}

// лето: .x тополиный пух, .y тепловое марево
vec2 summerFluff(vec2 uv, float t, float asp){
  float fluff = 0.0;
  for (int k = 0; k < 3; k++){
    float fk = float(k);
    float depth = 1.0 - fk * 0.28;
    float n = 6.0 + fk * 5.0;
    float driftX = t * (0.012 + fk * 0.006);
    float bob = sin(t * (0.5 + fk * 0.3) + fk) * 0.04;
    vec2 puv = uv;
    puv.x += driftX;
    float x = puv.x * n;
    float coli = floor(x);
    float seed = hash1(coli + fk * 17.0);
    float yBase = fract(seed * 5.0) + bob + sin(t * 0.2 + seed * 6.0) * 0.10;
    float fx = fract(x) - 0.5;
    float f = smoothstep(0.06, 0.0, aspDist(vec2(fx / n, puv.y - yBase), asp));
    f *= step(0.5, seed);
    fluff = max(fluff, f * depth * 0.8);
  }
  // приглушённая пыльная марь — низкая частота, медленная (не скан-линия)
  float heat = smoothstep(0.5, 0.1, uv.y)
             * (0.5 + 0.5 * sin(uv.x * 7.0 + t * 0.6 + sin(uv.y * 12.0) * 0.4));
  return vec2(fluff, clamp(heat, 0.0, 1.0));
}

// зимний иней из углов окна внутрь
float winterFrost(vec2 uv, float t, float asp){
  vec2 c = abs(uv - 0.5) * 2.0;
  float corner = c.x * c.y;
  float edge = hash(floor(uv * vec2(40.0, 18.0)));
  float crawl = 0.55 + 0.20 * sin(t * 0.03);
  float frost = smoothstep(crawl - 0.25, crawl + 0.05, corner + edge * 0.18);
  float vein = smoothstep(0.04, 0.0, abs(fract(uv.x * 22.0 + uv.y * 14.0) - 0.5)) * corner;
  return clamp(frost * 0.9 + vein * 0.25, 0.0, 1.0);
}

// =====================================================================
//  ЛУНА / СОЛНЦE / ЗВЁЗДЫ
// =====================================================================

// решение «полнолуние сегодня?» — стабильно на всю ночь (зависит от floor(t/360))
float fullMoonNight(float t){
  float dayIndex = floor(t / 360.0);
  float r = hash1(dayIndex * 1.731 + 4.20);
  return smoothstep(0.62, 0.72, r);
}

// луна: диск + гало, отдаёт центр (moonPos) и стабильный световой вектор (moonDir)
vec3 moonRender(vec2 uv, float phase, float moonFull, float nightF, float clarity,
                out vec2 moonPos, out vec2 moonDir){
  float TAU = 6.28318;
  // та же угловая скорость, что у солнца, но в противофазе:
  // луна поднимается ночью, заходит днём — полная дуга через всё небо
  float ma = phase * TAU;
  vec2 mp = vec2(0.5 + 0.40 * sin(ma + 3.14159), 0.30 + 0.50 * cos(ma + 3.14159));
  moonPos = mp;

  vec2 d = uv - mp; d.x *= uAspect;
  float r = length(d);

  float rad = mix(0.052, 0.105, moonFull);
  float disc = smoothstep(rad, rad * 0.82, r);

  // вырез серпа на неполных ночах
  vec2 cofs = vec2(0.62, 0.18) * rad * (0.55 + 0.9 * (1.0 - moonFull));
  vec2 dc = (uv - (mp + cofs)); dc.x *= uAspect;
  float carve = smoothstep(rad * 0.985, rad * 0.80, length(dc));
  float lit = clamp(disc - carve * (1.0 - moonFull), 0.0, 1.0);

  // «моря» на диске — низкочастотный шум
  vec2 mg = floor((d + 0.5) * 26.0);
  float m1 = hash(mg);
  float m2 = hash(mg + 13.7);
  float maria = mix(m1, m2, 0.5) * 0.5 + 0.5;
  float seas = mix(0.80, 1.0, smoothstep(0.35, 0.85, maria));
  float limb = mix(0.78, 1.0, smoothstep(rad, rad * 0.2, r));

  vec3 moonCol = mix(vec3(0.78, 0.82, 0.90), vec3(0.92, 0.92, 0.86), moonFull);
  vec3 body = moonCol * seas * limb;

  float haloR = mix(0.16, 0.42, moonFull);
  float halo  = smoothstep(haloR, 0.0, r);
  halo = pow(halo, 1.6);
  float haloAmt = (0.10 + 0.55 * moonFull) * clarity;
  vec3 haloCol = vec3(0.55, 0.66, 0.85);

  vec3 outc = body * lit
            + haloCol * halo * haloAmt * nightF;

  // глобальный световой вектор — смещение луны от центра кадра.
  // Стабилен на весь кадр (не зависит от шейдингового пикселя),
  // поэтому грань-rim города не «щёлкает» по вертикали под луной.
  moonDir = mp - vec2(0.5);
  return outc * nightF;
}

// звёздное поле: 2 слоя + слабый млечный смаз
vec3 starField(vec2 uv, float t){
  float TAU = 6.28318;
  vec3 acc = vec3(0.0);
  for (int L = 0; L < 2; L++){
    float fl = float(L);
    vec2 cells = mix(vec2(58.0, 38.0), vec2(104.0, 66.0), fl);
    vec2 gp = uv * cells;
    vec2 id = floor(gp);
    vec2 fp = fract(gp) - 0.5;
    vec2 jit = (vec2(hash(id + fl * 7.0), hash(id + fl * 19.0)) - 0.5) * 0.8;
    float dst = length(fp - jit);
    float seed = hash(id + fl * 31.0);
    float present = step(mix(0.86, 0.78, fl), seed);
    float bright = (0.35 + 0.65 * hash(id + fl * 53.0)) * mix(1.0, 0.55, fl);
    float core = smoothstep(0.055, 0.0, dst) * present * bright;
    float tw = 0.55 + 0.45 * sin(t * (1.6 + seed * 2.4) + seed * TAU * 6.0);
    vec3 tint = mix(vec3(0.86, 0.90, 1.0), vec3(1.0, 0.90, 0.78), step(0.92, seed));
    acc += tint * core * tw;
  }
  float band = smoothstep(0.55, 0.0, abs((uv.y - 0.62) - (uv.x - 0.5) * 0.35));
  vec2 ng = floor(uv * vec2(40.0, 26.0));
  float milk = (hash(ng) * 0.5 + hash(ng + 5.0) * 0.5);
  milk = smoothstep(0.45, 1.0, milk);
  acc += vec3(0.30, 0.34, 0.42) * band * milk * 0.045;
  return acc;
}

float moonWashAmount(float moonFull, float nightF, float clarity){
  return moonFull * nightF * clarity;
}

// =====================================================================
//  НЕБО + ГОРОД
// =====================================================================

vec3 skyGradient(vec2 uv, float dayF, float nightF, float duskMix,
                 vec3 seasonTint, float moonWash){
  float g = smoothstep(0.0, 1.0, uv.y);
  vec3 night = mix(vec3(0.085,0.090,0.170), vec3(0.020,0.022,0.060), g);
  vec3 day   = mix(vec3(0.700,0.710,0.700), vec3(0.420,0.500,0.620), g);
  vec3 dusk  = mix(vec3(0.960,0.500,0.280), vec3(0.200,0.130,0.330),
                   smoothstep(0.0,0.85,uv.y));
  vec3 col = mix(night, day, dayF);
  col = mix(col, dusk, duskMix*0.75);
  // холодный лунный налёт высоко в ночном небе
  col += vec3(0.10,0.13,0.20) * moonWash * smoothstep(0.20,1.0,uv.y) * 0.35;
  // мягкий сезонный сдвиг палитры
  col = mix(col, col*seasonTint, 0.55);
  return col;
}

// один параллакс-слой панелек -> vec4(rgb, покрытие)
vec4 cityLayer(vec2 uv, float layer, float baseY, float blockW,
               float density, float dayF, float nightF, float duskMix,
               vec3 skyRef, vec3 seasonTint, float snowF, float moonWash,
               float moonDirX){
  float far  = step(layer, 0.5);
  float near = step(1.5, layer);

  float ph  = layer * 0.37;
  float bf  = uv.x/blockW + ph;
  float bi  = floor(bf);
  float fb  = fract(bf);
  float seed = hash(vec2(bi, layer*13.0 + 1.0));
  float seed2= hash(vec2(bi*1.7, layer*5.0 + 9.0));

  float hLow  = 0.16 + 0.06*far;
  float hHigh = mix(0.30, 0.50, near);
  float topY  = baseY + mix(hLow, hHigh, seed);
  float stepTop = topY - (0.03 + 0.05*seed2)*step(0.5, seed2);
  float useStep = step(0.62, hash(vec2(bi, 7.0+layer)));
  float gap = 0.06 + 0.05*far;
  float inBlock = step(gap*0.5, fb) * step(fb, 1.0 - gap*0.5);
  float rightSec = step(0.60, fb);
  float roofY = mix(topY, mix(topY, stepTop, useStep), rightSec);

  float cover = inBlock * step(uv.y, roofY);

  // фасад: брутальный бетон, день/ночь
  vec3 cDark = mix(vec3(0.045,0.045,0.075), vec3(0.085,0.090,0.110), dayF);
  vec3 cLit  = mix(vec3(0.075,0.075,0.105), vec3(0.150,0.155,0.175), dayF);
  float edge = smoothstep(0.5-gap, 0.5, fb);
  vec3 facade = mix(cDark, cLit, edge);
  float vshade = mix(0.78, 1.06, smoothstep(baseY-0.04, roofY, uv.y));
  facade *= vshade;
  facade += vec3(0.18,0.09,0.05) * duskMix * smoothstep(0.6,1.0,fb) * (0.4+0.6*near);

  // горизонтальные межпанельные швы
  float floors = 5.0 + floor(seed*4.0);
  float fy = (uv.y - baseY) / max(roofY - baseY, 0.001);
  float rows = fy * floors;
  float seamY = abs(fract(rows) - 0.5);
  float seam  = smoothstep(0.06, 0.0, seamY) * 0.5;
  facade *= (1.0 - seam*0.30*cover);

  // вертикальные балконные полосы на части блоков
  float hasBalcony = step(0.45, hash(vec2(bi+31.0, layer)));
  float bx2 = abs(fract(fb*3.0) - 0.5);
  float balcony = hasBalcony * smoothstep(0.10,0.0,bx2) * 0.5
                  * step(baseY+0.02, uv.y) * step(uv.y, roofY-0.01);
  facade *= (1.0 - balcony*0.22);

  // окна: мелкая сетка по этажам
  float wcols = 3.0 + near*2.0;
  float wxLocal = (fb - gap*0.5) / (1.0 - gap);
  vec2 wc = vec2(wxLocal*wcols, rows);
  vec2 wcell = floor(wc);
  vec2 wf = fract(wc);
  float pane = step(0.20,wf.x)*step(wf.x,0.80)*step(0.18,wf.y)*step(wf.y,0.78);
  pane *= step(baseY, uv.y) * cover;

  float wseed = hash(wcell + bi*17.0 + layer*3.0);
  float litChance = mix(0.30, 0.62, density) * (0.55 + 0.45*near);
  float lit = step(1.0 - litChance, wseed);
  float flick = 0.92 + 0.08*sin(uTime*1.7 + wseed*40.0);
  // редкий «синий телевизор» — реже и медленнее, чтобы не было строб-эффекта
  float tvWin = step(0.94, hash(wcell + 91.0));
  float tvFlick = 0.6 + 0.4*sin(uTime*3.0 + wseed*12.0);
  vec3 warm = vec3(1.00,0.74,0.38);
  vec3 tv   = vec3(0.40,0.52,0.72);   // приглушённый холодный, в палитре
  vec3 winLight = mix(warm, tv, tvWin);
  float winFlick = mix(flick, tvFlick, tvWin);

  float skyLumDir = smoothstep(0.0,1.0,fb);
  vec3 dayGlass = mix(facade*0.55, skyRef*0.7, 0.35 + 0.25*skyLumDir);
  vec3 nightWin = winLight * winFlick;

  float winNight = lit * nightF * (0.92 - 0.45*far);
  facade = mix(facade, dayGlass, pane*dayF*0.9);
  facade = mix(facade, nightWin, pane*winNight);

  // крыши: мачта-антенна / приземистый бак
  float hasAnt = step(0.55, hash(vec2(bi*2.0+5.0, layer)));
  float mastX  = 0.5 + (seed2-0.5)*0.4;
  float mast   = hasAnt * smoothstep(0.012,0.0,abs(fb-mastX))
                 * step(roofY, uv.y) * step(uv.y, roofY+0.06+0.05*seed2)
                 * (1.0-far);
  float hasTank = step(0.62, hash(vec2(bi+19.0, layer*2.0)));
  float tankX = 0.30 + 0.4*seed;
  vec2 td = vec2((fb-tankX), (uv.y-(roofY+0.018)));
  td.x *= 0.5;
  float tank = hasTank * smoothstep(0.030,0.022,length(td)) * (1.0-far);
  float roofStuff = clamp(max(mast, tank), 0.0, 1.0);
  cover = max(cover, roofStuff);
  facade = mix(facade, mix(cDark,cLit,0.3)*0.7, roofStuff);

  // зимний снег на карнизах/подоконниках
  vec3 snowCol = mix(vec3(0.78,0.80,0.86), vec3(0.30,0.33,0.45), nightF);
  float roofCap = smoothstep(0.022,0.0, roofY - uv.y) * cover;
  float sill = step(0.78, wf.y) * pane;
  float snowMask = clamp(max(roofCap*0.9, sill*0.5), 0.0, 1.0) * snowF;
  facade = mix(facade, snowCol, snowMask);
  facade += vec3(0.06,0.08,0.12) * moonWash * roofCap * near;

  // лунный rim на грани, обращённой к луне (стабильный световой вектор)
  float moonFace = (moonDirX < 0.0)
        ? smoothstep(gap, 0.0, fb)
        : smoothstep(1.0-gap, 1.0, fb);
  float rimEdge = max(roofCap, moonFace * cover);
  facade += vec3(0.50,0.60,0.80) * rimEdge * moonWash * 0.30 * near;

  // воздушная перспектива — главный лекарь от «картона»
  float hazeAmt = mix(0.62, 0.10, layer*0.5);
  hazeAmt += 0.10*smoothstep(baseY+0.10, baseY, uv.y);
  hazeAmt += 0.06*duskMix;
  vec3 hazeCol = mix(skyRef, skyRef*seasonTint, 0.5);
  facade = mix(facade, hazeCol, clamp(hazeAmt,0.0,0.92));

  return vec4(facade, cover);
}

// провода ЛЭП с провисанием + наклонный столб
float powerLines(vec2 uv, float baseY){
  float yA = baseY + 0.26;
  float yB = baseY + 0.33;
  // парабола катенарии, аргумент зажат в [0,1] — провод всегда провисает вниз
  float tA = clamp(abs(uv.x-0.5)*2.0, 0.0, 1.0);
  float tB = clamp(abs(uv.x-0.42)*2.0, 0.0, 1.0);
  float sagA = 0.045 * (1.0 - tA*tA);
  float sagB = 0.035 * (1.0 - tB*tB);
  float w1 = smoothstep(0.0040,0.0, abs(uv.y - (yA - sagA)));
  float w2 = smoothstep(0.0032,0.0, abs(uv.y - (yB - sagB)));
  float poleX = 0.78;
  float pole = smoothstep(0.010,0.0, abs(uv.x - (poleX + (uv.y-baseY)*0.04)))
               * step(baseY-0.02, uv.y) * step(uv.y, yB+0.06);
  float arm = smoothstep(0.006,0.0, abs(uv.y - (yB+0.02)))
              * step(poleX-0.05, uv.x) * step(uv.x, poleX+0.05);
  return clamp(max(max(w1*0.75, w2*0.6), max(pole*0.85, arm*0.7)), 0.0, 1.0);
}

// компоновщик города: 3 слоя дальний->ближний + провода
vec3 cityscape(vec2 uv, vec3 col, float dayF, float nightF, float duskMix,
               vec3 seasonTint, float snowF, float moonWash, float moonDirX){
  vec3 skyRef = col;

  vec4 L0 = cityLayer(uv, 0.0, 0.26, 0.085, 0.30,
                      dayF,nightF,duskMix, skyRef, seasonTint, snowF, moonWash, moonDirX);
  col = mix(col, L0.rgb, L0.a);

  vec4 L1 = cityLayer(uv, 1.0, 0.195, 0.135, 0.55,
                      dayF,nightF,duskMix, skyRef, seasonTint, snowF, moonWash, moonDirX);
  col = mix(col, L1.rgb, L1.a);

  vec4 L2 = cityLayer(uv, 2.0, 0.125, 0.230, 0.80,
                      dayF,nightF,duskMix, skyRef, seasonTint, snowF, moonWash, moonDirX);
  col = mix(col, L2.rgb, L2.a);

  float wires = powerLines(uv, 0.125);
  col = mix(col, vec3(0.030,0.030,0.050), wires*0.75);
  return col;
}

// =====================================================================
//  ПЕЙЗАЖ ЗА ОКНОМ (преломляется каплями: scene(uv+refr,...))
// =====================================================================
vec3 scene(vec2 uv, float phase, float dayF, float nightF, float duskMix,
           float clarity, SeasonPalette pal, float snowF, float moonFull){
  float TAU = 6.28318;

  float moonWash = moonWashAmount(moonFull, nightF, clarity);

  // небо
  vec3 col = skyGradient(uv, dayF, nightF, duskMix, pal.skyTint, moonWash);

  // лунный амбиент — серебряная ванна всей ночной сцены
  col += vec3(0.10, 0.13, 0.20) * moonWash * (0.35 + 0.65 * smoothstep(0.0,1.0,uv.y));

  // звёзды — гаснут в полнолуние и в тучах (compute только ночью)
  if (nightF > 0.01){
    vec3 stars = starField(uv, uTime);
    col += stars * nightF * clarity * (1.0 - moonFull);
  }

  // солнце — только днём
  float ang = phase * TAU;
  vec2 sp = vec2(0.5 + 0.42*sin(ang), 0.32 + 0.52*cos(ang));
  float ds = distance((uv - sp) * vec2(1.0, 0.9), vec2(0.0));
  vec3 sunCol = vec3(1.0, 0.92, 0.74);
  col += sunCol * smoothstep(0.30, 0.0, ds) * 0.22 * clarity * dayF;
  col  = mix(col, sunCol, smoothstep(0.05, 0.035, ds) * clarity * dayF);

  // луна — только ночью
  vec2 moonPos; vec2 moonDir;
  col += moonRender(uv, phase, moonFull, nightF, clarity, moonPos, moonDir);

  // город (3 слоя + провода, своя воздушная перспектива и снег на крышах)
  col = cityscape(uv, col, dayF, nightF, duskMix, pal.skyTint, snowF, moonWash, moonDir.x);

  // дальняя зелень/листва у горизонта — узкая полоса НИЖЕ ближних домов,
  // чтобы не замыливать фасады; видна в основном днём
  float folBand = smoothstep(0.10, 0.0, abs(uv.y - 0.105)) * smoothstep(0.0, 0.05, uv.y);
  col = mix(col, mix(col, pal.foliageCol, 0.45), folBand * 0.35 * dayF);

  // дымка у горизонта — сезонный hazeCol
  float haze = smoothstep(0.45, 0.16, uv.y) * smoothstep(0.0, 0.16, uv.y);
  col = mix(col, mix(pal.hazeCol, pal.hazeCol*mix(1.0,0.35,nightF), nightF), haze*0.35);

  // лунное отражение — слабая серебряная полоса низко под луной
  float reflX = abs((uv.x - moonPos.x) * uAspect);
  float refl  = smoothstep(0.10, 0.0, reflX)
              * smoothstep(0.40, 0.12, uv.y) * smoothstep(0.0, 0.10, uv.y);
  col += vec3(0.55, 0.66, 0.85) * refl * moonWash * 0.18;

  return col;
}

// косой дождь-струи за стеклом (3 слоя для глубины)
float rainFall(vec2 uv, float t){
  uv.x += uv.y * 0.16;
  float acc = 0.0;
  for (int k = 0; k < 3; k++){
    float fk = float(k);
    float n = 70.0 + fk * 46.0;
    float x = uv.x * n;
    float coli = floor(x);
    float fx = fract(x) - 0.5;
    float seed = hash1(coli + fk * 57.0);
    float speed = (0.55 + seed * 0.5) * (1.0 + fk * 0.45);
    float seg = 0.10 + seed * 0.10;
    float ph = fract((uv.y + t * speed) / seg);
    float drop = smoothstep(0.5, 0.0, abs(fx))
               * smoothstep(0.0, 0.14, ph) * smoothstep(1.0, 0.35, ph);
    drop *= step(0.30, seed);
    acc += drop * (0.65 - fk * 0.13);
  }
  return clamp(acc, 0.0, 1.0);
}

void main() {
  float t = uTime;
  float TAU = 6.28318;
  vec2 uv = vUv;

  // (1) сезоны — задают всё ниже
  vec4 sw = seasonWeights(t);
  SeasonPalette pal = seasonPalette(sw);
  float snowF = sw.y;

  // (2) сутки, сдвинутые по сезону (зимой темнее/короче).
  // sunDay = sun + DAY_BIAS — смещаем «солнце» вверх, чтобы ДЕНЬ был длиннее НОЧИ
  // (день ~48%, ночь ~34%). Позиции солнца/луны считаются по phase и не меняются.
  float phase = fract(t / 360.0);
  float sun = cos(phase * TAU);
  float sunDay = sun + 0.4;
  float bias = seasonDayBias(sw);
  float dayF = smoothstep(-0.08 + bias, 0.45 + bias, sunDay);
  float nightF = 1.0 - dayF;
  float duskMix = smoothstep(0.55, 0.0, abs(sunDay));

  // (3) погодный цикл — тайминг прежний, смысл переосмыслен по сезону
  float wc = fract(t / 110.0);
  float rainRaw = smoothstep(0.34, 0.44, wc) * smoothstep(0.66, 0.56, wc);
  float wetW = smoothstep(0.32, 0.44, wc) * smoothstep(0.78, 0.60, wc);
  float fog  = smoothstep(0.18, 0.34, wc) * smoothstep(0.82, 0.64, wc);

  float snowfall = rainRaw * sw.y;               // зима: окно дождя -> снегопад
  float rainKeep = rainRaw * (sw.x + sw.z*0.6);  // осень — полный дождь, весна — мягче
  float drizzleW = rainRaw * sw.z;               // весна: лёгкая морось
  float rain = rainKeep;                         // струи: зима/лето подавлены
  float cloud = clamp(max(rain, fog), 0.0, 1.0) * (1.0 - 0.4*sw.w); // лето яснее
  float clarity = 1.0 - 0.9 * cloud;

  // (4) сезонное полнолуние (стабильно на ночь)
  float moonFull = fullMoonNight(t);

  // (5) капли на стекле — только осень+весна; зимой иней, летом сухо
  wetW *= (sw.x + sw.z);

  vec2 refr = vec2(0.0);
  float spec = 0.0;
  float wet = 0.0;

  // капли считаем только пока стекло мокрое — экономия для iPad
  if (wetW > 0.001){
    // стекающие подтёки
    for (int i = 0; i < 8; i++){
      float fi = float(i);
      float s1 = hash1(fi * 12.9 + 0.5);
      float s2 = hash1(fi * 4.7 + 1.3);
      float colX = fract(s1 * 7.3);
      float speed = 0.04 + s2 * 0.09;
      float headY = 1.0 - fract(s1 * 3.1 + t * speed);
      float sway = sin((1.0 - headY) * 9.0 + s1 * 30.0) * 0.010;
      float dxw = uv.x - colX - sway;
      float dx = dxw * uAspect;
      float dyH = uv.y - headY;
      float head = smoothstep(0.05, 0.0, sqrt(dx*dx + dyH*dyH));
      float above = uv.y - headY;
      float trail = smoothstep(0.016, 0.0, abs(dx))
                  * smoothstep(0.0, 0.03, above) * smoothstep(0.5, 0.0, above);
      float d = max(head, trail * 0.65);
      refr -= vec2(dxw, dyH) * head * 0.5;
      refr.x -= dxw * trail * 0.25;
      spec += smoothstep(0.03, 0.0, sqrt((dx+0.012)*(dx+0.012) + (dyH-0.012)*(dyH-0.012))) * head;
      wet = max(wet, d);
    }

    // россыпь мелких капель — «запотевшее» стекло
    vec2 q = vec2(uv.x * uAspect, uv.y) * 24.0;
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    vec2 jit = (vec2(hash(id), hash(id + 7.1)) - 0.5) * 0.7;
    float dd = length(f - jit);
    float sz = 0.16 + 0.16 * hash(id + 3.3);
    float md = smoothstep(sz, sz * 0.35, dd);
    md *= smoothstep(-0.2, 0.5, sin(t * 0.22 + hash(id + 1.9) * TAU));
    refr -= (f - jit) * md * 0.015;
    spec += smoothstep(sz * 0.5, 0.0, length((f - jit) + vec2(0.05, -0.05))) * md * 0.6;
    wet = max(wet, md * 0.6);

    // капли только пока сыро
    refr *= wetW; spec *= wetW; wet *= wetW;
  }

  // (6) пейзаж, преломлённый каплями
  vec3 col = scene(uv + refr, phase, dayF, nightF, duskMix, clarity, pal, snowF, moonFull);

  // пасмурность во время дождя
  vec3 overcast = mix(pal.hazeCol*0.5, vec3(0.08,0.08,0.12), nightF);
  col = mix(col, overcast, rain * 0.4);

  // дождь-струи поверх (осень полный, весна мягче)
  float fall = rainFall(uv, t) * rain;
  col += vec3(0.55, 0.60, 0.68) * fall * 0.30;

  // (7) сезонные частицы — каждый слой стоит почти ничего вне сезона
  if (sw.x > 0.01){                              // ОСЕНЬ — листва
    vec3 lf = autumnLeaves(uv, t, uAspect);
    vec3 leafCol = mix(vec3(0.78,0.45,0.12), vec3(0.62,0.18,0.10), 0.5+0.5*lf.y);
    col = mix(col, leafCol, lf.x * sw.x * (0.55 + 0.45*dayF));
  }
  if (sw.y > 0.01){                              // ЗИМА — снег, метель, иней
    vec2 sn = winterSnow(uv, t, uAspect);
    vec3 snowHazeCol = mix(vec3(0.70,0.74,0.82), vec3(0.20,0.22,0.30), nightF);
    col = mix(col, snowHazeCol, sn.y * sw.y * 0.6);
    col += vec3(0.92,0.94,1.0) * (snowfall + sn.x) * sw.y * 0.5;
    float frost = winterFrost(uv, t, uAspect);
    col = mix(col, vec3(0.86,0.90,0.97), frost * sw.y * 0.45);
  }
  if (sw.z > 0.01){                              // ВЕСНА — оттепель: морось + лепестки
    vec2 spr = springPetals(uv, t, uAspect);
    col += vec3(0.55,0.60,0.68) * spr.y * drizzleW * 0.18;
    col = mix(col, vec3(0.95,0.86,0.88), spr.x * sw.z * 0.7);
  }
  if (sw.w > 0.01){                              // ЛЕТО (приглушённое) — марево + пух
    vec2 su = summerFluff(uv, t, uAspect);
    vec3 heatCol = mix(pal.hazeCol, vec3(0.20,0.18,0.16), nightF);
    col = mix(col, heatCol, su.y * sw.w * 0.14 * dayF);
    col = mix(col, vec3(0.94,0.93,0.90), su.x * sw.w * 0.6);
  }

  // туман: молочная пелена (сезонный цвет), гуще у низа
  vec3 fogCol = mix(pal.hazeCol, pal.hazeCol*mix(1.0,0.35,nightF), nightF);
  float fyf = smoothstep(0.85, 0.05, uv.y);
  float swirl = 0.82 + 0.18 * sin(uv.x * 5.0 - t * 0.18 + uv.y * 4.0);
  col = mix(col, fogCol, fog * (0.34 + 0.55 * fyf) * swirl);

  // редкие вспышки молнии — осенью (и чуть весной), зимой/летом почти нет
  float stormSeason = sw.x + sw.z * 0.5;
  float strongRain = smoothstep(0.6, 0.95, rain);
  float ltn = t * 0.16;
  float lseg = floor(ltn);
  float strike = step(0.82, hash1(lseg + 41.0));
  float lph = fract(ltn);
  float flash = strike * exp(-lph * 26.0) * (0.65 + 0.35 * sin(lph * 130.0)) * strongRain * stormSeason;
  float skyHi = 0.45 + 0.6 * smoothstep(0.0, 0.7, uv.y);
  col += vec3(0.72, 0.80, 1.0) * max(flash, 0.0) * skyHi * 0.82;

  // косой блик на стекле (в ливень приглушаем)
  col += vec3(0.6,0.65,0.7) * smoothstep(0.02, 0.0, abs((uv.x - uv.y) + 0.18)) * 0.12 * (1.0 - rain * 0.5);

  // капли — самый ближний слой: тень линзы + яркий блик
  col *= (1.0 - wet * 0.12);
  col += vec3(0.85, 0.9, 1.0) * spec * 0.55;

  // общий сезонный множитель настроения (зима тусклее)
  col *= pal.mood;

  // тонкий дизер против бандинга на 8-битном экране (одна hash, без новых юниформ)
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;

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
