// items.js — 3D-модели предметов из примитивов Three.js (стиль PS1).
// Параметры предметов (размер в клетках, уют, количество) — в data/items.json.
// Здесь только геометрия. Каждая модель центрирована по своей площади,
// низ на полу (y=0); занимает size[0]×size[1] клеток (1 клетка = 1 юнит).

import * as THREE from 'three';

// Общий материал с текстурой, если файл есть, и цветом-заглушкой, если нет.
// Игра не ждёт текстур: положил файл в textures/ — материал «оделся» сам.
function texturedMaterial(url, fallbackColor, warnName) {
  const material = new THREE.MeshLambertMaterial({ color: fallbackColor });
  new THREE.TextureLoader().load(
    url,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture;
      material.color.set(0xffffff); // белый, чтобы не тонировать текстуру
      material.needsUpdate = true;
    },
    undefined,
    () => console.warn(`Текстура не найдена (${url}) — ${warnName} пока цветом.`)
  );
  return material;
}

// Общие материалы мебели (текстуры волокон/фактуры делают заметным и поворот)
const woodMaterial = texturedMaterial('textures/wood_light.jpg', 0x9c6b30, 'дерево');
const plasticMaterial = texturedMaterial('textures/plastic_dark.jpg', 0x35353c, 'пластик');
const metalMaterial = texturedMaterial('textures/metal_brushed.jpg', 0x8a8c94, 'металл');
// Узор ковра: маппится на верх ковра один-в-один (не повторяется)
const rugPatternMaterial = texturedMaterial('textures/rug_pattern.jpg', 0xb05a40, 'узор ковра');

// Палитра остальных материалов (советские приглушённые тона)
const COLORS = {
  fabric: 0x5a7a5a,      // зелёная обивка кресел
  cushion: 0x6f936f,     // подушка кресла посветлее
  mattress: 0xcfc4a6,    // матрас
  pillow: 0xeae4d2,      // подушка кровати
  blanket: 0x7a3a3a,     // одеяло
  rug: 0x8a3030,         // ковёр бордовый
  rugBorder: 0xb05a40,   // кайма ковра
  dark: 0x35353c,        // тёмный пластик/корпуса
  panel: 0x55555e,       // светлее тёмного (панели техники)
  screen: 0x16243d,      // экран ТВ
  metal: 0x8a8c94,       // металл (ножка торшера)
  lampshade: 0xe0a060,   // абажур
  terracotta: 0x9e5a3a,  // горшок
  leaf: 0x3f7a3f,        // листья
  bloom: 0xc04545,       // цветок
  glass: 0x7ab0c8,       // стекло аквариума
  water: 0x3a6a8a,       // вода
  fish: 0xd97a30,        // рыбка
};

// Вспомогалка: бокс с материалом в позиции (x, y, z)
function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

// === Табурет 1×1: сиденье + 4 ножки ===
export function createStool() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.12, 0.7, woodMaterial, 0, 0.51, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.add(box(0.09, 0.45, 0.09, woodMaterial, sx * 0.26, 0.225, sz * 0.26));
  }
  return g;
}

// === Кровать 1×2: рама, матрас, подушка, одеяло, спинка ===
export function createBed() {
  const g = new THREE.Group();
  g.add(box(0.92, 0.3, 1.92, woodMaterial, 0, 0.15, 0));
  g.add(box(0.84, 0.14, 1.8, lambert(COLORS.mattress), 0, 0.37, 0));
  g.add(box(0.6, 0.1, 0.4, lambert(COLORS.pillow), 0, 0.49, -0.65));
  g.add(box(0.86, 0.07, 1.0, lambert(COLORS.blanket), 0, 0.47, 0.4));
  g.add(box(0.92, 0.45, 0.07, woodMaterial, 0, 0.5, -0.93));
  return g;
}

// === Кресло 1×1: база, спинка, подлокотники, подушка ===
export function createArmchair() {
  const g = new THREE.Group();
  const fabric = lambert(COLORS.fabric);
  g.add(box(0.8, 0.34, 0.8, fabric, 0, 0.17, 0));
  g.add(box(0.8, 0.52, 0.2, fabric, 0, 0.6, -0.3));
  g.add(box(0.18, 0.26, 0.62, fabric, -0.31, 0.47, 0.05));
  g.add(box(0.18, 0.26, 0.62, fabric, 0.31, 0.47, 0.05));
  g.add(box(0.44, 0.1, 0.5, lambert(COLORS.cushion), 0, 0.39, 0.05));
  return g;
}

