// game.js — точка входа игры: сцена, камера, ремонт, расстановка, электричество, бонусы.

import * as THREE from 'three';
// ?v=N в импортах — версия для сброса кэша браузера. При изменении кода поднять
// это число на 1 во всех импортах ниже И в index.html (см. CLAUDE.md, раздел «Кэш»).
import { createFloor, createGridLines, applyParquet } from './grid.js?v=86';
import { createWalls, WALL_HEIGHT, getWallSurfaces, applyWallpaper, applyWindow, DOOR_CENTER_Z } from './walls.js?v=86';
import { createIsoCamera, attachZoomControls } from './camera.js?v=86';
import { MODEL_BUILDERS, createDebrisField, createDebrisArrow, createDustMotes } from './items.js?v=86';
import { createPlacement } from './placement.js?v=86';
import { createUI } from './ui.js?v=86';
import { renderItemIcon } from './icon.js?v=86';
import { createPower } from './power.js?v=86';
import { evaluateCombos } from './combos.js?v=86';
import { isQuestDone } from './quests.js?v=86';
import { createCat } from './cat.js?v=86';
import { createLighting } from './lighting.js?v=86';
import { createHeightFog } from './heightfog.js?v=86';
import { createBloom } from './bloom.js?v=86';
import { createFog } from './fog.js?v=86';
import { createMusic } from './music.js?v=86';
import { createCinema } from './cinema.js?v=86';

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
  // Фон — холодная синяя пустота. Это лишь ФОЛБЭК на один кадр / на случай ошибки шейдера:
  // сверху рисуется непрозрачный туман-фон (см. createFog ниже), он и заменяет плоскую заливку.
  scene.background = new THREE.Color(0x10131f);

  // Изометрическая камера: сама вписывает комнату в экран
  const { camera, resize: resizeCamera, zoomBy, setReservedLeft, updateCameraAnim, getZoom, getBaseZoom } = createIsoCamera(GRID_COLS, GRID_ROWS, WALL_HEIGHT);

  // Режим любования (созерцание / lo-fi видео): дышащая камера + кино-слои поверх кадра.
  // Камера смотрит в (0, WALL_HEIGHT/2, 0) — это и есть targetY орбиты. Тексты — из локали
  // (в коде только ключи). enter()/exit() дёргаются из onCinema (кнопка-«глаз» в ui.js).
  const cinema = createCinema({
    camera,
    targetY: WALL_HEIGHT / 2,
    getBaseZoom,
    cards: [t(locale, 'cinema.card_1'), t(locale, 'cinema.card_2'), t(locale, 'cinema.card_3')],
    osdLabel: t(locale, 'cinema.osd_rec'),
    osdDate: t(locale, 'cinema.osd_date'),
    // Дрейф точки внимания: камера медленно «замечает» окно, тёплые приборы, кота — как
    // засыпающий взгляд хозяина. Точки берём из текущей расстановки (вызывается на смене якоря).
    getFocusAnchors: () => {
      const a = [{ x: (winCut.alongMin + winCut.alongMax) / 2, z: winSurf.plane }]; // окно — душа кадра
      const warm = new Set(['floor_lamp', 'tv', 'aquarium', 'lava_lamp', 'candle']);
      for (const it of lastLayout) {
        if (warm.has(it.userData?.def?.id)) a.push({ x: it.position.x, z: it.position.z });
      }
      if (isCatActive()) {
        const stool = catTargetStool();
        if (stool) a.push({ x: stool.position.x, z: stool.position.z });
      }
      return a;
    },
  });

  // Свет: эстетика Хоппера / Limbo-в-цвете. Главное заполнение — ОТ ОКНА (холодное),
  // полумрак синеватый, тепло — от приборов и тёплого света из дверного проёма (контраст).
  // Вся логика в src/lighting.js; оконный свет реагирует на шейдер окна (сутки/сезон/погода).
  const lighting = createLighting(scene, { doorX: -GRID_COLS / 2, doorZ: DOOR_CENTER_Z });

  // Воздушная перспектива (height-fog): дальняя стена и верх углов тонут в холодной дымке
  // по мировой высоте Y. Пол, сетка и низ мебели остаются чистыми (геймплей не страдает).
  // heightFog.apply — «одевалка» материала; продеваем её в стены (их материалы заменяются
  // при ремонте) и в пол. Цвет/плотность дымки задаёт lighting.update() каждый кадр.
  const heightFog = createHeightFog();

  // Пол, сетка, стены. На старте — голый бетон: паркет и обои кладутся при ремонте.
  const floor = createFloor(GRID_COLS, GRID_ROWS);
  floor.receiveShadow = true; // на пол ложатся тени мебели
  heightFog.apply(floor.material); // материал пола стабилен — одеваем один раз
  scene.add(floor);
  scene.add(createGridLines(GRID_COLS, GRID_ROWS));
  const walls = createWalls(GRID_COLS, GRID_ROWS, heightFog.apply);
  walls.traverse((o) => { if (o.isMesh) o.receiveShadow = true; }); // тени на дальние стены
  scene.add(walls);

  // Пылинки в воздухе — еле заметные светящиеся частички (живой воздух). Анимируются
  // через userData.tick в кадровом цикле (как аквариум/окно).
  scene.add(createDustMotes(GRID_COLS, GRID_ROWS, WALL_HEIGHT));

  // Туман-фон: думерская светящаяся мгла вокруг квартиры (вместо плоской заливки).
  // Два полноэкранных квада в клип-пространстве (за комнатой + язычки над кромками).
  // uClear 0..1 рассеивает её — позже от числа открытых комнат, сейчас мягко от уюта.
  const fog = createFog(scene);
  let fogClear = 0;        // текущая степень расчистки (плавно догоняет цель)
  let fogClearTarget = 0;  // цель: доля уюта × 0.35 (туман редеет, но не исчезает)

  // Плоский список анимируемых объектов (у кого есть userData.tick): пыль, аквариум, ТВ,
  // лава-лампа, свеча, штора и т.д. Раньше кадровый цикл обходил ВЕСЬ граф сцены
  // (scene.traverse — сотни боксов обставленной комнаты) только чтобы найти эту горстку.
  // Набор tick-объектов меняется ТОЛЬКО когда что-то ставят/снимают или идёт ремонт —
  // поэтому пересобираем список по событию (rebuildTickables), а в кадре просто бежим по нему.
  let tickables = [];
  const rebuildTickables = () => {
    tickables = [];
    scene.traverse((o) => { if (o.userData.tick) tickables.push(o); });
  };

  // Кот-житель: бонус за квест «табурет у окна». Создаётся скрытым, оживает после
  // выполнения квеста — забегает из дверного проёма, прыгает на свой табурет, сидит,
  // убегает. Появление отсюда (центр дверного проёма по Z).
  // sub: 2 — подклеток в клетке, совпадает с SUB в placement.js (общая сетка занятости)
  // windowFocus — центр оконного проёма дальней стены: на него кот смотрит, сидя на табурете
  const winSurf = getWallSurfaces(GRID_COLS, GRID_ROWS)[0];
  const winCut = winSurf.cutouts[0];
  const cat = createCat({
    scene,
    doorPoint: { x: -GRID_COLS / 2 + 0.5, z: DOOR_CENTER_Z },
    cols: GRID_COLS, rows: GRID_ROWS, sub: 2,
    windowFocus: { x: (winCut.alongMin + winCut.alongMax) / 2, z: winSurf.plane },
  });

  // Рендерер — рисует сцену в <canvas> на странице
  // antialias только на НЕ-ретине (dpr<2). На ретине/iPad плотность 2× и так сглаживает
  // диагонали, а MSAA поверх неё — постоянный налог на пропускную способность GPU (перф-аудит).
  const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
  // Лимит pixelRatio = 2: на ретина-iPad без лимита рисуем вчетверо больше пикселей с
  // тенями — главный убийца fps. 2 достаточно для резкости.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Тени: одна мягкая тень от оконного света. autoUpdate=false — карта теней пересчитывается
  // НЕ каждый кадр, а только когда меняется расстановка (bumpShadows) — экономия для iPad.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  // ACES tone mapping — киношный roll-off в светах: тёплый ламповый свет не выжигается
  // в белый, картинка становится фильмик-думерской, а не «цифровой».
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);
  // Карта теней статична между перестановками — пересчитать по требованию.
  const bumpShadows = () => { renderer.shadowMap.needsUpdate = true; };

  // Bloom/Glow — мягкое свечение вокруг светлых участков (луна, лампы, экран ТВ, аквариум).
  // Не трогает основной рендер: снимает готовый кадр с холста и аддитивно подмешивает сияние
  // (см. src/bloom.js). Параметры (сила/порог/оттенок) приходят из lighting.js каждый кадр.
  const bloom = createBloom(renderer);

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
  // Кот пришёл, а его табурет занят предметом — показываем задание «освободить место».
  // 0 очков уюта: шкала закрывается и без него (если место свободно — задания нет вовсе).
  let catSpotBlocked = false;

  let housewarmingShown = false; // поздравление при полной шкале показываем один раз
  function refreshComfort() {
    const comboSum = comboResults.filter((c) => c.active).reduce((s, c) => s + c.bonus, 0);
    const total = placementComfort + renoComfort + questComfort + comboSum;
    ui.setComfort(total);
    ui.setCombos(comboResults);
    // Туман редеет по мере обживания. Сейчас — мягкий суррогат «открытия комнат»:
    // доля заполненной шкалы × 0.35 (даже на 100% мгла лишь чуть отступает —
    // думерское настроение сохраняем). Полный диапазон 0..1 оставлен на v0.3+ (комнаты).
    fogClearTarget = THREE.MathUtils.clamp(total / maxComfort, 0, 1) * 0.35;
    // Вся шкала уюта закрылась И все задания закрыты — настоящее 100%.
    // Большой поздравительный модал + выдача финального трофея (неоновый фламинго).
    // (Полная шкала по построению уже требует выполнить все задания — награды квестов
    // входят в максимум; явная проверка every(done) — на всякий случай и по смыслу.)
    if (!housewarmingShown && total >= maxComfort && questState.every((q) => q.done)) {
      housewarmingShown = true;
      ui.showModal(
        t(locale, 'ui.housewarming_text'),
        t(locale, 'ui.housewarming_kicker'),
        t(locale, 'ui.housewarming_ok')
      );
      // Трофей: разблокируем неон-фламинго на стену + объясняющий модал (после «Дом»)
      ui.setLocked(['neon_flamingo'], false);
      ui.showModal(t(locale, 'ui.trophy_text'), t(locale, 'ui.trophy_kicker'));
    }
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
    // Журнал = этапы ремонта (первыми) + квесты
    const reno = renoSteps.map((s) => ({
      title: t(locale, s.textKey),
      done: renoDone[s.key],
      active: renoActive(s.key),
    }));
    const quests = questState.map((q) => ({
      title: t(locale, `quests.${q.def.id}`),
      done: q.done,
      active: pending.includes(q),
    }));
    // Задание кота — динамическое: появляется, только пока его табурет занят
    const catTask = catSpotBlocked
      ? [{ title: t(locale, 'quests.free_cat_spot'), done: false, active: true }]
      : [];
    ui.setQuests([...reno, ...quests, ...catTask]);
  }

  // Кот пришёл к занятому табурету / место освободилось — обновляем задание.
  // Модал показываем один раз при появлении задания (как у обычных квестов).
  function setCatSpotBlocked(value) {
    if (value === catSpotBlocked) return;
    catSpotBlocked = value;
    if (value) ui.showModal(t(locale, 'quests.free_cat_spot'), t(locale, 'ui.quest_new_kicker'));
    refreshQuestsUI();
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
        // Разблокировка предмета-награды (лава-лампа была заперта до этого квеста)
        for (const id of quest.def.reward?.unlock || []) ui.setLocked([id], false);
        // Выполнение — крупным модалом (раньше был мелкий тост, его не замечали).
        // У квеста может быть свой текст/ярлык награды (doneText/doneKicker), иначе —
        // показываем сам текст квеста с обычным ярлыком «✓ выполнено».
        const allDone = questState.every((q) => q.done);
        if (allDone) ui.showModal(t(locale, 'ui.quests_all_done'));
        else ui.showModal(
          t(locale, quest.def.doneText || `quests.${quest.def.id}`),
          t(locale, quest.def.doneKicker || 'ui.quest_done_kicker')
        );
      }
    }
    refreshQuestsUI();
    announceNewQuests(ctx); // показать модалом задания, открывшиеся только что
  }

  // === Электричество, бонусы, квесты: пересчёт при изменении расстановки ===
  const power = createPower(scene);
  let lastConnections = new Map(); // прибор → розетка
  let lastLayout = [];
  // Занятые мебелью подклетки — карта препятствий для кота (обходит мебель).
  // Ковры (layer:"rug") НЕ препятствие — по ним кот ходит. Предметы на поверхностях
  // (occupant) клеток пола не держат (нет keys), поэтому в карту не попадают.
  let obstacleKeys = new Set();

  // Удлинитель — бонус за «электрификацию»: открывается, когда ВСЕ приборы хоть
  // раз были подключены к розетке (чтобы сложнее было). До тех пор заблокирован.
  const EXTENSION_ID = 'extension_cord';
  const electricalIds = records.filter((r) => r.cordLength).map((r) => r.id);
  const everConnected = new Set(); // id приборов, которые хоть раз были под током
  let extensionUnlocked = false;

  function recompute(placedItems) {
    lastLayout = placedItems;
    rebuildTickables(); // поставили/забрали предмет — пересобрать список анимируемых
    // Воздушная дымка на новой мебели (идемпотентно: уже одетые материалы пропускаются).
    // Делаем на смене расстановки — действие игрока, не каждый кадр.
    for (const it of placedItems) heightFog.applyTo(it);
    lastConnections = power.update(placedItems);
    // Приборы (ТВ, магнитофон, аквариум) работают только при наличии тока —
    // прокидываем питание в их модели; userData.tick читает это и гасит их без розетки.
    for (const it of placedItems) {
      if (!it.userData.def.cordLength) continue;
      const powered = lastConnections.has(it);
      it.userData.powered = powered;
      if (powered) everConnected.add(it.userData.def.id); // запоминаем «был под током»
    }
    // Все приборы хоть раз запитаны → открываем удлинитель (бонус за электрификацию)
    if (!extensionUnlocked && electricalIds.length && electricalIds.every((id) => everConnected.has(id))) {
      extensionUnlocked = true;
      ui.setLocked([EXTENSION_ID], false);
      ui.showModal(t(locale, 'ui.extension_unlocked_text'), t(locale, 'ui.extension_unlocked_kicker'));
    }
    comboResults = evaluateCombos(comboDefs, placedItems, lastConnections);
    obstacleKeys = new Set();
    for (const it of placedItems) {
      if (it.userData.def.layer === 'rug') continue;
      for (const k of it.userData.keys || []) obstacleKeys.add(k);
    }
    checkQuests(placedItems, lastConnections);
    refreshComfort();
    bumpShadows(); // расстановка изменилась — пересчитать карту теней (autoUpdate=false)
  }

  // === Ремонт по шагам: мусор → окно → паркет → обои → мебель ===
  const furnitureIds = records.filter((r) => r.placement !== 'reno').map((r) => r.id);
  // Часть предметов открывается не вместе с мебелью, а наградой за событие: удлинитель —
  // после электрификации, лава-лампа — за «гости», круглый ковёр — за «соседи» (reward.unlock).
  const QUEST_REWARD_IDS = new Set([EXTENSION_ID, 'lava_lamp', 'round_rug', 'neon_flamingo']);
  const unlockAfterReno = furnitureIds.filter((id) => !QUEST_REWARD_IDS.has(id));
  const renoDone = { debris: false, window: false, floor: false, walls: false };

  // Этапы ремонта — тоже задания (показываются в журнале + модал при выполнении).
  // Активен текущий доступный шаг: мусор → окно → (паркет и обои параллельно).
  const renoSteps = [
    { key: 'debris', textKey: 'reno_task.debris', doneKey: 'reno_task.debris_done' },
    { key: 'window', textKey: 'reno_task.window', doneKey: 'reno_task.window_done' },
    { key: 'floor', textKey: 'reno_task.floor', doneKey: 'reno_task.floor_done' },
    { key: 'walls', textKey: 'reno_task.walls', doneKey: 'reno_task.walls_done' },
  ];
  const renoActive = (key) => {
    if (key === 'debris') return !renoDone.debris;
    if (key === 'window') return renoDone.debris && !renoDone.window;
    if (key === 'floor') return renoDone.window && !renoDone.floor;
    if (key === 'walls') return renoDone.window && !renoDone.walls;
    return false;
  };
  // Модал «выполнено» для этапа ремонта + обновление журнала.
  // onClose — необязательный колбэк по закрытию модалки (напр. показать стрелку на задания
  // ПОСЛЕ уборки мусора, а не одновременно со стрелками на мусор — фидбек Олега).
  function completeRenoStep(key, onClose) {
    const step = renoSteps.find((s) => s.key === key);
    // В журнале шаг — короткое имя (textKey); в модалке «выполнено» — выплата-кадр новеллы (doneKey)
    ui.showModal(t(locale, step.doneKey || step.textKey), t(locale, 'ui.quest_done_kicker'), undefined, onClose);
    refreshQuestsUI();
  }

  function applyReno(def) {
    // Окно: вставляем стекло, открываем паркет и обои
    if (def.applies === 'window') {
      windowGlass = applyWindow(walls, GRID_COLS, GRID_ROWS);
      heightFog.applyTo(walls); // одеть раму окна (Lambert) дымкой; стекло-шейдер пропустится
      rebuildTickables(); // окно/шторы могли добавить анимируемые узлы — обновить список
      renoDone.window = true;
      renoComfort += def.comfort || 0;
      ui.changeCount(def.id, -1);
      ui.setLocked(['reno_parquet', 'reno_wallpaper'], false);
      refreshComfort();
      completeRenoStep('window'); // модал «✓ выполнено» + обновить журнал
      ui.showHint(t(locale, 'ui.hint_reno_after_window'));
      return;
    }
    if (def.applies === 'floor') {
      applyParquet(floor, GRID_COLS, GRID_ROWS);
      renoDone.floor = true;
    } else {
      applyWallpaper(walls, heightFog.apply);
      renoDone.walls = true;
    }
    renoComfort += def.comfort || 0;
    ui.changeCount(def.id, -1);
    refreshComfort();
    completeRenoStep(def.applies === 'floor' ? 'floor' : 'walls'); // модал + журнал
    if (renoDone.floor && renoDone.walls) {
      ui.setLocked(unlockAfterReno, false); // ремонт готов — мебель доступна (кроме удлинителя)
      // Трогательная история про отсутствие потолочного света + первый квест: «принеси свет».
      // Очередь модалов: «✓ обои» → эта история → совет «рисуй светом» → (по закрытии)
      // стрелка на «глаз» любования → подсказка-тост (см. ui.showModal — очередь).
      ui.showModal(t(locale, 'ui.first_light_text'), t(locale, 'ui.first_light_kicker'), t(locale, 'ui.first_light_ok'));
      // Геймплейный совет: расставлять светящиеся предметы островками по всей комнате,
      // «как художник кистью». Идёт сразу за «первым светом» — когда мебель уже открыта.
      // По закрытии — мягкая стрелка на режим любования (теперь есть чем любоваться).
      ui.showModal(
        t(locale, 'ui.light_tip_text'), t(locale, 'ui.light_tip_kicker'), null,
        () => ui.pointToCinema()
      );
      ui.showHint(t(locale, 'ui.hint_reno_done'));
    } else {
      ui.showHint(
        t(locale, renoDone.floor ? 'ui.hint_reno_next_wallpaper' : 'ui.hint_reno_next_parquet')
      );
    }
  }

  // Строительный мусор: кучи по комнате, убираются кликом (первый шаг ремонта)
  const debrisField = createDebrisField();
  debrisField.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(debrisField);
  bumpShadows(); // нарисовать стартовую карту теней (autoUpdate=false)
  let debrisLeft = debrisField.children.length;
  const debrisRay = new THREE.Raycaster();

  // Стрелки-указатели на кучи мусора — обучение первому шагу (по фидбеку: новичок не
  // понял, что мусор надо убирать). Висят над кучами и качаются; появляются на
  // несколько секунд после приветствия. Каждая — ребёнок своей кучи: убрал кучу →
  // стрелка исчезает вместе с ней (см. removeDebrisAt). Кликов стрелка не ловит.
  const ARROW_BASE_Y = 1.05;
  const debrisArrows = [];
  for (const pile of debrisField.children) {
    const arrow = createDebrisArrow();
    arrow.position.set(0, ARROW_BASE_Y, 0);
    arrow.visible = false;
    pile.add(arrow);
    debrisArrows.push(arrow);
  }
  let arrowsActive = false; // показываем стрелки прямо сейчас?
  let arrowsShownAt = -1;   // время начала показа (ставится в первом кадре показа)
  function showDebrisArrows() {
    if (renoDone.debris || !debrisArrows.length) return;
    arrowsActive = true;
    arrowsShownAt = -1;
    for (const a of debrisArrows) if (a.parent) a.visible = true;
  }

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
    bumpShadows(); // кучу убрали — обновить тени
    if (debrisLeft <= 0) {
      renoDone.debris = true;
      arrowsActive = false; // весь мусор убран — стрелки больше не нужны
      renoComfort += DEBRIS_COMFORT;
      refreshComfort();
      ui.setLocked(['reno_window'], false); // открываем «вставить окно»
      // Модал «✓ мусор убран», а по его закрытии — стрелка на журнал заданий. Так подсказка
      // про задания не наслаивается на стрелки-указатели мусора в начале (фидбек Олега).
      completeRenoStep('debris', () => ui.pointToQuests());
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
    // Режим любования: интерфейс скрылся (CSS по body.cinema) — комната плавно
    // переезжает в центр (полоса HUD больше не нужна). Вернулся — едет на место.
    onCinema: (active) => {
      if (active) {
        cinema.enter();           // титульная строка, дыхание камеры, скрытие курсора (выход — глазом)
        setReservedLeft(0, true); // плавно в центр
        document.documentElement.style.setProperty('--room-offset', '0px');
      } else {
        cinema.exit();
        updateReservedLeft(true); // плавно вернуть на «рабочее» место
      }
    },
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
      // Режим любования: пока предмет «в руке», замораживаем дыхание камеры (клетка под
      // курсором не уплывает — точная расстановка). Отпустил — дыхание плавно возвращается.
      cinema.setPlacing(state === 'placing' || state === 'placingWall');
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

  // Левая полоса под HUD: меряем реальную ширину колонки #ui-left и сдвигаем
  // комнату вправо ровно на неё — плашки уюта/заданий больше не перекрывают комнату.
  function updateReservedLeft(animate = false) {
    // В режиме любования комната стоит по центру (полоса = 0) — ресайз её не возвращает.
    if (document.body.classList.contains('cinema')) return;
    const leftEl = document.getElementById('ui-left');
    const applied = setReservedLeft(leftEl ? leftEl.getBoundingClientRect().width + 28 : 0, animate);
    // подсказку-тост сверху центрируем над КОМНАТОЙ (она сдвинута вправо на applied/2)
    document.documentElement.style.setProperty('--room-offset', applied / 2 + 'px');
  }
  updateReservedLeft();
  // Шрифты грузятся асинхронно — ширина колонки может измениться, пересчитаем
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateReservedLeft);

  // === Фоновая музыка: думерский плейлист с очень плавным появлением ===
  // Кнопку выключения звука модуль рисует сам (в углу рядом с «глазом» любования).
  const music = createMusic({
    t: (key) => t(locale, key),
    tracks: [
      'audio/grey_concrete_echo.mp3',
      'audio/concrete_haze.mp3',
      'audio/concrete_fog.mp3',
      'audio/rain_on_glass.mp3',
      'audio/snowfall_tape.mp3',
    ],
  });

  // Первый модал — ВЫБОР ЗВУКА. Так надо не по дизайну, а по необходимости: браузеры
  // (особенно Safari) пускают звук только в ответ на явный клик. Клик по «Со звуком» и
  // есть тот жест — музыка плавно появляется прямо под текстом приветствия. «Без звука»
  // — играть в тишине (звук потом можно включить кнопкой в углу).
  ui.showChoice({
    text: t(locale, 'ui.sound_prompt_text'),
    kicker: t(locale, 'ui.sound_prompt_kicker'),
    okLabel: t(locale, 'ui.sound_prompt_on'),
    altLabel: t(locale, 'ui.sound_prompt_off'),
    onOk: () => music.enable(),   // клик = жест → звук точно заведётся, мягкий fade-in
    onAlt: () => music.disable(), // играем без звука
  });

  // Приветствие — показывается ВТОРЫМ, сразу после выбора звука (думерское, с первыми
  // делами). Закрыл приветствие → на несколько секунд загораются стрелки над кучами
  // мусора (первый шаг — убрать мусор). Стрелка на журнал заданий появится ПОЗЖЕ —
  // когда мусор убран (см. removeDebrisAt), чтобы две подсказки не лезли разом.
  ui.showModal(
    t(locale, 'ui.welcome_text'), t(locale, 'ui.welcome_kicker'), t(locale, 'ui.welcome_ok'),
    showDebrisArrows
  );

  // Клавиатура: R — повернуть, Esc — вернуть предмет в ячейку
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') placement.rotate();
    else if (e.code === 'Escape') placement.cancel();
  });

  // При изменении размера окна пересчитываем камеру и холст
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    bloom.setSize();      // пересоздать цели Bloom под новый размер кадра
    updateReservedLeft(); // заново измерить полосу HUD (вызовет вписывание)
    resizeCamera();       // обновить aspect + вписать комнату
  });

  // «Котов табурет» — ближайший к окну табурет в радиусе квеста (1.5 клетки).
  // Это цель кота; занятость берём из occupant (на табурет поставили ТВ/магнитофон/цветок).
  const catWindowZ = wallSurfaces[0].plane;
  function catTargetStool() {
    let best = null, bestD = Infinity;
    for (const it of lastLayout) {
      if (it.userData.def.id !== 'stool') continue;
      const cx = Math.min(Math.max(it.position.x, windowCutout.alongMin), windowCutout.alongMax);
      const d = Math.hypot(it.position.x - cx, it.position.z - catWindowZ);
      if (d <= 1.5 && d < bestD) { bestD = d; best = it; }
    }
    return best;
  }
  const isCatActive = () => questState.some((q) => q.def.id === 'cat' && q.done);

  // Главный цикл: перерисовываем сцену каждый кадр
  const clock = new THREE.Clock();
  let lastTime = 0;
  rebuildTickables(); // первичный список (пыль, мусор и пр. уже в сцене)

  // Адаптивный потолок fps. Игра созерцательная: В ПОКОЕ держим 30 fps — это кинематографично
  // и вдвое холоднее (на ProMotion родные 120 Гц = вчетверо больше работы, чем нужно). НО ядро
  // геймплея — расстановка: пока игрок ТАЩИТ предмет / зумит / крутит, нужна отзывчивость, поэтому
  // на ~0.6 с после любого ввода поднимаем до 60 fps (предмет липко следует за пальцем/курсором).
  // Камера в режиме любования дышит медленно — 30 хватает. Вся анимация привязана к time/dt:
  // разное число кадров даёт тот же вид по времени. Это главный выигрыш аудита (см. PROGRESS).
  const FRAME_60 = 1 / 60 - 0.001; // активный ввод — плавно
  const FRAME_30 = 1 / 30 - 0.001; // покой — холодно и кинематографично
  const INTERACT_WINDOW = 0.6;     // секунд держим 60 fps после последнего ввода
  let lastRender = -1;
  let lastInteract = -10;
  const bumpInteract = () => { lastInteract = clock.getElapsedTime(); }; // ввод → окно 60 fps
  renderer.domElement.addEventListener('pointermove', bumpInteract, { passive: true });
  renderer.domElement.addEventListener('pointerdown', bumpInteract, { passive: true });
  renderer.domElement.addEventListener('wheel', bumpInteract, { passive: true });
  const cinemaBloom = { strength: 0, threshold: 0, tint: null }; // переиспользуем — без аллокации в кадре
  renderer.setAnimationLoop(() => {
    const time = clock.getElapsedTime();
    const minFrame = (time - lastInteract < INTERACT_WINDOW) ? FRAME_60 : FRAME_30; // 60 при вводе, иначе 30
    if (time - lastRender < minFrame) return;
    lastRender = time;
    placement.update(); // плавный доворот предмета «в руке»
    const dt = time - lastTime; // секунд с прошлого кадра
    lastTime = time;
    updateCameraAnim(dt); // плавный «переезд» комнаты (режим любования)
    cinema.update(dt, time); // дыхание/параллакс камеры в режиме любования (пишет zoom последним)
    // Окно «живёт»: сутки за окном идут по кругу (день → закат → ночь → рассвет)
    if (windowGlass) {
      windowGlass.uniforms.uTime.value = time;
      // Режим любования: запотевание стекла плавно появляется/уходит (uCinema 0↔1).
      const cur = windowGlass.uniforms.uCinema.value;
      const tgt = document.body.classList.contains('cinema') ? 1 : 0;
      windowGlass.uniforms.uCinema.value = cur + (tgt - cur) * (1 - Math.pow(0.02, Math.min(Math.max(dt, 0), 0.1)));
    }
    // Туман-фон: дышит во времени; рассеивается плавно (экспоненциальное сглаживание,
    // не зависящее от fps — расчистка читается как анимация, а не скачок).
    fogClear += (fogClearTarget - fogClear) * (1 - Math.pow(0.06, Math.min(Math.max(dt, 0), 0.1)));
    fog.update(
      time,
      renderer.domElement.width / Math.max(1, renderer.domElement.height),
      getZoom(),
      fogClear
    );
    // Свет комнаты реагирует на окно: оконный свет/полусфера пересчитываются из того же
    // времени (день холодный → закат янтарь → ночь тьма + серебро луны → дождь свинец).
    // update() заодно отдаёт параметры Bloom (ярче ночью/в полнолуние).
    let bloomParams = lighting.update(time, !!windowGlass);
    // Воздушная перспектива: цвет/плотность дымки дальней стены из того же расчёта, что свет
    // окна (SYNC). hazeColor уже в линейном рабочем пространстве (ColorManagement), врезка в
    // шейдере идёт до тон-маппинга — конверсия не нужна. Уют слегка проясняет комнату (как
    // туман-фон fog.js: тот же fogClear). Делаем ДО cinema-пересборки bloomParams (она роняет haze).
    heightFog.u.uHazeColor.value.copy(bloomParams.hazeColor);
    // Мгла ВНУТРИ комнаты уходит от уюта СЛАБЕЕ, чем туман-фон снаружи (0.4→0.25): даже обжитая
    // комната держит думерскую дымку в углах. Время — для клубления; дальний угол (окно/дверь) гуще.
    heightFog.u.uHazeAmt.value = bloomParams.hazeAmt * (1 - 0.25 * fogClear);
    heightFog.u.uTime.value = time;
    heightFog.u.uHazeFar.value = 0.55;
    // Режим любования: свечение еле «дышит» в фазе с зум-бризом. Копируем объект — lighting
    // переиспользует bloomState и пересчитывает его раз в 4 кадра, мутировать на месте нельзя.
    if (document.body.classList.contains('cinema')) {
      cinemaBloom.strength = bloomParams.strength * (1 + 0.06 * Math.sin(time / 17.3));
      cinemaBloom.threshold = bloomParams.threshold;
      cinemaBloom.tint = bloomParams.tint;
      bloomParams = cinemaBloom; // мутируем переиспользуемый объект, не создаём новый каждый кадр
    }
    // Анимированные предметы (аквариум: вода, рыбки, пузырьки) — по плоскому списку,
    // без обхода всего графа сцены каждый кадр (см. rebuildTickables)
    for (let i = 0; i < tickables.length; i++) tickables[i].userData.tick(time);
    // Стрелки на мусор: качаются и мягко мигают, плавно гаснут через несколько секунд
    if (arrowsActive) {
      if (arrowsShownAt < 0) arrowsShownAt = time;
      const age = time - arrowsShownAt;
      const SHOW = 6, FADE = 1.3; // секунд: показ + затухание
      const k = age <= SHOW ? 1 : Math.max(0, 1 - (age - SHOW) / FADE);
      for (let i = 0; i < debrisArrows.length; i++) {
        const a = debrisArrows[i];
        if (!a.parent) continue; // куча убрана — стрелка ушла вместе с ней
        a.position.y = ARROW_BASE_Y + Math.sin(time * 3 + i * 1.7) * 0.12; // покачивание
        a.userData.arrowMat.opacity = k * (0.55 + 0.45 * Math.abs(Math.sin(time * 3.2)));
      }
      if (k <= 0) { arrowsActive = false; for (const a of debrisArrows) a.visible = false; }
    }
    // Кот: забегает на свой табурет у окна, если квест выполнен
    const catStool = catTargetStool();
    cat.update(time, {
      active: isCatActive(),
      stool: catStool,
      occupied: catStool ? !!catStool.userData.occupant : false,
      isBlocked: (sc, sr) => obstacleKeys.has(`${sc},${sr}`), // кот обходит мебель
    });
    setCatSpotBlocked(cat.isSpotBlocked());
    renderer.render(scene, camera);
    bloom.apply(bloomParams); // мягкое свечение поверх готового кадра
  });
}

init().catch((err) => {
  console.error('Игра не запустилась:', err);
  showError('Failed to start. Open browser console (F12) for details.');
});
