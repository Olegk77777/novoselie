// grid.js — пол комнаты и линии сетки.
// Договорённость по координатам: 1 клетка = 1 юнит Three.js.
// Пол центрирован в начале координат: при сетке 10×8 он занимает
// x от -5 до 5 и z от -4 до 4. Центр клетки (col, row):
// x = -cols/2 + col + 0.5, z = -rows/2 + row + 0.5.

import * as THREE from 'three';

// Создаёт плоскость пола. На старте игры пол — голый серый бетон;
// паркет укладывается во время ремонта (applyParquet).
export function createFloor(cols, rows) {
  const geometry = new THREE.PlaneGeometry(cols, rows);
  const material = new THREE.MeshLambertMaterial({ color: 0x8d8d86 }); // бетон
  const floor = new THREE.Mesh(geometry, material);
  // Плоскость по умолчанию стоит вертикально — кладём её горизонтально
  floor.rotation.x = -Math.PI / 2;
  applyConcreteFloor(floor, cols, rows); // одеваем голый пол в бетон до ремонта
  return floor;
}

// Натягивает бетон на голый пол при старте (повтор, как у паркета). Нет файла —
// остаётся серый цвет 0x8d8d86, игра не ждёт. Та же текстура, что на голых стенах.
function applyConcreteFloor(floor, cols, rows) {
  new THREE.TextureLoader().load(
    'textures/concrete_bare.jpg',
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      // Один «лист» бетона на весь пол — повтор не виден (на полу клоны паттерна
      // бросались в глаза). rows/cols по Z сохраняет квадратные пропорции пятен.
      texture.repeat.set(1, rows / cols);
      floor.material.map = texture;
      floor.material.color.set(0xffffff); // белый, чтобы не тонировать текстуру
      floor.material.needsUpdate = true;
    },
    undefined,
    () => {} // нет текстуры — остаётся серый цвет (стартовый материал)
  );
}

// Укладывает паркет на пол (вызывается при ремонте из game.js)
export function applyParquet(floor, cols, rows) {
  new THREE.TextureLoader().load(
    'textures/floor_parquet.jpg',
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      // Повторяем текстуру по полу: один "лист" паркета = 2×2 клетки
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(cols / 2, rows / 2);
      floor.material.map = texture;
      floor.material.color.set(0xffffff); // белый, чтобы не тонировать текстуру
      floor.material.needsUpdate = true;
    },
    undefined,
    () => {
      // Нет текстуры — хотя бы цвет дерева, чтобы было видно, что паркет уложен
      floor.material.color.set(0x8a6a45);
      console.warn('Текстура пола не найдена (textures/floor_parquet.jpg) — паркет цветом.');
    }
  );
}

// Создаёт линии сетки поверх пола (cols × rows клеток)
export function createGridLines(cols, rows) {
  const points = [];
  const halfW = cols / 2;
  const halfH = rows / 2;
  // Чуть приподнимаем линии над полом, чтобы они не «мерцали» с ним
  const y = 0.01;

  // Линии вдоль оси Z (вертикальные на виде сверху)
  for (let i = 0; i <= cols; i++) {
    const x = -halfW + i;
    points.push(new THREE.Vector3(x, y, -halfH), new THREE.Vector3(x, y, halfH));
  }
  // Линии вдоль оси X (горизонтальные на виде сверху)
  for (let j = 0; j <= rows; j++) {
    const z = -halfH + j;
    points.push(new THREE.Vector3(-halfW, y, z), new THREE.Vector3(halfW, y, z));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0x120c06,
    transparent: true,
    opacity: 0.55,
  });
  return new THREE.LineSegments(geometry, material);
}
