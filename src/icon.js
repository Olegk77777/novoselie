// icon.js — рендерит иконку предмета из его же 3D-модели.
// Так иконка в панели всегда совпадает с тем, что ставится в комнату,
// и для новых предметов (шаг 3) иконки появятся сами — рисовать руками не надо.

import * as THREE from 'three';

// Один общий рендерер на все иконки — чтобы не плодить WebGL-контексты
// (браузер ограничивает их число). Создаётся лениво при первом вызове.
let iconRenderer = null;

// Рендерит модель buildFn() в маленький PNG (data-URL) под изо-углом игры.
export function renderItemIcon(buildFn, size = 128) {
  if (!iconRenderer) {
    iconRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    iconRenderer.setSize(size, size);
  }

  const scene = new THREE.Scene();

  // Ортокамера под тем же диагональным ракурсом, что и основная сцена
  const f = 0.78; // полуразмер кадра — подобран, чтобы предмет влез с полями
  const camera = new THREE.OrthographicCamera(-f, f, f, -f, 0.1, 100);
  camera.position.set(10, 10, 10);
  camera.lookAt(0, 0.28, 0);

  // Свет как в игре, но иконку делаем чётким силуэтом: убираем текстуру,
  // оставляем сплошной цвет — мелкая текстура в 56px читалась бы как шум
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
  dir.position.set(5, 10, 3);
  scene.add(dir);

  const model = buildFn();
  model.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.map = null;
      o.material.color.set(0x9c6b30);
    }
  });
  scene.add(model);

  iconRenderer.render(scene, camera);
  return iconRenderer.domElement.toDataURL('image/png');
}
