// items.js — 3D-модели предметов из примитивов Three.js (стиль PS1).
// Параметры предметов (размер в клетках, уют, количество) — в data/items.json.
// Здесь только геометрия. Каждая модель центрирована по своей площади,
// низ на полу (y=0); занимает size[0]×size[1] клеток (1 клетка = 1 юнит).

import * as THREE from 'three';

// Общий материал с текстурой, если файл есть, и цветом-заглушкой, если нет.
// Игра не ждёт текстур: положил файл в textures/ — материал «оделся» сам.
function texturedMaterial(url, fallbackColor, warnName) {
  const material = new THREE.MeshLambertMaterial({ color: fallbackColor });
  // Цвет для иконки в панели: там текстуру заменяем сплошным цветом (в 56px она
  // читалась бы как шум), поэтому запоминаем родной цвет-заглушку материала.
  material.userData.iconColor = fallbackColor;
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
// Орех — отдельный тёмный класс дерева. Пока только у серванта; позже можно
// присвоить и другим «статусным» предметам (новый предмет = указать этот материал).
const walnutMaterial = texturedMaterial('textures/wood_walnut.jpg', 0x7a4028, 'орех');
const plasticMaterial = texturedMaterial('textures/plastic_dark.jpg', 0x35353c, 'пластик');
const metalMaterial = texturedMaterial('textures/metal_brushed.jpg', 0x8a8c94, 'металл');
// Узор ковра: маппится на верх ковра один-в-один (не повторяется)
const rugPatternMaterial = texturedMaterial('textures/rug_pattern.jpg', 0xb05a40, 'узор ковра');
// Ткани: обивка кресла (оливковая рогожка), плед-одеяло, постельный тик
const fabricMaterial = texturedMaterial('textures/fabric_green.jpg', 0x8a875a, 'обивка');
const blanketMaterial = texturedMaterial('textures/bedspread_pattern.jpg', 0x7a3a2e, 'плед');
const linenMaterial = texturedMaterial('textures/bed_linen.jpg', 0xe6dfca, 'постель');
// Бетон — для обломков строительного мусора (та же текстура, что на голых стенах)
const concreteMaterial = texturedMaterial('textures/concrete_bare.jpg', 0x9a968e, 'бетон');

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

// Цилиндр — для круглых деталей (верньеры ТВ, динамики, антенны, ручки).
// rx/rz — наклон в радианах (по умолчанию стоит вертикально вдоль Y).
function cyl(radius, h, material, x, y, z, rx = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, h, 12), material);
  mesh.position.set(x, y, z);
  mesh.rotation.x = rx;
  mesh.rotation.z = rz;
  return mesh;
}
// Поворот меша вокруг вертикальной оси (для наваленных обломков мусора)
const rotY = (mesh, a) => { mesh.rotation.y = a; return mesh; };

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
  g.add(box(0.92, 0.3, 1.92, woodMaterial, 0, 0.15, 0));          // рама
  g.add(box(0.84, 0.14, 1.8, linenMaterial, 0, 0.37, 0));         // матрас — тик
  g.add(box(0.6, 0.1, 0.4, linenMaterial, 0, 0.49, -0.65));       // подушка — тик
  g.add(box(0.86, 0.07, 1.0, blanketMaterial, 0, 0.47, 0.4));     // одеяло — плед
  g.add(box(0.92, 0.45, 0.07, woodMaterial, 0, 0.5, -0.93));      // спинка
  return g;
}

