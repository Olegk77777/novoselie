// grid.js — пол комнаты и линии сетки.
// Договорённость по координатам: 1 клетка = 1 юнит Three.js.
// Пол центрирован в начале координат: при сетке 10×8 он занимает
// x от -5 до 5 и z от -4 до 4. Центр клетки (col, row):
// x = -cols/2 + col + 0.5, z = -rows/2 + row + 0.5.

import * as THREE from 'three';

// Создаёт плоскость пола размером cols × rows клеток
export function createFloor(cols, rows) {
  const geometry = new THREE.PlaneGeometry(cols, rows);
  // Цвет-заглушка: виден, пока текстура грузится (или если не загрузится)
  const material = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });

  new THREE.TextureLoader().load(
    'textures/floor_parquet.jpg',
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      // Повторяем текстуру по полу: один "лист" паркета = 2×2 клетки
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(cols / 2, rows / 2);
      material.map = texture;
      // Белый цвет, чтобы заглушка не тонировала текстуру
      material.color.set(0xffffff);
      material.needsUpdate = true;
    },
    undefined,
    (err) => console.error('Не удалось загрузить текстуру пола:', err)
  );

  const floor = new THREE.Mesh(geometry, material);
  // Плоскость по умолчанию стоит вертикально — кладём её горизонтально
  floor.rotation.x = -Math.PI / 2;
  return floor;
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
