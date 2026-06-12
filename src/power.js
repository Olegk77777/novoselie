// power.js — электричество: розетки, шнуры, автоподключение приборов.
// Розетка — предмет с полем sockets (сколько приборов можно включить).
// Прибор — предмет с полем cordLength (длина шнура в клетках).
// Прибор подключается к ближайшей розетке со свободным гнездом, если шнур
// дотягивается; шнур рисуется тёмной линией по полу — видно, что работает.

import * as THREE from 'three';

export function createPower(scene) {
  const cordsGroup = new THREE.Group();
  scene.add(cordsGroup);
  const cordMaterial = new THREE.LineBasicMaterial({ color: 0x16161a });

  // Шнур: от прибора вниз, по полу до стены, вверх к розетке
  function makeCord(device, outlet) {
    const d = device.position;
    const o = outlet.position;
    const points = [
      new THREE.Vector3(d.x, Math.max(0.08, d.y + 0.06), d.z),
      new THREE.Vector3(d.x, 0.02, d.z),
      new THREE.Vector3(o.x, 0.02, o.z),
      new THREE.Vector3(o.x, o.y, o.z),
    ];
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), cordMaterial);
  }

  // Пересчитать подключения по текущей расстановке.
  // Возвращает Map: прибор (группа) → розетка (группа).
  function update(placedItems) {
    cordsGroup.clear();
    const outlets = placedItems.filter((i) => i.userData.def.sockets);
    const devices = placedItems.filter((i) => i.userData.def.cordLength);
    const load = new Map(outlets.map((o) => [o, 0]));
    const connections = new Map();

    for (const device of devices) {
      let best = null;
      let bestDist = Infinity;
      for (const outlet of outlets) {
        if (load.get(outlet) >= outlet.userData.def.sockets) continue; // гнёзда заняты
        const dist = Math.hypot(
          device.position.x - outlet.position.x,
          device.position.z - outlet.position.z
        );
        if (dist <= device.userData.def.cordLength && dist < bestDist) {
          best = outlet;
          bestDist = dist;
        }
      }
      if (best) {
        load.set(best, load.get(best) + 1);
        connections.set(device, best);
        cordsGroup.add(makeCord(device, best));
      }
    }
    return connections;
  }

  return { update };
}