// === Кресло 1×1: база, спинка, подлокотники, подушка ===
export function createArmchair() {
  const g = new THREE.Group();
  const fabric = fabricMaterial; // оливковая рогожка
  g.add(box(0.8, 0.34, 0.8, fabric, 0, 0.17, 0));
  g.add(box(0.8, 0.52, 0.2, fabric, 0, 0.6, -0.3));
  g.add(box(0.18, 0.26, 0.62, fabric, -0.31, 0.47, 0.05));
  g.add(box(0.18, 0.26, 0.62, fabric, 0.31, 0.47, 0.05));
  g.add(box(0.44, 0.1, 0.5, fabric, 0, 0.39, 0.05)); // подушка — та же обивка
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

// === Сервант «стенка» 3×1: советская горка ===
// Снизу — тумба с дверцами и ящиками, сверху — застеклённая витрина
// с полками и посудой, по краям карниз и цоколь. Высота ~2.0.
export function createCupboard() {
  const g = new THREE.Group();
  // Корпус серванта — из ореха: локально подменяем материал дерева на ореховый,
  // поэтому весь корпус ниже (woodMaterial) рисуется тёмной текстурой. Остальная
  // мебель в игре по-прежнему светлая — у неё свой woodMaterial.
  const woodMaterial = walnutMaterial;
  // Локальные тона (тёмные акценты — темнее ореха, для контраста с посудой)
  const shadow = lambert(0x3a2014);   // тёмная тень: цоколь, теневые пояски
  const inset = lambert(0x7a4e26);    // утопленная филёнка дверцы
  const back = lambert(0x3a2616);     // тёмный полированный шпон задней стенки (контраст для посуды)
  // Полки и дверцы — стекло. depthWrite:false, чтобы сквозь них была видна
  // посуда вглубь (иначе верхняя полка прятала бы нижние ярусы под изо-углом).
  const shelf = lambert(0xbfe2ee, { transparent: true, opacity: 0.3, depthWrite: false });
  const glass = lambert(0x86a6b4, { transparent: true, opacity: 0.2, depthWrite: false });
  const handle = metalMaterial;

  // --- Цоколь (утоплен, корпус над ним нависает) ---
  g.add(box(2.78, 0.14, 0.74, shadow, 0, 0.07, 0));

  // --- Нижняя тумба ---
  g.add(box(2.84, 0.84, 0.8, woodMaterial, 0, 0.56, 0));
  // Левая и правая дверцы (выступающие накладки + утопленная филёнка + ручка)
  for (const sx of [-1, 1]) {
    const x = sx * 0.947;
    g.add(box(0.88, 0.76, 0.05, woodMaterial, x, 0.56, 0.41));
    g.add(box(0.6, 0.5, 0.03, inset, x, 0.56, 0.4));
    g.add(box(0.04, 0.2, 0.05, handle, x + sx * -0.39, 0.56, 0.45)); // ручка у внутреннего края
  }
  // Центр — два ящика с горизонтальными ручками
  for (const y of [0.4, 0.74]) {
    g.add(box(0.88, 0.32, 0.05, woodMaterial, 0, y, 0.41));
    g.add(box(0.22, 0.04, 0.05, handle, 0, y, 0.45));
  }

  // --- Разделительный поясок (выступает по бокам и вперёд) ---
  g.add(box(2.9, 0.03, 0.84, shadow, 0, 0.985, 0)); // тень-ступень под поясок
  g.add(box(2.94, 0.08, 0.88, woodMaterial, 0, 1.02, 0));

  // --- Верхняя витрина (каркас) ---
  g.add(box(2.78, 0.84, 0.04, back, 0, 1.48, -0.37));   // задняя стенка
  g.add(box(0.06, 0.84, 0.78, woodMaterial, -1.39, 1.48, 0)); // левая боковина
  g.add(box(0.06, 0.84, 0.78, woodMaterial, 1.39, 1.48, 0));  // правая боковина
  g.add(box(0.05, 0.84, 0.74, woodMaterial, 0, 1.48, 0));     // средняя стойка
  g.add(box(2.8, 0.05, 0.78, back, 0, 1.085, 0));             // дно витрины (тёмное — посуда читается)
  g.add(box(2.8, 0.05, 0.78, woodMaterial, 0, 1.875, 0));     // потолок витрины
  g.add(box(2.7, 0.03, 0.74, shelf, 0, 1.3, 0));   // нижняя полка (стекло)
  g.add(box(2.7, 0.03, 0.74, shelf, 0, 1.62, 0));  // верхняя полка (стекло)

  // --- Посуда за стеклом (то, что делает сервант сервантом) ---
  // Полки прозрачные, поэтому видны все три яруса. Тарелки ставим «на ребро»
  // у задней стенки — так они читаются лицом, как в настоящей горке.
  const crystal = lambert(0xeef6f8, { emissive: 0x33444c }); // хрусталь (светится на тёмном фоне)
  // Ярус 1 (дно): фарфоровый сервиз слева, стопка тарелок справа
  g.add(box(0.3, 0.15, 0.2, lambert(0xdfe7ee), -0.65, 1.185, 0.02));    // супница
  g.add(box(0.12, 0.05, 0.12, lambert(0x9a3b3b), -0.65, 1.285, 0.02));  // крышка
  g.add(box(0.26, 0.14, 0.22, lambert(0xeee6d4), 0.7, 1.18, 0));        // стопка тарелок
  g.add(box(0.27, 0.02, 0.23, lambert(0xb04040), 0.7, 1.265, 0));       // верхняя тарелка с каймой
  // Ярус 2 (нижняя полка): ряд хрустальных фужеров слева, графин + рюмки справа
  for (const x of [-1.05, -0.85, -0.65, -0.45]) g.add(box(0.08, 0.26, 0.08, crystal, x, 1.445, 0.04));
  g.add(box(0.18, 0.28, 0.18, crystal, 0.5, 1.455, 0.02));              // графин
  for (const x of [0.82, 1.0]) g.add(box(0.08, 0.18, 0.08, crystal, x, 1.405, 0.06)); // рюмки
  // Ярус 3 (верхняя полка): книги-корешки, ваза с цветком, парадные тарелки на ребре
  const spines = [[-1.05, 0.19, 0xc24a4a], [-0.93, 0.16, 0xd8b050], [-0.81, 0.2, 0x6a90c0], [-0.69, 0.17, 0xcebfa0]];
  for (const [x, h, c] of spines) g.add(box(0.1, h, 0.2, lambert(c), x, 1.635 + h / 2, -0.02));
  g.add(box(0.15, 0.17, 0.15, lambert(0xc09060), -0.38, 1.72, 0.02));   // ваза
  g.add(box(0.1, 0.08, 0.1, lambert(COLORS.bloom), -0.38, 1.81, 0.02)); // цветок
  g.add(box(0.26, 0.2, 0.02, lambert(0xe8dcbc), 0.55, 1.735, -0.28));   // парадная тарелка на ребре
  g.add(box(0.26, 0.2, 0.02, lambert(0xdcc9a0), 0.92, 1.735, -0.28));   // вторая тарелка
  g.add(box(0.1, 0.16, 0.1, crystal, 1.05, 1.715, 0.05));              // вазочка справа

  // --- Стеклянные дверцы витрины + ручки ---
  for (const sx of [-1, 1]) {
    g.add(box(1.28, 0.78, 0.03, glass, sx * 0.7, 1.48, 0.385));
    g.add(box(0.03, 0.14, 0.04, handle, sx * 0.12, 1.46, 0.42));
  }

  // --- Карниз (массивный козырёк) ---
  g.add(box(2.9, 0.04, 0.86, shadow, 0, 1.885, 0)); // теневой поясок под карнизом
  g.add(box(2.96, 0.1, 0.9, woodMaterial, 0, 1.95, 0));
  return g;
}

// === Тумба под ТВ 1×1 (поверхность: на неё можно ставить телевизор/магнитофон) ===
export function createTVStand() {
  const g = new THREE.Group();
  g.add(box(0.8, 0.42, 0.56, woodMaterial, 0, 0.21, 0));
  return g;
}

// === Телевизор 1×1: ламповый ТВ — экран в рамке, верньеры, антенны-усы ===
// (низ на y=0 — может стоять на полу или на тумбе)
export function createTV() {
  const g = new THREE.Group();
  const dark = lambert(0x2a2a30);
  const knob = lambert(0xc8c2b2); // кремовые ручки-верньеры
  // Ножки
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.add(box(0.06, 0.07, 0.06, dark, sx * 0.26, 0.035, sz * 0.17));
  }
  // Корпус (тёмный пластик)
  g.add(box(0.62, 0.4, 0.46, plasticMaterial, 0, 0.27, 0));
  // Экран в тёмной рамке (смещён влево, панель управления — справа)
  g.add(box(0.42, 0.32, 0.02, lambert(0x141418), -0.07, 0.3, 0.235));
  g.add(box(0.36, 0.26, 0.02, lambert(COLORS.screen, { emissive: 0x101c30 }), -0.07, 0.3, 0.245));
  // Панель справа: два верньера (громкость/каналы) + решётка динамика
  g.add(cyl(0.045, 0.03, knob, 0.2, 0.37, 0.235, Math.PI / 2));
  g.add(cyl(0.045, 0.03, knob, 0.2, 0.27, 0.235, Math.PI / 2));
  g.add(box(0.15, 0.12, 0.01, lambert(0x15151a), 0.2, 0.15, 0.235));
  // Антенны-усы (металл, расходятся V назад-вверх)
  g.add(box(0.1, 0.04, 0.1, dark, 0, 0.49, -0.08));
  g.add(cyl(0.012, 0.55, metalMaterial, -0.16, 0.72, -0.14, -0.35, 0.5));
  g.add(cyl(0.012, 0.55, metalMaterial, 0.16, 0.72, -0.14, -0.35, -0.5));
  return g;
}

