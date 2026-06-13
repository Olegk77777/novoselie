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
  // "Стекло": холодные сумерки за окном. MeshBasic не зависит от света — как будто светится.
  const pane = new THREE.Mesh(
    new THREE.BoxGeometry(WINDOW.to - WINDOW.from, WINDOW.top - WINDOW.bottom, THICKNESS / 4),
    new THREE.MeshBasicMaterial({ color: 0x4a5a8a })
  );
  pane.position.set((WINDOW.from + WINDOW.to) / 2, (WINDOW.bottom + WINDOW.top) / 2, backZ);
  group.add(pane);

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
