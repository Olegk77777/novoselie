// icon.js — рендерит иконку предмета из его же 3D-модели.
// Иконка в панели всегда совпадает с тем, что ставится в комнату,
// и для новых предметов появляется сама — рисовать руками не надо.

import * as THREE from 'three';

// Один общий рендерер на все иконки — чтобы не плодить WebGL-контексты
// (браузер ограничивает их число). Создаётся лениво при первом вызове.
let iconRenderer = null;

// Рендерит модель buildFn() в маленький PNG (data-URL) под изо-углом игры.
// Кадр подбирается автоматически по габаритам модели — кровать и сервант влезут.
export function renderItemIcon(buildFn, size = 128) {
  if (!iconRenderer) {
    iconRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    iconRenderer.setSize(size, size);
  }

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
  dir.position.set(5, 10, 3);
  scene.add(dir);

  const model = buildFn();
  // В 56 пикселях текстура читается как шум — заменяем её родным цветом-заглушкой
  // материала (см. texturedMaterial в items.js). Цветные материалы без текстуры
  // (обивка, экран, стекло) оставляем как есть.
  model.traverse((o) => {
    if (o.isMesh && o.material.map) {
      const iconColor = o.material.userData.iconColor;
      o.material = o.material.clone();
      o.material.map = null;
      if (iconColor != null) o.material.color.set(iconColor);
    }
  });
  scene.add(model);

  // Авто-кадрирование: проецируем углы габаритного бокса модели и подгоняем зум
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(center.x + 10, center.y + 10, center.z + 10);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  let maxNdc = 0;
  for (const cx of [bounds.min.x, bounds.max.x]) {
    for (const cy of [bounds.min.y, bounds.max.y]) {
      for (const cz of [bounds.min.z, bounds.max.z]) {
        const p = new THREE.Vector3(cx, cy, cz).project(camera);
        maxNdc = Math.max(maxNdc, Math.abs(p.x), Math.abs(p.y));
      }
    }
  }
  camera.zoom = maxNdc > 0 ? 0.85 / maxNdc : 1;
  camera.updateProjectionMatrix();

  iconRenderer.render(scene, camera);
  return iconRenderer.domElement.toDataURL('image/png');
}
