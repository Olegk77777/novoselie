// placement.js — расстановка предметов: взять, водить призрак по клеткам,
// поставить, повернуть на 90°, кликом забрать обратно.

import * as THREE from 'three';

// Создаёт контроллер расстановки. onStateChange получает: 'placing' | 'placed' | 'cancelled'
export function createPlacement({ scene, camera, canvas, floor, cols, rows, onStateChange }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const occupied = new Set();   // занятые клетки, ключ "col,row"
  const placedItems = [];       // поставленные предметы (группы)

  let ghost = null;             // полупрозрачный предмет «в руке»
  let buildFn = null;           // функция-строитель текущего предмета
  let rotationSteps = 0;        // 0..3 — повороты на 90°
  let targetRotY = 0;           // угол, к которому призрак плавно доворачивается
  let currentCell = null;       // клетка под курсором {col,row}

  // Защита от случайной установки во время пинч-зума двумя пальцами
  const pointers = new Set();
  let pinchActive = false;

  const cellKey = (c) => `${c.col},${c.row}`;
  const cellCenter = (c) =>
    new THREE.Vector3(-cols / 2 + c.col + 0.5, 0, -rows / 2 + c.row + 0.5);

  // Луч из камеры через точку клика/курсора
  function setRayFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
  }

  // Какая клетка пола под курсором (null, если мимо пола)
  function cellFromEvent(event) {
    setRayFromEvent(event);
    const hit = raycaster.intersectObject(floor)[0];
    if (!hit) return null;
    const col = Math.floor(hit.point.x + cols / 2);
    const row = Math.floor(hit.point.z + rows / 2);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
    return { col, row };
  }

  // Призрак: копия предмета с полупрозрачными материалами
  function makeGhost() {
    const g = buildFn();
    g.traverse((obj) => {
      if (obj.isMesh) {
        obj.material = obj.material.clone();
        obj.material.transparent = true;
        obj.material.opacity = 0.55;
      }
    });
    g.rotation.y = (rotationSteps * Math.PI) / 2;
    g.visible = false; // появится при первом движении курсора над полом
    return g;
  }

  // Подсветка призрака: зелёная — клетка свободна, красная — занята
  function tintGhost(free) {
    ghost.traverse((obj) => {
      if (obj.isMesh) obj.material.emissive.setHex(free ? 0x0c3a0c : 0x5a1010);
    });
  }

  function updateGhost(cell) {
    if (!ghost) return;
    // Курсор ушёл с пола (к кнопкам, в тёмную зону) — НЕ прячем призрак,
    // оставляем его на последней клетке, чтобы дотянуться до кнопок
    if (!cell) return;
    currentCell = cell;
    ghost.visible = true;
    ghost.position.copy(cellCenter(cell));
    tintGhost(!occupied.has(cellKey(cell)));
  }

  function removeGhost() {
    if (ghost) scene.remove(ghost);
    ghost = null;
    buildFn = null;
  }

  // Поставить предмет в текущую клетку
  function place() {
    const item = buildFn();
    item.rotation.y = (rotationSteps * Math.PI) / 2;
    item.position.copy(cellCenter(currentCell));
    // Запоминаем всё, что нужно, чтобы потом забрать предмет обратно
    item.userData.cell = { ...currentCell };
    item.userData.buildFn = buildFn;
    item.userData.rotationSteps = rotationSteps;
    scene.add(item);
    placedItems.push(item);
    occupied.add(cellKey(currentCell));
    removeGhost();
    onStateChange('placed');
  }

  // Клик по поставленному предмету — забираем его обратно «в руку»
  function tryPickup(event) {
    setRayFromEvent(event);
    const hit = raycaster.intersectObjects(placedItems, true)[0];
    if (!hit) return;
    // Луч попал в детальку (ножку/сиденье) — поднимаемся до самой группы предмета
    let item = hit.object;
    while (item && !placedItems.includes(item)) item = item.parent;
    if (!item) return;
    scene.remove(item);
    placedItems.splice(placedItems.indexOf(item), 1);
    occupied.delete(cellKey(item.userData.cell));
    startPlacing(item.userData.buildFn, item.userData.rotationSteps);
    updateGhost(cellFromEvent(event));
  }

  // Взять предмет «в руку» (из ячейки или после подбора с пола)
  function startPlacing(itemBuildFn, steps = 0) {
    if (ghost) return; // уже что-то в руке
    buildFn = itemBuildFn;
    rotationSteps = steps;
    targetRotY = (steps * Math.PI) / 2;
    ghost = makeGhost();
    scene.add(ghost);
    // Сразу показываем призрак в центре комнаты — на планшете иначе непонятно,
    // что предмет «в руке», пока не коснёшься пола
    updateGhost({ col: Math.floor(cols / 2), row: Math.floor(rows / 2) });
    onStateChange('placing');
  }

  canvas.addEventListener('pointerdown', (e) => {
    pointers.add(e.pointerId);
    if (pointers.size > 1) pinchActive = true;
    if (ghost) updateGhost(cellFromEvent(e));
  });

  canvas.addEventListener('pointermove', (e) => {
    if (ghost) updateGhost(cellFromEvent(e));
  });

  canvas.addEventListener('pointerup', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size > 0) return;
    const wasPinch = pinchActive;
    pinchActive = false;
    if (wasPinch) return; // это был зум, а не клик
    if (ghost) {
      const cell = cellFromEvent(e);
      if (cell && !occupied.has(cellKey(cell))) {
        currentCell = cell;
        place();
      }
    } else {
      tryPickup(e);
    }
  });

  canvas.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) pinchActive = false;
  });

  return {
    startPlacing,
    isPlacing: () => ghost !== null,
    // Повернуть предмет «в руке» на 90° (доворачивается плавно — см. update)
    rotate() {
      if (!ghost) return;
      rotationSteps = (rotationSteps + 1) % 4;
      targetRotY += Math.PI / 2;
    },
    // Отмена: предмет возвращается в ячейку панели
    cancel() {
      if (!ghost) return;
      removeGhost();
      onStateChange('cancelled');
    },
    // Вызывается каждый кадр из главного цикла: плавный доворот призрака
    update() {
      if (!ghost) return;
      const diff = targetRotY - ghost.rotation.y;
      if (Math.abs(diff) > 0.001) ghost.rotation.y += diff * 0.25;
      else ghost.rotation.y = targetRotY;
    },
  };
}
