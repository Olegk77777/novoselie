// game.js — точка входа игры: сцена, изометрическая камера, рендер, главный цикл.

import * as THREE from 'three';
// ?v=N в импортах — версия для сброса кэша браузера. При изменении кода поднять
// это число на 1 во всех импортах ниже И в index.html (см. CLAUDE.md, раздел «Кэш»).
import { createFloor, createGridLines } from './grid.js?v=5';
import { createWalls, WALL_HEIGHT } from './walls.js?v=5';
import { createIsoCamera, attachZoomControls } from './camera.js?v=5';
import { createStool } from './items.js?v=5';
import { createPlacement } from './placement.js?v=5';
import { createUI } from './ui.js?v=5';
import { renderItemIcon } from './icon.js?v=5';

// Размер комнаты в клетках (см. CONCEPT.md, v0.1)
const GRID_COLS = 10;
const GRID_ROWS = 8;

// Загружает словарь текстов (локализацию). В коде — только ключи, тексты — в JSON.
async function loadLocale(lang) {
  try {
    // cache: 'no-cache' — браузер каждый раз сверяет файл с сервером,
    // иначе после обновления текстов может показать старую версию из кэша
    const response = await fetch(`locales/${lang}.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error('Не удалось загрузить локализацию:', err);
    return {};
  }
}

// Достаёт текст по ключу вида "game.title"; если нет — возвращает сам ключ
function t(dict, key) {
  return key.split('.').reduce((obj, part) => (obj ? obj[part] : undefined), dict) ?? key;
}

// Показывает плашку с ошибкой, если игра не смогла запуститься
function showError(message) {
  const overlay = document.getElementById('error-overlay');
  overlay.textContent = message;
  overlay.style.display = 'block';
}

async function init() {
  const locale = await loadLocale('ru');
  document.title = t(locale, 'game.title');

  // Сцена — "мир", в который добавляются все объекты
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e); // холодные сумерки за окном

  // Изометрическая камера (модуль camera.js): сама вписывает комнату в экран.
  const { camera, resize: resizeCamera, zoomBy } = createIsoCamera(GRID_COLS, GRID_ROWS, WALL_HEIGHT);

  // Свет: тёплая "лампа" сверху + мягкая общая подсветка, чтобы тени не были чёрными
  const lampLight = new THREE.DirectionalLight(0xffd9a0, 2.0);
  lampLight.position.set(5, 10, 3);
  scene.add(lampLight);
  scene.add(new THREE.AmbientLight(0x9090b0, 1.0));

  // Пол, сетка и стены (пол сохраняем — по нему стреляет луч расстановки)
  const floor = createFloor(GRID_COLS, GRID_ROWS);
  scene.add(floor);
  scene.add(createGridLines(GRID_COLS, GRID_ROWS));
  scene.add(createWalls(GRID_COLS, GRID_ROWS));

  // Рендерер — рисует сцену в <canvas> на странице
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Управление зумом: колесо мыши + щипок двумя пальцами на сенсоре
  attachZoomControls(renderer.domElement, zoomBy);

  // Панель предметов и контроллер расстановки
  const ui = createUI({
    t: (key) => t(locale, key),
    iconUrl: renderItemIcon(createStool),
    onTake: () => placement.startPlacing(createStool),
    onRotate: () => placement.rotate(),
    onReturn: () => placement.cancel(),
  });
  const placement = createPlacement({
    scene,
    camera,
    canvas: renderer.domElement,
    floor,
    cols: GRID_COLS,
    rows: GRID_ROWS,
    onStateChange: (state) => ui.setState(state === 'cancelled' ? 'inSlot' : state),
  });

  // Клавиатура: R — повернуть, Esc — вернуть предмет в ячейку
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') placement.rotate();
    else if (e.code === 'Escape') placement.cancel();
  });

  // При изменении размера окна пересчитываем камеру и холст
  window.addEventListener('resize', () => {
    resizeCamera();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Главный цикл: перерисовываем сцену каждый кадр
  renderer.setAnimationLoop(() => {
    placement.update(); // плавный доворот предмета «в руке»
    renderer.render(scene, camera);
  });
}

init().catch((err) => {
  console.error('Игра не запустилась:', err);
  showError('Failed to start. Open browser console (F12) for details.');
});