// === Ковёр на пол 3×2: узор на всю площадь, мебель можно ставить сверху (layer: rug) ===
// Текстура rug_pattern уже содержит кайму — натягиваем на весь ковёр, без подложки.
export function createFloorRug() {
  const g = new THREE.Group();
  g.add(box(2.9, 0.05, 1.9, rugPatternMaterial, 0, 0.025, 0));
  return g;
}

// === Ковёр на стену 3×1.5: узор на всю площадь ===
// ВАЖНО: настенные модели строим с центром в (0,0,0) — placement.js ставит
// position.y = высота центра, и зона коллизий должна совпадать с картинкой.
export function createWallRug() {
  const g = new THREE.Group();
  g.add(box(2.7, 1.5, 0.05, rugPatternMaterial, 0, 0, 0));
  return g;
}

// === Розетка (настенная, двойная): корпус + два тёмных гнезда ===
export function createOutlet() {
  const g = new THREE.Group();
  g.add(box(0.26, 0.26, 0.06, lambert(0xe8e0cc), 0, 0, 0));
  g.add(box(0.07, 0.07, 0.02, lambert(0x2a2a30), -0.06, 0, 0.035));
  g.add(box(0.07, 0.07, 0.02, lambert(0x2a2a30), 0.06, 0, 0.035));
  return g;
}

