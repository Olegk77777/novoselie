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

  // Значок «нет питания» — парит над неподключённым прибором (жёлтый круг,
  // молния, красное перечёркивание). Одна текстура на все индикаторы.
  const indicatorsGroup = new THREE.Group();
  scene.add(indicatorsGroup);
  const indicatorTexture = makeNoPowerTexture();
  const indicators = new Map(); // прибор → спрайт-значок

  function makeNoPowerTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const c = cv.getContext('2d');
    c.beginPath();
    c.arc(64, 64, 54, 0, Math.PI * 2);
    c.fillStyle = '#e8c24a';
    c.fill();
    c.lineWidth = 7;
    c.strokeStyle = '#2a2018';
    c.stroke();
    // Молния
    c.fillStyle = '#2a2018';
    c.beginPath();
    c.moveTo(72, 26); c.lineTo(44, 70); c.lineTo(60, 70); c.lineTo(54, 102);
    c.lineTo(88, 54); c.lineTo(70, 54); c.closePath();
    c.fill();
    // Красная перечёркивающая черта — «питания нет»
    c.lineCap = 'round';
    c.lineWidth = 13;
    c.strokeStyle = '#c83828';
    c.beginPath(); c.moveTo(30, 30); c.lineTo(98, 98); c.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeIndicator() {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: indicatorTexture, transparent: true, depthTest: false })
    );
    sprite.scale.set(0.5, 0.5, 0.5);
    sprite.renderOrder = 999; // поверх мебели, не прячется за ней
    return sprite;
  }

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

    // Значок «нет питания» над приборами, которым не хватило розетки
    for (const device of devices) {
      let sprite = indicators.get(device);
      if (!connections.has(device)) {
        if (!sprite) {
          sprite = makeIndicator();
          indicators.set(device, sprite);
          indicatorsGroup.add(sprite);
        }
        const top = new THREE.Box3().setFromObject(device).max.y;
        sprite.position.set(device.position.x, top + 0.35, device.position.z);
        sprite.visible = true;
      } else if (sprite) {
        sprite.visible = false;
      }
    }
    // Убрать значки приборов, которых больше нет на поле
    for (const [device, sprite] of indicators) {
      if (!devices.includes(device)) {
        indicatorsGroup.remove(sprite);
        indicators.delete(device);
      }
    }
    return connections;
  }

  return { update };
}
