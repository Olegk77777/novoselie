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
// fitHeight — высота сцены (стены), которую тоже надо вписать в экран.
export function createIsoCamera(floorCols, floorRows, fitHeight = 0) {
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    (-BASE_FRUSTUM * aspect) / 2,
    (BASE_FRUSTUM * aspect) / 2,
    BASE_FRUSTUM / 2,
    -BASE_FRUSTUM / 2,
    0.1,
    100
  );
  // Смотрим не в пол, а в середину объёма комнаты (пол + стены) — так
  // картинка центрируется по вертикали без пустого низа
  const targetY = fitHeight / 2;
  camera.position.set(10, 10 + targetY, 10);
  camera.lookAt(0, targetY, 0);

  // Углы комнаты (пол + верх стен) — по ним считаем зум, чтобы всё влезло в экран
  const halfW = floorCols / 2;
  const halfD = floorRows / 2;
  const corners = [];
  for (const y of [0, fitHeight]) {
    corners.push(
      new THREE.Vector3(-halfW, y, -halfD),
      new THREE.Vector3(halfW, y, -halfD),
      new THREE.Vector3(halfW, y, halfD),
      new THREE.Vector3(-halfW, y, halfD)
    );
  }

  // Ручной множитель зума от пользователя (колесо/пинч). 1.0 = ровно авто-вписывание.
  let userZoom = 1.0;
  // Сколько пикселей слева отдать под HUD (плашки уюта/заданий). Комната
  // вписывается в ПРАВУЮ область [reservedLeft, ширина] и сдвигается туда,
  // чтобы панель заданий не перекрывала комнату. 0 = комната по центру.
  let reservedLeft = 0;

  // Габариты комнаты в координатах экрана (NDC) при zoom=1, симметричной рамке
  // без сдвига. Отдельно по X и Y — чтобы вписать по ширине и высоте раздельно.
  function fitMetrics() {
    camera.clearViewOffset();
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    // Обновляем матрицу положения камеры, иначе project() считает её стоящей в нуле
    camera.updateMatrixWorld(true);
    let mx = 0;
    let my = 0;
    for (const corner of corners) {
      const ndc = corner.clone().project(camera);
      mx = Math.max(mx, Math.abs(ndc.x));
      my = Math.max(my, Math.abs(ndc.y));
    }
    return { mx, my };
  }

  // Вписывает комнату: по ШИРИНЕ — в доступную область (экран минус полоса HUD),
  // по ВЫСОТЕ — целиком; затем сдвигает вправо, в центр правой области.
  function applyZoom() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const { mx, my } = fitMetrics();
    const availX = Math.max(0.1, (w - reservedLeft) / w); // доля ширины под комнату
    const fit = Math.min((FILL * availX) / mx, FILL / my);
    camera.zoom = fit * userZoom;
    if (reservedLeft > 0) {
      // сдвиг вправо на половину полосы — комната встаёт по центру правой части.
      // Сдвиг идёт через матрицу проекции, поэтому клики/raycast остаются верными.
      camera.setViewOffset(w, h, -reservedLeft / 2, 0, w, h);
    } else {
      camera.clearViewOffset();
    }
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

  // Ширина левой полосы под HUD (в пикселях). Сильнее ~42% экрана не ужимаем,
  // чтобы на узком телефоне комната не стала крошечной.
  function setReservedLeft(px) {
    reservedLeft = THREE.MathUtils.clamp(px, 0, window.innerWidth * 0.42);
    applyZoom();
  }

  // Меняет ручной зум: factor > 1 приближает, < 1 отдаляет
  function zoomBy(factor) {
    userZoom = THREE.MathUtils.clamp(userZoom * factor, MIN_USER_ZOOM, MAX_USER_ZOOM);
    applyZoom();
  }

  applyZoom(); // стартовое вписывание пола в экран
  return { camera, resize, zoomBy, setReservedLeft };
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