// === Иконки ремонта (в комнату не ставятся — применяются кликом) ===
// Паркет: плашка дерева
export function createRenoParquet() {
  const g = new THREE.Group();
  g.add(box(0.8, 0.08, 0.5, woodMaterial, 0, 0.04, 0));
  g.add(box(0.74, 0.02, 0.44, lambert(0xb98a4e), 0, 0.09, 0));
  return g;
}

// Обои: стоящий рулон
export function createRenoWallpaper() {
  const g = new THREE.Group();
  g.add(box(0.26, 0.8, 0.26, lambert(0xd8cdb2), 0, 0.4, 0));
  g.add(box(0.3, 0.1, 0.3, lambert(0xb05a40), 0, 0.62, 0));
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

// === Кассетный магнитофон 1×1: переносная магнитола ===
// Динамики по бокам, кассетный отсек, клавиши, ручка для переноски, антенна.
// (низ на y=0 — пол или тумба)
export function createTapePlayer() {
  const g = new THREE.Group();
  const grille = lambert(0x18181c);
  const key = lambert(0xc2bca8); // кремовые клавиши
  // Корпус
  g.add(box(0.72, 0.36, 0.26, plasticMaterial, 0, 0.18, 0));
  // Два динамика по бокам: ободок + решётка + колпачок
  for (const sx of [-1, 1]) {
    g.add(cyl(0.115, 0.012, lambert(0x3a3a40), sx * 0.22, 0.18, 0.128, Math.PI / 2));
    g.add(cyl(0.1, 0.02, grille, sx * 0.22, 0.18, 0.136, Math.PI / 2));
    g.add(cyl(0.028, 0.025, lambert(0x4a4a50), sx * 0.22, 0.18, 0.145, Math.PI / 2));
  }
  // Кассетный отсек (тёмное окошко) + две катушки
  g.add(box(0.22, 0.13, 0.02, lambert(0x2a3038), 0, 0.23, 0.135));
  g.add(cyl(0.03, 0.012, lambert(0x6a6a70), -0.05, 0.23, 0.146, Math.PI / 2));
  g.add(cyl(0.03, 0.012, lambert(0x6a6a70), 0.05, 0.23, 0.146, Math.PI / 2));
  // Ряд клавиш (play/stop/rewind…)
  for (const x of [-0.1, -0.05, 0, 0.05, 0.1]) g.add(box(0.035, 0.05, 0.03, key, x, 0.08, 0.135));
  // Ручка для переноски (П-образная, металл)
  g.add(box(0.46, 0.025, 0.03, metalMaterial, 0, 0.44, 0));
  g.add(box(0.025, 0.1, 0.03, metalMaterial, -0.22, 0.39, 0));
  g.add(box(0.025, 0.1, 0.03, metalMaterial, 0.22, 0.39, 0));
  // Регулятор громкости + телескопическая антенна
  g.add(cyl(0.03, 0.025, key, -0.3, 0.375, 0.05));
  g.add(cyl(0.01, 0.38, metalMaterial, 0.32, 0.52, -0.08, -0.15, -0.35));
  return g;
}

// === Аквариум на тумбе 1×1 (электроприбор) ===
// Полностью кодом: ореховая тумба, стеклянная банка, АНИМИРОВАННАЯ вода (шейдер
// с бегущими каустиками), плавающие рыбки, грунт, водоросли, камни, пузырьки.
// Анимация — через userData.tick(t): game.js зовёт его каждый кадр (как у окна).
export function createAquarium() {
  const g = new THREE.Group();

  // --- Тумба под аквариум (орех) ---
  g.add(box(0.84, 0.46, 0.6, walnutMaterial, 0, 0.23, 0));          // корпус
  g.add(box(0.9, 0.05, 0.64, lambert(0x4a2e18), 0, 0.475, 0));      // крышка-карниз
  g.add(box(0.66, 0.34, 0.02, lambert(0x7a4e26), 0, 0.22, 0.305));  // дверца
  g.add(box(0.04, 0.1, 0.03, metalMaterial, 0.22, 0.22, 0.315));    // ручка

  // Габариты банки (центр по высоте tankY)
  const tankY = 0.74, tankW = 0.78, tankH = 0.48, tankD = 0.5;
  const innerW = tankW - 0.06, innerD = tankD - 0.06;
  const floorY = tankY - tankH / 2;                 // дно банки

  // --- Грунт и камни на дне ---
  g.add(box(innerW, 0.06, innerD, lambert(0x4a3a2c), 0, floorY + 0.03, 0));
  g.add(box(0.12, 0.08, 0.1, lambert(0x6a6660), -0.18, floorY + 0.07, 0.05));
  g.add(box(0.09, 0.06, 0.08, lambert(0x565250), 0.17, floorY + 0.06, -0.06));

  // --- Вода: анимированный шейдер (бегущие каустики + блик у поверхности) ---
  const waterTop = tankY + tankH / 2 - 0.05;        // поверхность чуть ниже верха
  const waterBot = floorY + 0.06;                    // над грунтом
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vP;
      void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float uTime;
      varying vec3 vP;
      void main(){
        float top = smoothstep(-0.18, 0.18, vP.y);          // светлее к поверхности
        vec3 col = mix(vec3(0.05,0.20,0.24), vec3(0.13,0.39,0.42), top);
        // каустики — две бегущие волны
        float c = (sin(vP.x*16.0 + vP.y*7.0 + uTime*1.5)*0.5+0.5)
                * (sin(vP.x*9.0 - vP.z*7.0 - uTime*1.1)*0.5+0.5);
        col += vec3(0.16,0.26,0.24) * c * 0.7;
        // блик у самой поверхности
        float surf = smoothstep(0.12,0.18,vP.y) * (0.5+0.5*sin(vP.x*22.0+uTime*3.0));
        col += vec3(0.5,0.7,0.68) * surf * 0.18;
        gl_FragColor = vec4(col, 0.6);
      }
    `,
  });
  const water = new THREE.Mesh(new THREE.BoxGeometry(innerW, waterTop - waterBot, innerD), waterMat);
  water.position.set(0, (waterTop + waterBot) / 2, 0);
  water.renderOrder = 1;
  g.add(water);

  // --- Водоросли (качаются в tick) ---
  const plantMat = lambert(0x3f6f3a);
  const plants = [];
  for (const [px, ph, pz] of [[-0.22, 0.26, 0.07], [-0.12, 0.34, -0.08], [0.2, 0.3, 0.09], [0.27, 0.22, -0.05]]) {
    const blade = box(0.05, ph, 0.05, plantMat, px, floorY + 0.06 + ph / 2, pz);
    blade.userData.bx = px;
    plants.push(blade);
    g.add(blade);
  }

  // --- Рыбки (тело + хвост + плавник; плавают в tick) ---
  const fishOrange = lambert(0xd9762e, { emissive: 0x331403 });
  const fishPale = lambert(0xc9b85a, { emissive: 0x2a2408 });
  const fishes = [];
  function makeFish(mat) {
    const f = new THREE.Group();
    f.add(box(0.14, 0.08, 0.05, mat, 0, 0, 0));        // тело
    const tail = box(0.06, 0.07, 0.03, mat, -0.1, 0, 0); // хвост
    f.add(tail);
    f.add(box(0.05, 0.05, 0.04, mat, 0.02, 0.06, 0));  // верхний плавник
    f.userData.tail = tail;
    return f;
  }
  for (const p of [
    { mat: fishOrange, speed: 0.7, phase: 0.0, xr: 0.26, y: 0.74, z: 0.06, by: 0.03 },
    { mat: fishOrange, speed: 0.5, phase: 2.1, xr: 0.22, y: 0.66, z: -0.08, by: 0.04 },
    { mat: fishPale, speed: 0.95, phase: 4.0, xr: 0.2, y: 0.81, z: 0.0, by: 0.02 },
  ]) {
    const f = makeFish(p.mat);
    f.userData.p = p;
    fishes.push(f);
    g.add(f);
  }

  // --- Пузырьки (поднимаются и сбрасываются в tick) ---
  const bubbleMat = lambert(0xcfe8ee, { transparent: true, opacity: 0.5, depthWrite: false });
  const bubbles = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.012 + i * 0.003, 6, 6), bubbleMat);
    b.userData.off = i / 4;
    b.renderOrder = 2;
    bubbles.push(b);
    g.add(b);
  }

  // --- Стеклянная банка + рамка + крышка-светильник (поверх воды) ---
  g.add(box(tankW + 0.02, 0.03, tankD + 0.02, lambert(0x2a2a30), 0, tankY + tankH / 2, 0)); // верхний кант
  g.add(box(tankW + 0.02, 0.04, tankD + 0.02, lambert(0x2a2a30), 0, tankY - tankH / 2, 0)); // нижний кант
  g.add(box(tankW, 0.04, tankD, lambert(0x33333a), 0, tankY + tankH / 2 + 0.03, 0));        // крышка
  g.add(box(tankW - 0.08, 0.015, tankD - 0.08, lambert(0xffe8b0, { emissive: 0xffcf80 }), 0, tankY + tankH / 2 + 0.005, 0)); // лампа под крышкой
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(tankW, tankH, tankD),
    lambert(COLORS.glass, { transparent: true, opacity: 0.16, depthWrite: false })
  );
  glass.position.set(0, tankY, 0);
  glass.renderOrder = 3;
  g.add(glass);

  // --- Анимация: game.js зовёт tick(t) каждый кадр ---
  g.userData.tick = (t) => {
    waterMat.uniforms.uTime.value = t;
    for (const f of fishes) {
      const p = f.userData.p;
      const arg = t * p.speed + p.phase;
      f.position.set(Math.sin(arg) * p.xr, p.y + Math.sin(arg * 1.3) * p.by, p.z);
      f.rotation.y = Math.cos(arg) >= 0 ? 0 : Math.PI;        // разворот по ходу
      f.userData.tail.rotation.y = Math.sin(t * 8.0 + p.phase) * 0.5; // виляет хвостом
    }
    for (const bl of plants) bl.rotation.z = Math.sin(t * 1.2 + bl.userData.bx * 5.0) * 0.12;
    for (const b of bubbles) {
      const u = (t * 0.3 + b.userData.off) % 1.0;
      b.position.set(0.24 + Math.sin(u * 6.28 + b.userData.off * 6.0) * 0.015, waterBot + u * (waterTop - waterBot), -0.1);
      b.visible = u < 0.95;
    }
  };

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

// === Куча строительного мусора: обломки бетона, кирпичи, доска ===
function createRubblePile() {
  const g = new THREE.Group();
  const brick = lambert(0x9a4a38);
  g.add(box(0.6, 0.03, 0.5, concreteMaterial, 0, 0.015, 0)); // россыпь/пыль у основания
  // Обломки бетона навалены
  g.add(rotY(box(0.3, 0.2, 0.26, concreteMaterial, -0.05, 0.1, 0.02), 0.2));
  g.add(rotY(box(0.24, 0.16, 0.2, concreteMaterial, 0.18, 0.08, 0.08), -0.4));
  g.add(rotY(box(0.2, 0.14, 0.17, concreteMaterial, -0.16, 0.07, -0.12), 0.6));
  g.add(rotY(box(0.17, 0.12, 0.14, concreteMaterial, 0.04, 0.22, 0.0), 0.3));
  // Кирпичи
  g.add(rotY(box(0.24, 0.1, 0.11, brick, -0.22, 0.05, 0.16), 0.5));
  g.add(rotY(box(0.24, 0.1, 0.11, brick, -0.16, 0.15, 0.13), 0.2));
  // Доска под углом
  g.add(rotY(box(0.55, 0.04, 0.1, woodMaterial, 0.12, 0.04, -0.2), -0.3));
  return g;
}

// Поле мусора: несколько куч по углам и у стен. Каждая куча помечена
// userData.debrisPile — по ней игрок кликает, чтобы убрать (game.js).
export function createDebrisField() {
  const g = new THREE.Group();
  const spots = [
    [-4.3, -3.3, 0.3], [-1.0, -3.4, 1.2], [3.0, -3.3, -0.5],
    [-4.4, 0.5, 0.8], [-4.2, 2.8, 2.0], [2.2, 1.4, -0.8],
  ];
  for (const [x, z, ry] of spots) {
    const pile = createRubblePile();
    pile.position.set(x, 0, z);
    pile.rotation.y = ry;
    pile.userData.debrisPile = true;
    g.add(pile);
  }
  return g;
}

// === Иконка «Вставить окно» (в комнату не ставится — применяется кликом) ===
export function createRenoWindow() {
  const g = new THREE.Group();
  g.add(box(0.46, 0.5, 0.04, lambert(0x42547a), 0, 0.42, 0)); // стекло
  const fr = lambert(0xe2ddd0);
  g.add(box(0.56, 0.06, 0.06, fr, 0, 0.17, 0.01));   // низ рамы
  g.add(box(0.56, 0.06, 0.06, fr, 0, 0.67, 0.01));   // верх рамы
  g.add(box(0.06, 0.56, 0.06, fr, -0.27, 0.42, 0.01)); // левый брус
  g.add(box(0.06, 0.56, 0.06, fr, 0.27, 0.42, 0.01));  // правый брус
  g.add(box(0.04, 0.5, 0.05, fr, 0, 0.42, 0.02));    // переплёт вертикальный
  g.add(box(0.46, 0.04, 0.05, fr, 0, 0.42, 0.02));   // переплёт горизонтальный
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
  outlet: createOutlet,
  reno_parquet: createRenoParquet,
  reno_wallpaper: createRenoWallpaper,
  reno_window: createRenoWindow,
};
