// camera.js — изометрическая камера: создание, авто-вписывание комнаты в экран, зум.
// Камера зафиксирована по РАКУРСУ и ПОВОРОТУ (изометрия). Менять можно только масштаб.

import * as THREE from 'three';

// Базовая высота видимой области в юнитах. Реальный масштаб задаёт camera.zoom.
const BASE_FRUSTUM = 14;
// Какую долю экрана занимает пол при авто-вписывании (0.9 = 90%, остальное — поля).
const FILL = 0.9;
// Пределы РУЧНОГО зума (множитель поверх авто-вписывания): дальше / ближе.
const MIN_USER_ZOOM = 0.6;
const MAX_USER_ZOOM = 3.0;

// Создаёт изокамеру и возвращает её вместе с функциями resize() и zoomBy().
export function createIsoCamera(floorCols, floorRows) {
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    (-BASE_FRUSTUM * aspect) / 2,
    (BASE_FRUSTUM * aspect) / 2,
    BASE_FRUSTUM / 2,
    -BASE_FRUSTUM / 2,
    0.1,
    100
  );
  camera.position.set(10, 10, 10);
  camera.lookAt(0, 0, 0);

  // Четыре угла пола — по ним считаем, какой зум нужен, чтобы пол влез в экран
  const halfW = floorCols / 2;
  const halfD = floorRows / 2;
  const corners = [
    new THREE.Vector3(-halfW, 0, -halfD),
    new THREE.Vector3(halfW, 0, -halfD),
    new THREE.Vector3(halfW, 0, halfD),
    new THREE.Vector3(-halfW, 0, halfD),
  ];

  // Ручной множитель зума от пользователя (колесо/пинч). 1.0 = ровно авто-вписывание.
  let userZoom = 1.0;

  // Считает зум, при котором пол занимает FILL экрана (работает при любом aspect)
  function fitZoom() {
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    // Обновляем матрицу положения камеры, иначе project() считает её стоящей в нуле
    camera.updateMatrixWorld(true);
    let maxNdc = 0;
    for (const corner of corners) {
      // project() переводит точку мира в координаты экрана от -1 до 1
      const ndc = corner.clone().project(camera);
      maxNdc = Math.max(maxNdc, Math.abs(ndc.x), Math.abs(ndc.y));
    }
    return FILL / maxNdc;
  }

  // Применяет итоговый зум = авто-вписывание × ручной множитель
  function applyZoom() {
    camera.zoom = fitZoom() * userZoom;
    camera.updateProjectionMatrix();
  }

  // Пересчёт при изменении размера окна
  function resize() {
    const a = window.innerWidth / window.innerHeight;
    camera.left = (-BASE_FRUSTUM * a) / 2;
    camera.right = (BASE_FRUSTUM * a) / 2;
    camera.top = BASE_FRUSTUM / 2;
    camera.bottom = -BASE_FRUSTUM / 2;
    applyZoom();
  }

  // Меняет ручной зум: factor > 1 приближает, < 1 отдаляет
  function zoomBy(factor) {
    userZoom = THREE.MathUtils.clamp(userZoom * factor, MIN_USER_ZOOM, MAX_USER_ZOOM);
    applyZoom();
  }

  applyZoom(); // стартовое вписывание пола в экран
  return { camera, resize, zoomBy };
}

// Навешивает управление зумом на холст: колесо мыши + щипок двумя пальцами (pinch).
export function attachZoomControls(domElement, zoomBy) {
  // Колесо мыши: вверх — приближаем, вниз — отдаляем
  domElement.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault(); // чтобы страница не скроллилась
      zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
    },
    { passive: false }
  );

  // Пинч на сенсорном экране: следим за расстоянием между двумя пальцами
  let lastDist = null;
  domElement.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      // Первый замер — просто запоминаем, со второго начинаем менять зум
      if (lastDist !== null) zoomBy(dist / lastDist);
      lastDist = dist;
    },
    { passive: false }
  );
  // Палец оторвали — сбрасываем замер, чтобы следующий пинч начался заново
  domElement.addEventListener('touchend', () => {
    lastDist = null;
  });
}
