// game.js — точка входа игры: сцена, камера, ремонт, расстановка, электричество, бонусы.

import * as THREE from 'three';
// ?v=N в импортах — версия для сброса кэша браузера. При изменении кода поднять
// это число на 1 во всех импортах ниже И в index.html (см. CLAUDE.md, раздел «Кэш»).
import { createFloor, createGridLines, applyParquet } from './grid.js?v=24';
import { createWalls, WALL_HEIGHT, getWallSurfaces, applyWallpaper } from './walls.js?v=24';
import { createIsoCamera, attachZoomControls } from './camera.js?v=24';
import { MODEL_BUILDERS } from './items.js?v=24';
import { createPlacement } from './placement.js?v=24';
import { createUI } from './ui.js?v=24';
import { renderItemIcon } from './icon.js?v=24';
import { createPower } from './power.js?v=24';
import { evaluateCombos } from './combos.js?v=24';
import { isQuestDone } from './quests.js?v=24';

// Размер комнаты в клетках (см. CONCEPT.md, v0.1)
const GRID_COLS = 10;
const GRID_ROWS = 8;

// Загружает словарь текстов (локализацию). В коде — только ключи, тексты — в JSON.
async function loadLocale(lang) {
  try {
    // cache: 'no-cache' — браузер каждый раз сверяет файл с сервером
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

// Загружает JSON-файл данных (предметы, бонусы)
async function loadData(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
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

  // Изометрическая камера: сама вписывает комнату в экран
  const { camera, resize: resizeCamera, zoomBy } = createIsoCamera(GRID_COLS, GRID_ROWS, WALL_HEIGHT);

  // Свет: тёплая "лампа" сверху + мягкая общая подсветка
  const lampLight = new THREE.DirectionalLight(0xffd9a0, 2.0);
  lampLight.position.set(5, 10, 3);
  scene.add(lampLight);
  scene.add(new THREE.AmbientLight(0x9090b0, 1.0));

  // Пол, сетка, стены. На старте — голый бетон: паркет и обои кладутся при ремонте.
  const floor = createFloor(GRID_COLS, GRID_ROWS);
  scene.add(floor);
  scene.add(createGridLines(GRID_COLS, GRID_ROWS));
  const walls = createWalls(GRID_COLS, GRID_ROWS);
  scene.add(walls);

  // Рендерер — рисует сцену в <canvas> на странице
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Управление зумом: колесо мыши + щипок двумя пальцами на сенсоре
  attachZoomControls(renderer.domElement, zoomBy);

  // Данные: предметы, бонусы за сочетания, квесты
  const [itemsData, combosData, questsData] = await Promise.all([
    loadData('data/items.json'),
    loadData('data/combos.json'),
    loadData('data/quests.json'),
  ]);
  const records = itemsData.items;
  const comboDefs = combosData.combos;
  const questDefs = questsData.quests;

  const defs = new Map(); // id → описание предмета (с buildFn)
  const uiItems = [];
  for (const record of records) {
    const buildFn = MODEL_BUILDERS[record.model];
    if (!buildFn) {
      console.warn(`Нет модели "${record.model}" для предмета "${record.id}" — пропускаю.`);
      continue;
    }
    const def = { ...record, buildFn };
    defs.set(def.id, def);
    uiItems.push({
      id: def.id,
      name: t(locale, `items.${def.id}`),
      iconUrl: renderItemIcon(buildFn),
      count: def.count ?? 1,
      enabled: true,
    });
  }

  // Очки уюта предмета по id (для подсчёта максимума с наградами квестов)
  const comfortOf = (id) => records.find((r) => r.id === id)?.comfort || 0;

  // Максимум уюта = предметы + бонусы + награды квестов (очки и предметы)
  const maxComfort =
    records.reduce((sum, r) => sum + (r.comfort || 0) * (r.count ?? 1), 0) +
    comboDefs.reduce((sum, c) => sum + c.bonus, 0) +
    questDefs.reduce(
      (sum, q) =>
        sum +
        (q.reward?.comfort || 0) +
        (q.reward?.items || []).reduce((s, it) => s + comfortOf(it.id) * it.count, 0),
      0
    );

  // === Сводный уют: предметы + ремонт + бонусы + квесты ===
  let placementComfort = 0; // очки поставленных предметов (считает placement.js)
  let renoComfort = 0;      // очки за ремонт (паркет, обои)
  let questComfort = 0;     // очки-награды за выполненные квесты
  let comboResults = [];    // текущие бонусы (combos.js)

  function refreshComfort() {
    const comboSum = comboResults.filter((c) => c.active).reduce((s, c) => s + c.bonus, 0);
    ui.setComfort(placementComfort + renoComfort + questComfort + comboSum);
    ui.setCombos(comboResults);
  }

  // === Квесты: активны первые 2 невыполненных, выполнение — навсегда ===
  const QUESTS_ACTIVE_LIMIT = 2;
  const questState = questDefs.map((def) => ({ def, done: false }));
  const wallSurfaces = getWallSurfaces(GRID_COLS, GRID_ROWS);
  // Окно — вырез дальней стены (для условий «у окна»)
  const windowCutout = wallSurfaces[0].cutouts[0];
  const questCtx = (placedItems, connections) => ({
    placedItems,
    connections,
    windowSeg: { alongMin: windowCutout.alongMin, alongMax: windowCutout.alongMax, z: wallSurfaces[0].plane },
    // Расстояние до ближайшей из двух наших стен (x=-cols/2 и z=-rows/2)
    wallDist: (item) => Math.min(item.position.x + GRID_COLS / 2, item.position.z + GRID_ROWS / 2),
  });

  function refreshQuestsUI() {
    const pending = questState.filter((q) => !q.done).slice(0, QUESTS_ACTIVE_LIMIT);
    ui.setQuests(
      questState.map((q) => ({
        title: t(locale, `quests.${q.def.id}`),
        done: q.done,
        active: pending.includes(q),
      }))
    );
  }

  function checkQuests(placedItems, connections) {
    const ctx = questCtx(placedItems, connections);
    let changed = true;
    while (changed) {
      changed = false;
      const active = questState.filter((q) => !q.done).slice(0, QUESTS_ACTIVE_LIMIT);
      for (const quest of active) {
        if (!isQuestDone(quest.def, ctx)) continue;
        quest.done = true;
        changed = true; // следующий квест мог тоже сразу выполниться
        questComfort += quest.def.reward?.comfort || 0;
        for (const it of quest.def.reward?.items || []) ui.changeCount(it.id, it.count);
        const message = `${t(locale, 'ui.hint_quest_done')} ${t(locale, `quests.${quest.def.id}`)}`;
        const allDone = questState.every((q) => q.done);
        // Тост показываем после хинтов установки (они приходят в этом же тике)
        setTimeout(() => ui.showHint(allDone ? t(locale, 'ui.quests_all_done') : message), 60);
      }
    }
    refreshQuestsUI();
  }

  // === Электричество, бонусы, квесты: пересчёт при изменении расстановки ===
  const power = createPower(scene);
  let lastConnections = new Map(); // прибор → розетка
  let lastLayout = [];

  function recompute(placedItems) {
    lastLayout = placedItems;
    lastConnections = power.update(placedItems);
    comboResults = evaluateCombos(comboDefs, placedItems, lastConnections);
    checkQuests(placedItems, lastConnections);
    refreshComfort();
  }

  // === Ремонт: пока не уложен паркет и не поклеены обои, мебель заблокирована ===
  const furnitureIds = records.filter((r) => r.placement !== 'reno').map((r) => r.id);
  const renoDone = { floor: false, walls: false };

  function applyReno(def) {
    if (def.applies === 'floor') {
      applyParquet(floor, GRID_COLS, GRID_ROWS);
      renoDone.floor = true;
    } else {
      applyWallpaper(walls);
      renoDone.walls = true;
    }
    renoComfort += def.comfort || 0;
    ui.changeCount(def.id, -1);
    refreshComfort();
    if (renoDone.floor && renoDone.walls) {
      ui.setLocked(furnitureIds, false); // ремонт готов — мебель доступна
      ui.showHint(t(locale, 'ui.hint_reno_done'));
    } else {
      ui.showHint(
        t(locale, renoDone.floor ? 'ui.hint_reno_next_wallpaper' : 'ui.hint_reno_next_parquet')
      );
    }
  }

  // Панель предметов и контроллер расстановки
  const ui = createUI({
    t: (key) => t(locale, key),
    items: uiItems,
    maxComfort,
    onTake: (id) => {
      const def = defs.get(id);
      if (def.placement === 'reno') {
        applyReno(def); // ремонт применяется сразу, в руку не берётся
        return;
      }
      if (placement.isPlacing()) return; // в руке уже есть предмет
      ui.changeCount(id, -1);
      placement.startPlacing(def);
    },
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
    wallSurfaces,
    onLayoutChange: recompute,
    onStateChange: (state, itemId) => {
      // Отмена — предмет возвращается в свою ячейку
      if (state === 'cancelled') {
        ui.changeCount(itemId, +1);
        ui.setState('inSlot');
        return;
      }
      if (state === 'placing' && defs.get(itemId)?.placement === 'wall') {
        ui.setState('placingWall'); // у настенного — своя подсказка, без поворота
        return;
      }
      ui.setState(state);
      // Поставили электроприбор — сразу говорим, заработал ли он
      if (state === 'placed' && defs.get(itemId)?.cordLength) {
        const sameId = lastLayout.filter((i) => i.userData.def.id === itemId);
        const justPlaced = sameId[sameId.length - 1];
        ui.showHint(
          t(locale, lastConnections.has(justPlaced) ? 'ui.hint_connected' : 'ui.hint_no_outlet')
        );
      }
    },
    onComfortChange: (total) => {
      placementComfort = total;
      refreshComfort();
    },
  });

  // Стартовое состояние: голая комната, мебель под замком, подсказка про ремонт
  ui.setState('inSlot');
  ui.setLocked(furnitureIds, true);
  ui.showHint(t(locale, 'ui.hint_reno_start'));
  refreshQuestsUI();
  refreshComfort();

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
