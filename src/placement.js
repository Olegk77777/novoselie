// placement.js — расстановка предметов: взять, водить призрак, поставить, повернуть, забрать.
// Шаг перемещения — ПОЛклетки (0.5 юнита): можно ставить табурет по центру стола и т.п.
// Поворот — шагами по 45°: предметы можно ставить по диагонали.
// Предметы с surfaceHeight — «поверхности»: на них можно ставить mountable-предметы
// (магнитофон на табурет/стол/тумбу, телевизор на тумбу).

import * as THREE from 'three';

const SUB = 2; // подклеток в одной клетке (2 = шаг в полклетки)

// Создаёт контроллер расстановки.
// onStateChange(state, itemId): 'placing' | 'placed' | 'cancelled'
// onComfortChange(total): сумма очков уюта всех поставленных предметов
export function createPlacement({ scene, camera, canvas, floor, cols, rows, onStateChange, onComfortChange }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const subCols = cols * SUB;
  const subRows = rows * SUB;
  // Два слоя занятости (в подклетках): мебель и ковры. Ковёр не занимает клетки
  // мебели, поэтому кресло можно поставить ПОВЕРХ ковра (нужно для квестов v0.2).
  const occupied = { furniture: new Set(), rug: new Set() };
  const placedItems = [];   // поставленные предметы (группы)

  let ghost = null;          // полупрозрачный предмет «в руке»
  let def = null;            // описание предмета из items.json (id, size, layer, buildFn...)
  let rotationSteps = 0;     // 0..7 — повороты по 45°
  let targetRotY = 0;        // угол, к которому призрак плавно доворачивается
  let currentAnchor = null;  // левая верхняя ПОДклетка прямоугольника предмета
  let mountTarget = null;    // поверхность под курсором, на которую сядет предмет

  // Защита от случайной установки во время пинч-зума двумя пальцами
  const pointers = new Set();
  let pinchActive = false;

  const layerOf = (d) => (d.layer === 'rug' ? 'rug' : 'furniture');
  const keyOf = (sc, sr) => `${sc},${sr}`;

  // Пересчитать уют по всем поставленным предметам и сообщить наружу
  function reportComfort() {
    const total = placedItems.reduce((sum, item) => sum + (item.userData.def.comfort || 0), 0);
    onComfortChange(total);
  }

  // Габариты в ПОДклетках с учётом поворота. Для диагональных углов (45°, 135°...)
  // берём описанный прямоугольник (AABB) повёрнутого предмета, округляя вверх:
  // лучше заблокировать чуть больше места, чем позволить предметам налезть друг на друга.
  function footprintSub(steps) {
    const [w, d] = def.size;
    const theta = (steps * Math.PI) / 4;
    const cos = Math.abs(Math.cos(theta));
    const sin = Math.abs(Math.sin(theta));
    return {
      w: Math.max(1, Math.ceil((w * cos + d * sin) * SUB - 1e-6)),
      d: Math.max(1, Math.ceil((w * sin + d * cos) * SUB - 1e-6)),
    };
  }

  // Якорная подклетка так, чтобы курсор был у центра предмета; зажата в границы пола
  function anchorFromSub(sub, steps) {
    const fp = footprintSub(steps);
    return {
      sc: THREE.MathUtils.clamp(sub.sc - Math.floor((fp.w - 1) / 2), 0, subCols - fp.w),
      sr: THREE.MathUtils.clamp(sub.sr - Math.floor((fp.d - 1) / 2), 0, subRows - fp.d),
    };
  }

  // Все подклетки, которые предмет накрывает из якорной
  function coveredKeys(anchor, steps) {
    const fp = footprintSub(steps);
    const keys = [];
    for (let c = anchor.sc; c < anchor.sc + fp.w; c++) {
      for (let r = anchor.sr; r < anchor.sr + fp.d; r++) keys.push(keyOf(c, r));
    }
    return keys;
  }

  function isFree(anchor, steps) {
    const set = occupied[layerOf(def)];
    return coveredKeys(anchor, steps).every((k) => !set.has(k));
  }

  // Центр прямоугольника предмета в мировых координатах
  function rectCenter(anchor, steps) {
    const fp = footprintSub(steps);
    return new THREE.Vector3(
      -cols / 2 + (anchor.sc + fp.w / 2) / SUB,
      0,
      -rows / 2 + (anchor.sr + fp.d / 2) / SUB
    );
  }

  // Луч из камеры через точку клика/курсора
  function setRayFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
  }

  // Какая подклетка пола под курсором (null, если мимо пола)
  function subFromEvent(event) {
    setRayFromEvent(event);
    const hit = raycaster.intersectObject(floor)[0];
    if (!hit) return null;
    const sc = Math.floor((hit.point.x + cols / 2) * SUB);
    const sr = Math.floor((hit.point.z + rows / 2) * SUB);
    if (sc < 0 || sc >= subCols || sr < 0 || sr >= subRows) return null;
    return { sc, sr };
  }

  // Ищем под курсором свободную поверхность (для mountable-предметов)
  function hostUnderCursor(event) {
    if (!def || !def.mountable) return null;
    setRayFromEvent(event);
    const hits = raycaster.intersectObjects(placedItems, true);
    for (const hit of hits) {
      let g = hit.object;
      while (g && !placedItems.includes(g)) g = g.parent;
      if (!g) continue;
      if (g.userData.def.surfaceHeight && !g.userData.occupant) return g;
    }
    return null;
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
    g.rotation.y = (rotationSteps * Math.PI) / 4;
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

  // Переставить призрак: сначала пробуем поверхность, иначе — пол
  function updateGhostFromEvent(event) {
    if (!ghost) return;
    const host = hostUnderCursor(event);
    if (host) {
      mountTarget = host;
      ghost.position.set(
        host.position.x,
        host.userData.def.surfaceHeight,
        host.position.z
      );
      tintGhost(true);
      return;
    }
    mountTarget = null;
    const sub = subFromEvent(event);
    if (!sub) return; // мимо пола — призрак остаётся где был
    currentAnchor = anchorFromSub(sub, rotationSteps);
    const center = rectCenter(currentAnchor, rotationSteps);
    ghost.position.set(center.x, 0, center.z);
    tintGhost(isFree(currentAnchor, rotationSteps));
  }

  function removeGhost() {
    if (ghost) scene.remove(ghost);
    ghost = null;
    def = null;
    currentAnchor = null;
    mountTarget = null;
  }

  // Поставить предмет: на поверхность (mountTarget) или на пол
  function place() {
    const item = def.buildFn();
    item.rotation.y = (rotationSteps * Math.PI) / 4;
    item.userData.def = def;
    item.userData.rotationSteps = rotationSteps;
    if (mountTarget) {
      // Сажаем на поверхность и связываем с «хозяином»
      item.position.set(
        mountTarget.position.x,
        mountTarget.userData.def.surfaceHeight,
        mountTarget.position.z
      );
      item.userData.host = mountTarget;
      mountTarget.userData.occupant = item;
    } else {
      item.position.copy(rectCenter(currentAnchor, rotationSteps));
      item.userData.anchor = { ...currentAnchor };
      item.userData.keys = coveredKeys(currentAnchor, rotationSteps);
      const set = occupied[layerOf(def)];
      item.userData.keys.forEach((k) => set.add(k));
    }
    scene.add(item);
    placedItems.push(item);
    const placedId = def.id;
    removeGhost();
    onStateChange('placed', placedId);
    reportComfort();
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
    // Если на предмете что-то стоит — сначала забираем верхний (он физически сверху)
    if (item.userData.occupant) item = item.userData.occupant;
    scene.remove(item);
    placedItems.splice(placedItems.indexOf(item), 1);
    const itemDef = item.userData.def;
    if (item.userData.host) {
      // Снимаем с поверхности — освобождаем «хозяина»
      item.userData.host.userData.occupant = null;
    } else {
      const set = occupied[layerOf(itemDef)];
      item.userData.keys.forEach((k) => set.delete(k));
    }
    startPlacing(itemDef, item.userData.rotationSteps, item.userData.anchor ?? null);
    reportComfort();
  }

  // Взять предмет «в руку» (из ячейки или после подбора с пола)
  function startPlacing(itemDef, steps = 0, anchor = null) {
    if (ghost) return; // уже что-то в руке
    def = itemDef;
    rotationSteps = steps;
    targetRotY = (steps * Math.PI) / 4;
    ghost = makeGhost();
    scene.add(ghost);
    // Появляемся там, где предмет стоял, или в центре комнаты —
    // на планшете иначе непонятно, что предмет «в руке»
    currentAnchor = anchor
      ? { ...anchor }
      : anchorFromSub({ sc: Math.floor(subCols / 2), sr: Math.floor(subRows / 2) }, steps);
    const center = rectCenter(currentAnchor, rotationSteps);
    ghost.position.set(center.x, 0, center.z);
    tintGhost(isFree(currentAnchor, rotationSteps));
    onStateChange('placing', def.id);
  }

  canvas.addEventListener('pointerdown', (e) => {
    pointers.add(e.pointerId);
    if (pointers.size > 1) pinchActive = true;
    if (ghost) updateGhostFromEvent(e);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (ghost) updateGhostFromEvent(e);
  });

  canvas.addEventListener('pointerup', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size > 0) return;
    const wasPinch = pinchActive;
    pinchActive = false;
    if (wasPinch) return; // это был зум, а не клик
    if (ghost) {
      updateGhostFromEvent(e);
      if (mountTarget) place();
      else if (currentAnchor && isFree(currentAnchor, rotationSteps)) place();
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
    // Повернуть предмет «в руке» на 45° вокруг его центра
    rotate() {
      if (!ghost) return;
      if (mountTarget) {
        // На поверхности просто крутимся — клетки не считаем
        rotationSteps = (rotationSteps + 1) % 8;
        targetRotY += Math.PI / 4;
        return;
      }
      // Центр прямоугольника до поворота — чтобы предмет крутился «на месте»
      const fpOld = footprintSub(rotationSteps);
      const centerSub = {
        sc: currentAnchor.sc + Math.floor((fpOld.w - 1) / 2),
        sr: currentAnchor.sr + Math.floor((fpOld.d - 1) / 2),
      };
      rotationSteps = (rotationSteps + 1) % 8;
      targetRotY += Math.PI / 4;
      currentAnchor = anchorFromSub(centerSub, rotationSteps);
      const center = rectCenter(currentAnchor, rotationSteps);
      ghost.position.set(center.x, 0, center.z);
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
