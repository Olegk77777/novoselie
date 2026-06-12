// placement.js — расстановка предметов: взять, водить призрак по клеткам,
// поставить (предмет может занимать несколько клеток), повернуть на 90°, забрать кликом.

import * as THREE from 'three';

// Создаёт контроллер расстановки.
// onStateChange(state, itemId): 'placing' | 'placed' | 'cancelled'
export function createPlacement({ scene, camera, canvas, floor, cols, rows, onStateChange }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  // Два слоя занятости: мебель и ковры. Ковёр не занимает клетки мебели,
  // поэтому кресло можно поставить ПОВЕРХ ковра (нужно для квестов v0.2).
  const occupied = { furniture: new Set(), rug: new Set() };
  const placedItems = [];   // поставленные предметы (группы)

  let ghost = null;          // полупрозрачный предмет «в руке»
  let def = null;            // описание предмета из items.json (id, size, layer, buildFn)
  let rotationSteps = 0;     // 0..3 — повороты на 90°
  let targetRotY = 0;        // угол, к которому призрак плавно доворачивается
  let currentAnchor = null;  // левая верхняя клетка прямоугольника предмета

  // Защита от случайной установки во время пинч-зума двумя пальцами
  const pointers = new Set();
  let pinchActive = false;

  const layerOf = (d) => (d.layer === 'rug' ? 'rug' : 'furniture');
  const keyOf = (col, row) => `${col},${row}`;

  // Габариты в клетках с учётом поворота (90°/270° меняют ширину и глубину местами)
  function footprint(steps) {
    const [w, d] = def.size;
    return steps % 2 === 1 ? { w: d, d: w } : { w, d };
  }

  // Якорная клетка (левый верхний угол) так, чтобы курсор был у центра предмета.
  // Зажимается в границы комнаты — предмет не вылезет за пол.
  function anchorFromCell(cell, steps) {
    const fp = footprint(steps);
    return {
      col: THREE.MathUtils.clamp(cell.col - Math.floor((fp.w - 1) / 2), 0, cols - fp.w),
      row: THREE.MathUtils.clamp(cell.row - Math.floor((fp.d - 1) / 2), 0, rows - fp.d),
    };
  }

  // Все клетки, которые предмет накрывает из якорной
  function coveredKeys(anchor, steps) {
    const fp = footprint(steps);
    const keys = [];
    for (let c = anchor.col; c < anchor.col + fp.w; c++) {
      for (let r = anchor.row; r < anchor.row + fp.d; r++) keys.push(keyOf(c, r));
    }
    return keys;
  }

  function isFree(anchor, steps) {
    const set = occupied[layerOf(def)];
    return coveredKeys(anchor, steps).every((k) => !set.has(k));
  }

  // Центр прямоугольника предмета в мировых координатах
  function rectCenter(anchor, steps) {
    const fp = footprint(steps);
    return new THREE.Vector3(
      -cols / 2 + anchor.col + fp.w / 2,
      0,
      -rows / 2 + anchor.row + fp.d / 2
    );
  }

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
    const g = def.buildFn();
    g.traverse((obj) => {
      if (obj.isMesh) {
        obj.material = obj.material.clone();
        obj.material.transparent = true;
        obj.material.opacity = Math.min(obj.material.opacity, 0.55);
      }
    });
    g.rotation.y = (rotationSteps * Math.PI) / 2;
    return g;
  }

  // Подсветка призрака: зелёная — место свободно, красная — занято
  function tintGhost(free) {
    ghost.traverse((obj) => {
      if (obj.isMesh && obj.material.emissive) {
        obj.material.emissive.setHex(free ? 0x0c3a0c : 0x5a1010);
      }
    });
  }

  // Переставить призрак к клетке под курсором
  function updateGhost(cell) {
    if (!ghost || !cell) return; // мимо пола — призрак остаётся где был
    currentAnchor = anchorFromCell(cell, rotationSteps);
    ghost.position.copy(rectCenter(currentAnchor, rotationSteps));
    tintGhost(isFree(currentAnchor, rotationSteps));
  }

  function removeGhost() {
    if (ghost) scene.remove(ghost);
    ghost = null;
    def = null;
    currentAnchor = null;
  }

  // Поставить предмет в текущую позицию
  function place() {
    const item = def.buildFn();
    item.rotation.y = (rotationSteps * Math.PI) / 2;
    item.position.copy(rectCenter(currentAnchor, rotationSteps));
    // Запоминаем всё, что нужно, чтобы потом забрать предмет обратно
    item.userData.def = def;
    item.userData.rotationSteps = rotationSteps;
    item.userData.anchor = { ...currentAnchor };
    item.userData.keys = coveredKeys(currentAnchor, rotationSteps);
    const set = occupied[layerOf(def)];
    item.userData.keys.forEach((k) => set.add(k));
    scene.add(item);
    placedItems.push(item);
    const placedId = def.id;
    removeGhost();
    onStateChange('placed', placedId);
  }

  // Клик по поставленному предмету — забираем его обратно «в руку»
  function tryPickup(event) {
    setRayFromEvent(event);
    const hit = raycaster.intersectObjects(placedItems, true)[0];
    if (!hit) return;
    // Луч попал в детальку — поднимаемся до самой группы предмета
    let item = hit.object;
    while (item && !placedItems.includes(item)) item = item.parent;
    if (!item) return;
    scene.remove(item);
    placedItems.splice(placedItems.indexOf(item), 1);
    const itemDef = item.userData.def;
    const set = occupied[layerOf(itemDef)];
    item.userData.keys.forEach((k) => set.delete(k));
    startPlacing(itemDef, item.userData.rotationSteps, item.userData.anchor);
  }

  // Взять предмет «в руку» (из ячейки или после подбора с пола)
  function startPlacing(itemDef, steps = 0, anchor = null) {
    if (ghost) return; // уже что-то в руке
    def = itemDef;
    rotationSteps = steps;
    targetRotY = (steps * Math.PI) / 2;
    ghost = makeGhost();
    scene.add(ghost);
    // Появляемся там, где предмет стоял, или в центре комнаты —
    // на планшете иначе непонятно, что предмет «в руке»
    currentAnchor = anchor
      ? { ...anchor }
      : anchorFromCell({ col: Math.floor(cols / 2), row: Math.floor(rows / 2) }, steps);
    ghost.position.copy(rectCenter(currentAnchor, rotationSteps));
    tintGhost(isFree(currentAnchor, rotationSteps));
    onStateChange('placing', def.id);
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
      if (cell) updateGhost(cell);
      if (currentAnchor && isFree(currentAnchor, rotationSteps)) place();
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
    // Повернуть предмет «в руке» на 90° вокруг его центра
    rotate() {
      if (!ghost) return;
      // Центр прямоугольника до поворота — чтобы предмет крутился «на месте»
      const fpOld = footprint(rotationSteps);
      const centerCell = {
        col: currentAnchor.col + Math.floor((fpOld.w - 1) / 2),
        row: currentAnchor.row + Math.floor((fpOld.d - 1) / 2),
      };
      rotationSteps = (rotationSteps + 1) % 4;
      targetRotY += Math.PI / 2;
      currentAnchor = anchorFromCell(centerCell, rotationSteps);
      ghost.position.copy(rectCenter(currentAnchor, rotationSteps));
      tintGhost(isFree(currentAnchor, rotationSteps));
    },
    // Отмена: предмет возвращается в ячейку панели
    cancel() {
      if (!ghost) return;
      const cancelledId = def.id;
      removeGhost();
      onStateChange('cancelled', cancelledId);
    },
    // Вызывается каждый кадр: плавный доворот призрака
    update() {
      if (!ghost) return;
      const diff = targetRotY - ghost.rotation.y;
      if (Math.abs(diff) > 0.001) ghost.rotation.y += diff * 0.25;
      else ghost.rotation.y = targetRotY;
    },
  };
}