// === Стол 2×1: столешница + 4 ножки ===
export function createTable() {
  const g = new THREE.Group();
  g.add(box(1.84, 0.08, 0.84, woodMaterial, 0, 0.74, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.add(box(0.09, 0.7, 0.09, woodMaterial, sx * 0.82, 0.35, sz * 0.33));
  }
  return g;
}

// === Сервант «стенка» 3×1: корпус, две дверцы, стеклянная секция ===
export function createCupboard() {
  const g = new THREE.Group();
  g.add(box(2.84, 1.9, 0.8, woodMaterial, 0, 0.95, 0));
  const door = lambert(0xb98a4e);
  g.add(box(0.85, 0.8, 0.04, door, -0.95, 0.55, 0.41));
  g.add(box(0.85, 0.8, 0.04, door, 0.95, 0.55, 0.41));
  g.add(box(0.9, 0.65, 0.04, lambert(COLORS.glass, { transparent: true, opacity: 0.45 }), 0, 1.45, 0.41));
  return g;
}

// === Тумба под ТВ 1×1 (поверхность: на неё можно ставить телевизор/магнитофон) ===
export function createTVStand() {
  const g = new THREE.Group();
  g.add(box(0.8, 0.42, 0.56, woodMaterial, 0, 0.21, 0));
  return g;
}

// === Телевизор 1×1 (низ на y=0 — может стоять на полу или на поверхности) ===
export function createTV() {
  const g = new THREE.Group();
  g.add(box(0.6, 0.46, 0.44, plasticMaterial, 0, 0.23, 0));
  g.add(box(0.48, 0.34, 0.03, lambert(COLORS.screen, { emissive: 0x101c30 }), 0, 0.24, 0.235));
  return g;
}

// === Ковёр на пол 3×2: плоский, мебель можно ставить сверху (layer: rug) ===
export function createFloorRug() {
  const g = new THREE.Group();
  g.add(box(2.86, 0.04, 1.86, lambert(COLORS.rug), 0, 0.02, 0));
  g.add(box(2.5, 0.02, 1.5, rugPatternMaterial, 0, 0.045, 0));
  return g;
}

// === Ковёр на стену 3×1 (повесим в следующем обновлении, модель готова) ===
export function createWallRug() {
  const g = new THREE.Group();
  g.add(box(2.7, 1.5, 0.05, lambert(COLORS.rug), 0, 0.75, 0));
  g.add(box(2.3, 1.1, 0.03, rugPatternMaterial, 0, 0.75, 0.02));
  return g;
}

// === Торшер 1×1: основание, металлическая стойка, абажур ===
export function createFloorLamp() {
  const g = new THREE.Group();
  g.add(box(0.4, 0.06, 0.4, plasticMaterial, 0, 0.03, 0));
  g.add(box(0.06, 1.32, 0.06, metalMaterial, 0, 0.72, 0));
  g.add(box(0.46, 0.34, 0.46, lambert(COLORS.lampshade, { emissive: 0x6a4a20 }), 0, 1.52, 0));
  return g;
}

// === Кассетный магнитофон 1×1 (низ на y=0 — пол или поверхность) ===
export function createTapePlayer() {
  const g = new THREE.Group();
  g.add(box(0.66, 0.22, 0.34, plasticMaterial, 0, 0.11, 0));
  g.add(box(0.56, 0.14, 0.03, lambert(COLORS.panel), 0, 0.12, 0.18));
  g.add(box(0.1, 0.1, 0.02, lambert(0x222228), -0.15, 0.12, 0.2));
  g.add(box(0.1, 0.1, 0.02, lambert(0x222228), 0.15, 0.12, 0.2));
  return g;
}

// === Аквариум на тумбе 1×1 ===
export function createAquarium() {
  const g = new THREE.Group();
  g.add(box(0.8, 0.5, 0.55, woodMaterial, 0, 0.25, 0));
  g.add(box(0.72, 0.45, 0.42, lambert(COLORS.glass, { transparent: true, opacity: 0.35 }), 0, 0.73, 0));
  g.add(box(0.66, 0.3, 0.36, lambert(COLORS.water, { transparent: true, opacity: 0.7 }), 0, 0.68, 0));
  g.add(box(0.1, 0.06, 0.04, lambert(COLORS.fish), 0.1, 0.7, 0));
  return g;
}

// === Горшок с цветком 1×1 ===
export function createFlowerPot() {
  const g = new THREE.Group();
  g.add(box(0.3, 0.28, 0.3, lambert(COLORS.terracotta), 0, 0.14, 0));
  g.add(box(0.05, 0.45, 0.05, lambert(COLORS.leaf), 0, 0.5, 0));
  g.add(box(0.34, 0.06, 0.12, lambert(COLORS.leaf), 0, 0.62, 0));
  g.add(box(0.12, 0.06, 0.34, lambert(COLORS.leaf), 0, 0.68, 0));
  g.add(box(0.13, 0.13, 0.13, lambert(COLORS.bloom), 0, 0.78, 0));
  return g;
}

// Реестр моделей: ключ — поле "model" из data/items.json.
// Новый предмет = запись в JSON + (если нужна новая форма) функция здесь.
export const MODEL_BUILDERS = {
  stool: createStool,
  bed: createBed,
  armchair: createArmchair,
  table: createTable,
  cupboard: createCupboard,
  tv: createTV,
  tv_stand: createTVStand,
  floor_rug: createFloorRug,
  wall_rug: createWallRug,
  floor_lamp: createFloorLamp,
  tape_player: createTapePlayer,
  aquarium: createAquarium,
  flower_pot: createFlowerPot,
};
