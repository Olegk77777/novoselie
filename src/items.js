// items.js — 3D-модели предметов из примитивов Three.js (стиль PS1).
// Пока один тестовый предмет; в шаге 3 размеры и цвета переедут в data/items.json.

import * as THREE from 'three';

const WOOD_COLOR = 0x9c6b30;

// Табурет 1×1 клетка: сиденье + 4 ножки. Центр группы — центр клетки, низ на полу.
export function createStool() {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: WOOD_COLOR });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.7), material);
  seat.position.y = 0.51; // верх ножек (0.45) + половина толщины сиденья
  group.add(seat);

  const legGeometry = new THREE.BoxGeometry(0.09, 0.45, 0.09);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const leg = new THREE.Mesh(legGeometry, material);
    leg.position.set(sx * 0.26, 0.225, sz * 0.26);
    group.add(leg);
  }
  return group;
}
