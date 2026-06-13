// game.js — точка входа игры: сцена, камера, ремонт, расстановка, электричество, бонусы.

import * as THREE from 'three';
// ?v=N в импортах — версия для сброса кэша браузера. При изменении кода поднять
// это число на 1 во всех импортах ниже И в index.html (см. CLAUDE.md, раздел «Кэш»).
import { createFloor, createGridLines, applyParquet } from './grid.js?v=31';
import { createWalls, WALL_HEIGHT, getWallSurfaces, applyWallpaper, applyWindow } from './walls.js?v=31';
import { createIsoCamera, attachZoomControls } from './camera.js?v=31';
import { MODEL_BUILDERS, createDebrisField } from './items.js?v=31';
import { createPlacement } from './placement.js?v=31';
import { createUI } from './ui.js?v=31';
import { renderItemIcon } from './icon.js?v=31';
import { createPower } from './power.js?v=31';
import { evaluateCombos } from './combos.js?v=31';
import { isQuestDone } from './quests.js?v=31';

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

  // Уборка строительного мусора даёт уют (не предмет — отдельная константа)
  const DEBRIS_COMFORT = 5;
  // Максимум уюта = уборка мусора + предметы + бонусы + награды квестов
  const maxComfort =
    DEBRIS_COMFORT +
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
  let windowGlass = null;   // материал стекла окна (анимируется в кадровом цикле)
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
    // Расстояние до ближайшей из ВСЕХ четырёх стен. Комната замкнута, но две
    // ближние стены не рисуются (чтобы видеть внутрь) — для игрока они всё равно
    // стены, поэтому «сервант к стене» засчитываем у любой из четырёх.
    wallDist: (item) =>
      Math.min(
        item.position.x + GRID_COLS / 2, // левая (x = -cols/2)
        GRID_COLS / 2 - item.position.x, // правая, ближняя (x = +cols/2)
        item.position.z + GRID_ROWS / 2, // дальняя (z = -rows/2)
        GRID_ROWS / 2 - item.position.z  // ближняя (z = +rows/2)
      ),
  });

  // Квест может стать активным, только когда выполнено его условие появления
  // requires (если задано) — напр. «оба кресла на ковёр» открывается после
  // установки кресел, а не висит с самого начала.
  const reqMet = (q, ctx) => !q.def.requires || isQuestDone(q.def.requires, ctx);
  const availablePending = (ctx) =>
    questState.filter((q) => !q.done && reqMet(q, ctx)).slice(0, QUESTS_ACTIVE_LIMIT);

  function refreshQuestsUI() {
    const pending = availablePending(questCtx(lastLayout, lastConnections));
    ui.setQuests(
      questState.map((q) => ({
        title: t(locale, `quests.${q.def.id}`),
        done: q.done,
        active: pending.includes(q),
      }))
    );
  }

  // Объявление новых заданий крупным модалом — но только появившихся ПОСЛЕ старта.
  // На старте просто запоминаем активные, чтобы не молотить модалами при входе.
  let questsAnnounced = false;
  let prevActiveIds = new Set();
  function announceNewQuests(ctx) {
    const nowActive = availablePending(ctx);
    if (questsAnnounced) {
      for (const q of nowActive) {
        if (!prevActiveIds.has(q.def.id)) {
          ui.showModal(t(locale, `quests.${q.def.id}`), t(locale, 'ui.quest_new_kicker'));
        }
      }
    }
    prevActiveIds = new Set(nowActive.map((q) => q.def.id));
    questsAnnounced = true;
  }

  function checkQuests(placedItems, connections) {
    const ctx = questCtx(placedItems, connections);
    let changed = true;
    while (changed) {
      changed = false;
      const active = availablePending(ctx);
      for (const quest of active) {
        if (!isQuestDone(quest.def, ctx)) continue;
        quest.done = true;
        changed = true; // следующий квест мог тоже сразу выполниться
        questComfort += quest.def.reward?.comfort || 0;
        for (const it of quest.def.reward?.items || []) ui.changeCount(it.id, it.count);
        // Выполнение — крупным модалом (раньше был мелкий тост, его не замечали)
        const allDone = questState.every((q) => q.done);
        if (allDone) ui.showModal(t(locale, 'ui.quests_all_done'));
        else ui.showModal(t(locale, `quests.${quest.def.id}`), t(locale, 'ui.quest_done_kicker'));
      }
    }
    refreshQuestsUI();
    announceNewQuests(ctx); // показать модалом задания, открывшиеся только что
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

  // === Ремонт по шагам: мусор → окно → паркет → обои → мебель ===
  const furnitureIds = records.filter((r) => r.placement !== 'reno').map((r) => r.id);
  const renoDone = { debris: false, window: false, floor: false, walls: false };

  function applyReno(def) {
    // Окно: вставляем стекло, открываем паркет и обои
    if (def.applies === 'window') {
      windowGlass = applyWindow(walls, GRID_COLS, GRID_ROWS);
      renoDone.window = true;
      renoComfort += def.comfort || 0;
      ui.changeCount(def.id, -1);
      ui.setLocked(['reno_parquet', 'reno_wallpaper'], false);
      refreshComfort();
      ui.showHint(t(locale, 'ui.hint_reno_after_window'));
      return;
    }
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

  // Строительный мусор: кучи по комнате, убираются кликом (первый шаг ремонта)
  const debrisField = createDebrisField();
  scene.add(debrisField);
  let debrisLeft = debrisField.children.length;
  const debrisRay = new THREE.Raycaster();

  function removeDebrisAt(event) {
    if (renoDone.debris) return; // мусор уже убран
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    debrisRay.setFromCamera(ndc, camera);
    const hits = debrisRay.intersectObjects(debrisField.children, true);
    if (!hits.length) return;
    let pile = hits[0].object;
    while (pile && !pile.userData.debrisPile) pile = pile.parent;
    if (!pile) return;
    debrisField.remove(pile);
    debrisLeft -= 1;
    if (debrisLeft <= 0) {
      renoDone.debris = true;
      renoComfort += DEBRIS_COMFORT;
      refreshComfort();
      ui.setLocked(['reno_window'], false); // открываем «вставить окно»
      ui.showHint(t(locale, 'ui.hint_reno_window'));
    }
  }
  renderer.domElement.addEventListener('pointerdown', removeDebrisAt);

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

  // Стартовое состояние: грязная комната. Заблокировано всё, кроме уборки мусора —
  // окно, паркет и обои откроются по ходу. Первая подсказка — про мусор.
  ui.setState('inSlot');
  ui.setLocked([...furnitureIds, 'reno_window', 'reno_parquet', 'reno_wallpaper'], true);
  ui.showHint(t(locale, 'ui.hint_reno_debris'));
  refreshQuestsUI();
  announceNewQuests(questCtx(lastLayout, lastConnections)); // запомнить стартовые (без модалов)
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
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    placement.update(); // плавный доворот предмета «в руке»
    // Окно «живёт»: сутки за окном идут по кругу (день → закат → ночь → рассвет)
    if (windowGlass) windowGlass.uniforms.uTime.value = clock.getElapsedTime();
    renderer.render(scene, camera);
  });
}

init().catch((err) => {
  console.error('Игра не запустилась:', err);
  showError('Failed to start. Open browser console (F12) for details.');
});
