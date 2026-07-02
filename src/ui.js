// ui.js — панель предметов (ячейки со счётчиками), кнопки действий и подсказка-тост.
// Все тексты — через функцию t() из locales/, в коде только ключи.
// items: [{ id, name, iconUrl, count, enabled }] — из data/items.json (game.js).

export function createUI({ t, items, maxComfort, onTake, onRotate, onReturn, onCinema, onFilterSelect, filters, onRestart }) {
  // Десктоп (есть мышь и наведение) — показываем подписи горячих клавиш на кнопках.
  const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hotkey = (key) => (isDesktop ? ` (${key})` : '');
  // Иконка-глиф в кнопке (красится амбером через .ui-btn-ico)
  const makeIco = (ch) => {
    const s = document.createElement('span');
    s.className = 'ui-btn-ico';
    s.textContent = ch;
    return s;
  };

  // Тост-подсказка сверху экрана: крупная, чтобы была заметна и на планшете
  const toast = document.createElement('div');
  toast.id = 'ui-hint-toast';
  document.body.appendChild(toast);

  // Кнопка «Любование»: прячет ВЕСЬ интерфейс, чтобы рассмотреть комнату без помех.
  // Живёт отдельным fixed-элементом (не внутри HUD), поэтому остаётся видимой, когда
  // HUD скрыт. Тумблер: первый клик прячет интерфейс (game.js двигает комнату в центр),
  // повторный — возвращает. Глаз тонкий, амбер — чтобы не спорил с думерской картинкой.
  const cinemaBtn = document.createElement('button');
  cinemaBtn.id = 'ui-cinema';
  cinemaBtn.type = 'button';
  cinemaBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M1.5 12C4 6.5 20 6.5 22.5 12C20 17.5 4 17.5 1.5 12Z"/>' +
    '<circle cx="12" cy="12" r="3.3"/></svg>';
  let cinema = false;
  function refreshCinema() {
    cinemaBtn.title = t(cinema ? 'ui.cinema_show' : 'ui.cinema_hide');
    cinemaBtn.setAttribute('aria-label', cinemaBtn.title);
    cinemaBtn.classList.toggle('watching', cinema);
    document.body.classList.toggle('cinema', cinema);
  }
  cinemaBtn.addEventListener('click', () => {
    cinema = !cinema;
    refreshCinema();
    if (onCinema) onCinema(cinema);
  });
  document.body.appendChild(cinemaBtn);
  refreshCinema();

  // Кнопка «Начать заново»: стирает сохранённый прогресс и начинает игру с нуля.
  // Та же стеклянная плитка, что глаз/звук, третья в углу. Подтверждение и сам сброс —
  // в game.js (onRestart): ui только рисует кнопку. Прячется в режиме любования (CSS).
  const restartBtn = document.createElement('button');
  restartBtn.id = 'ui-restart';
  restartBtn.type = 'button';
  restartBtn.title = t('ui.restart');
  restartBtn.setAttribute('aria-label', t('ui.restart'));
  restartBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 12a8 8 0 1 1 2.3 5.6"/><path d="M4 20v-4h4"/></svg>';
  restartBtn.addEventListener('click', () => { if (onRestart) onRestart(); });
  document.body.appendChild(restartBtn);

  // Фильтры кадра: ОТДЕЛЬНАЯ кнопка-плитка на каждый фильтр (Плёнка / Кинескоп / …) —
  // прямой выбор, видно все варианты сразу, активный подсвечен. Ряд живёт рядом с «глазом»,
  // но виден ТОЛЬКО в режиме любования (CSS по body.cinema) — вне его фильтры ни к чему.
  // По умолчанию активен первый фильтр (Плёнка) — то, что было до фильтров.
  const filtersBar = document.createElement('div');
  filtersBar.id = 'ui-filters';
  const filterBtns = new Map(); // id → button (для подсветки активного)
  let activeFilter = (filters && filters[0] && filters[0].id) || null;
  function refreshFilters() {
    for (const [id, b] of filterBtns) b.classList.toggle('active', id === activeFilter);
  }
  for (const f of (filters || [])) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ui-filter-btn';
    b.textContent = f.name;        // подпись = имя фильтра (понятнее иконки)
    b.title = f.name;
    b.setAttribute('aria-label', f.name);
    b.addEventListener('click', () => {
      activeFilter = f.id;
      refreshFilters();
      if (onFilterSelect) onFilterSelect(f.id);
    });
    filterBtns.set(f.id, b);
    filtersBar.appendChild(b);
  }
  document.body.appendChild(filtersBar);
  refreshFilters();

  // Модальное уведомление для важных событий (квесты): крупно по центру, с кнопкой
  // ОК. События идут очередью — следующее показывается после закрытия текущего.
  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'ui-modal';
  modalOverlay.hidden = true;
  const modalCard = document.createElement('div');
  modalCard.className = 'ui-modal-card';
  const modalKicker = document.createElement('div');
  modalKicker.className = 'ui-modal-kicker';
  const modalText = document.createElement('div');
  modalText.className = 'ui-modal-text';
  const modalOk = document.createElement('button');
  modalOk.className = 'ui-modal-ok';
  modalOk.textContent = t('ui.ok');
  // Необязательная вторая кнопка — для модала-ВЫБОРА (напр. «Со звуком / Без звука»).
  // По умолчанию скрыта: обычные модалы остаются с одной кнопкой.
  const modalAlt = document.createElement('button');
  modalAlt.className = 'ui-modal-ok ui-modal-alt';
  modalAlt.style.display = 'none';
  const modalButtons = document.createElement('div');
  modalButtons.className = 'ui-modal-buttons';
  modalButtons.append(modalOk, modalAlt);
  modalCard.append(modalKicker, modalText, modalButtons);
  modalOverlay.appendChild(modalCard);
  document.body.appendChild(modalOverlay);

  const modalQueue = [];
  function showNextModal() {
    if (!modalQueue.length) {
      modalOverlay.hidden = true;
      return;
    }
    const { text, kicker, okLabel, altLabel } = modalQueue[0];
    modalKicker.textContent = kicker || '';
    modalKicker.style.display = kicker ? '' : 'none';
    modalText.textContent = text;
    modalOk.textContent = okLabel || t('ui.ok');
    modalAlt.textContent = altLabel || '';
    modalAlt.style.display = altLabel ? '' : 'none';
    // Зелёный вариант — «задание выполнено» (кикер с галочкой)
    modalCard.classList.toggle('done', !!kicker && kicker.includes('✓'));
    modalOverlay.hidden = false;
    modalCard.classList.remove('pop');
    void modalCard.offsetWidth; // перезапуск анимации появления
    modalCard.classList.add('pop');
  }
  modalOk.addEventListener('click', () => {
    const closed = modalQueue.shift();
    showNextModal();
    if (closed && closed.onClose) closed.onClose(); // напр.: показать стрелки на мусор / включить звук
  });
  // Вторая кнопка модала-выбора (напр. «Без звука»)
  modalAlt.addEventListener('click', () => {
    const closed = modalQueue.shift();
    showNextModal();
    if (closed && closed.onAlt) closed.onAlt();
  });

  // Левая колонка: шкала уюта + журнал заданий
  const leftColumn = document.createElement('div');
  leftColumn.id = 'ui-left';

  // Шкала уюта: подпись, число и полоска-прогресс
  const comfortBox = document.createElement('div');
  comfortBox.id = 'ui-comfort';
  const comfortTitle = document.createElement('div');
  comfortTitle.className = 'ui-comfort-title';
  const comfortLabel = document.createElement('span');
  comfortLabel.className = 'ui-comfort-label';
  comfortLabel.textContent = t('ui.comfort');
  const comfortValue = document.createElement('span');
  comfortValue.className = 'ui-comfort-value';
  comfortTitle.append(comfortLabel, comfortValue);
  const comfortBar = document.createElement('div');
  comfortBar.className = 'ui-comfort-bar';
  const comfortFill = document.createElement('div');
  comfortFill.className = 'ui-comfort-fill';
  comfortBar.appendChild(comfortFill);
  comfortBox.append(comfortTitle, comfortBar);

  // Журнал заданий: заголовок со счётчиком и список активных квестов
  const questsBox = document.createElement('div');
  questsBox.id = 'ui-quests';
  questsBox.hidden = true; // появится, когда game.js передаст квесты
  const questsTitle = document.createElement('div');
  questsTitle.className = 'ui-quests-title';
  const questsLabel = document.createElement('span');
  questsLabel.className = 'ui-quests-label';
  questsLabel.textContent = t('ui.quests_title');
  const questsCount = document.createElement('span');
  questsCount.className = 'ui-quests-count';
  questsTitle.append(questsLabel, questsCount);
  const questsList = document.createElement('div');
  questsList.className = 'ui-quests-list';
  questsBox.append(questsTitle, questsList);

  // Список активных бонусов за сочетания — бумажные чипы под журналом
  const combosList = document.createElement('div');
  combosList.className = 'ui-combos';

  leftColumn.append(comfortBox, questsBox, combosList);
  document.body.appendChild(leftColumn);

  // Кнопки действий и сворачивания — в правом верхнем углу (там пусто), чтобы
  // не перекрывать низ комнаты, куда ставятся предметы. Внизу — только панель.
  const top = document.createElement('div');
  top.id = 'ui-top';
  const bottom = document.createElement('div');
  bottom.id = 'ui-bottom';

  // Кнопки «Повернуть» и «Убрать» — видны, только когда предмет «в руке»
  const actions = document.createElement('div');
  actions.id = 'ui-actions';
  const rotateBtn = document.createElement('button');
  rotateBtn.className = 'ui-btn';
  rotateBtn.append(makeIco('⟳'), t('ui.rotate') + hotkey('R'));
  const returnBtn = document.createElement('button');
  returnBtn.className = 'ui-btn';
  returnBtn.append(makeIco('⤓'), t('ui.to_slot') + hotkey('Esc'));
  actions.append(rotateBtn, returnBtn);
  actions.hidden = true;
  rotateBtn.addEventListener('click', onRotate);
  returnBtn.addEventListener('click', onReturn);

  // Панель с ячейками предметов
  const panel = document.createElement('div');
  panel.id = 'ui-panel';

  // Кнопка свернуть/развернуть панель предметов (больше места под комнату)
  const toggle = document.createElement('button');
  toggle.id = 'ui-toggle';
  let collapsed = false;
  function refreshToggle() {
    toggle.textContent = collapsed ? '▴ ' + t('ui.show_items') : '▾ ' + t('ui.hide_items');
    panel.classList.toggle('collapsed', collapsed);
    updateArrows();
  }
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    refreshToggle();
  });

  // Обёртка панели со стрелками-индикаторами: показывают, что список длиннее
  // экрана и его можно прокрутить. Кликом по стрелке — прокрутка.
  const panelWrap = document.createElement('div');
  panelWrap.id = 'ui-panel-wrap';
  const leftArrow = document.createElement('button');
  leftArrow.className = 'ui-scroll-arrow ui-scroll-left';
  leftArrow.textContent = '‹';
  leftArrow.hidden = true;
  const rightArrow = document.createElement('button');
  rightArrow.className = 'ui-scroll-arrow ui-scroll-right';
  rightArrow.textContent = '›';
  rightArrow.hidden = true;
  panelWrap.append(panel, leftArrow, rightArrow);

  // Показываем стрелку с той стороны, где есть ещё непоказанные предметы
  function updateArrows() {
    const maxScroll = panel.scrollWidth - panel.clientWidth;
    const scrollable = !collapsed && maxScroll > 4;
    leftArrow.hidden = !scrollable || panel.scrollLeft <= 2;
    rightArrow.hidden = !scrollable || panel.scrollLeft >= maxScroll - 2;
  }
  panel.addEventListener('scroll', updateArrows);
  // ResizeObserver надёжно ловит момент, когда панель обрела размер (первый показ),
  // а также изменения окна — пересчитываем стрелки тогда же
  new ResizeObserver(updateArrows).observe(panel);
  leftArrow.addEventListener('click', () => panel.scrollBy({ left: -240, behavior: 'smooth' }));
  rightArrow.addEventListener('click', () => panel.scrollBy({ left: 240, behavior: 'smooth' }));

  // Кнопки действий — вверху справа; кнопка «Свернуть» — внизу у своей панели,
  // чтобы было понятно, что именно она сворачивает.
  top.append(actions);
  bottom.append(toggle, panelWrap);
  document.body.append(top, bottom);
  refreshToggle();

  const slots = new Map(); // id → { button, img, badge, count, enabled }

  for (const item of items) {
    const wrap = document.createElement('div');
    wrap.className = 'ui-slot-wrap';

    const button = document.createElement('button');
    button.className = 'ui-slot';
    button.title = item.name;
    const img = document.createElement('img');
    img.className = 'ui-slot-img';
    img.src = item.iconUrl;
    img.alt = item.name;
    const badge = document.createElement('span');
    badge.className = 'ui-slot-badge';
    button.append(img, badge);

    const label = document.createElement('div');
    label.className = 'ui-slot-label';
    label.textContent = item.name;

    wrap.append(button, label);
    panel.appendChild(wrap);

    const slot = { button, img, badge, count: item.count, enabled: item.enabled, locked: false };
    slots.set(item.id, slot);

    button.addEventListener('click', () => {
      if (slot.locked) {
        // Мебель заблокирована, пока не сделан ремонт
        showHint(t('ui.hint_reno_first'));
        return;
      }
      if (!slot.enabled) return; // ячейка отключена (задел на будущее)
      if (slot.count > 0) onTake(item.id);
    });
    refreshSlot(slot);
  }

  // Панель наполнена ячейками — теперь её ширина известна, считаем стрелки
  updateArrows();

  function refreshSlot(slot) {
    const locked = slot.locked;
    slot.button.classList.toggle('locked', locked);
    slot.button.classList.toggle('empty', slot.count === 0 && !locked);
    slot.button.classList.toggle('disabled', !slot.enabled && !locked);
    slot.badge.textContent = (slot.count > 1 && !locked) ? '×' + slot.count : '';
    // у заблокированной ячейки иконку прячем — показываем только замок (::after)
    slot.img.style.visibility = (slot.count > 0 && !locked) ? 'visible' : 'hidden';
  }

  // Показывает подсказку со «вспышкой», чтобы смена текста бросалась в глаза
  function showHint(text) {
    toast.textContent = text;
    toast.classList.remove('flash');
    void toast.offsetWidth; // перезапуск CSS-анимации
    toast.classList.add('flash');
  }

  // Обновляет шкалу уюта (вызывается из game.js при каждой установке/снятии)
  function setComfort(value) {
    comfortValue.textContent = `${value} / ${maxComfort}`;
    comfortFill.style.width = `${maxComfort > 0 ? Math.min(100, (value / maxComfort) * 100) : 0}%`;
  }
  setComfort(0);

  // Обучающая стрелка-указатель на элемент интерфейса: амбер-стрелка + бумажная
  // подпись. Появляется на несколько секунд в начале игры и плавно гаснет — мягко
  // показывает новичку нужную кнопку/панель. placement = с какой стороны от цели
  // рисуем (и куда показывает стрелка): 'right' (стрелка ←), 'left' (→), 'below' (↑).
  // Возвращает функцию dismiss() — убрать стрелку досрочно.
  function showPointer(target, text, placement = 'left', holdMs = 6500) {
    if (!target) return () => {};
    const rect = target.getBoundingClientRect();
    if (!rect.width && !rect.height) return () => {}; // цель скрыта — пропускаем
    const wrap = document.createElement('div');
    wrap.className = 'ui-pointer dir-' + placement;
    const arrow = document.createElement('span');
    arrow.className = 'ui-pointer-arrow';
    const label = document.createElement('div');
    label.className = 'ui-pointer-label';
    label.textContent = text;
    const GAP = 12;
    if (placement === 'right') {
      arrow.textContent = '←';
      wrap.append(arrow, label);
      wrap.style.left = rect.right + GAP + 'px';
      wrap.style.top = rect.top + rect.height / 2 + 'px';
    } else if (placement === 'below' || placement === 'below-right') {
      arrow.textContent = '↑';
      wrap.append(arrow, label);
      wrap.style.top = rect.bottom + GAP + 'px';
      // 'below' центрируем под целью; 'below-right' прижимаем к правому краю цели —
      // для кнопок в самом углу (стрелка ↑ под целью, подпись растягивается влево).
      if (placement === 'below-right') wrap.style.right = window.innerWidth - rect.right + 'px';
      else wrap.style.left = rect.left + rect.width / 2 + 'px';
    } else {
      arrow.textContent = '→';
      wrap.append(label, arrow);
      wrap.style.right = window.innerWidth - rect.left + GAP + 'px';
      wrap.style.top = rect.top + rect.height / 2 + 'px';
    }
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show')); // плавное появление
    let killed = false;
    const dismiss = () => {
      if (killed) return;
      killed = true;
      wrap.classList.remove('show');
      setTimeout(() => wrap.remove(), 600); // дать доиграть fade-out
    };
    setTimeout(dismiss, holdMs);
    return dismiss;
  }

  // Подсказку про вращение показываем ровно один раз — при первом взятии напольного
  // предмета. dismissRotateTip убирает стрелку, если предмет поставили/убрали раньше.
  let rotateTipShown = false;
  let dismissRotateTip = null;

  return {
    setComfort,
    showHint,
    // Крупное модальное уведомление с кнопкой ОК (для важных событий — квесты).
    // kicker — короткая надпись-ярлык сверху («Новое задание» / «Выполнено»).
    // onClose — необязательный колбэк, вызывается при закрытии ИМЕННО этого модала.
    showModal(text, kicker, okLabel, onClose) {
      modalQueue.push({ text, kicker, okLabel, onClose });
      if (modalQueue.length === 1) showNextModal();
    },
    // Модал-ВЫБОР с двумя кнопками. onOk — основная (амбер), onAlt — вторая (приглушённая).
    // Используется для выбора звука при старте; клик по кнопке = жест (нужен Safari для звука).
    showChoice({ text, kicker, okLabel, altLabel, onOk, onAlt }) {
      modalQueue.push({ text, kicker, okLabel, onClose: onOk, altLabel, onAlt });
      if (modalQueue.length === 1) showNextModal();
    },
    // Обновляет список активных бонусов (results — из combos.js)
    setCombos(results) {
      combosList.textContent = '';
      for (const combo of results) {
        if (!combo.active) continue;
        const line = document.createElement('div');
        line.className = 'ui-combo-line';
        const amount = document.createElement('span');
        amount.className = 'ui-combo-amount';
        amount.textContent = `+${combo.bonus}`;
        const name = document.createElement('span');
        name.className = 'ui-combo-name';
        name.textContent = t('combos.' + combo.id);
        line.append(amount, name);
        combosList.appendChild(line);
      }
    },
    // Обновляет журнал заданий. quests — [{ title, done }], активные показываются
    // списком, выполненные считаются в заголовке: «Задания 3/10».
    setQuests(quests) {
      questsBox.hidden = quests.length === 0;
      const doneCount = quests.filter((q) => q.done).length;
      questsCount.textContent = `· ${doneCount} / ${quests.length}`;
      questsList.textContent = '';
      for (const quest of quests) {
        if (quest.done || !quest.active) continue;
        const line = document.createElement('div');
        line.className = 'ui-quest-line';
        const check = document.createElement('span');
        check.className = 'ui-quest-check';
        check.textContent = '☐';
        const text = document.createElement('span');
        text.textContent = quest.title;
        line.append(check, text);
        questsList.appendChild(line);
      }
    },
    // Блокирует/разблокирует ячейки (мебель до окончания ремонта)
    setLocked(ids, locked) {
      for (const id of ids) {
        const slot = slots.get(id);
        if (!slot) continue;
        slot.locked = locked;
        refreshSlot(slot);
      }
    },
    // Состояния: 'inSlot' — ничего в руке, 'placing' — напольный предмет в руке,
    // 'placingWall' — настенный предмет в руке, 'placed' — поставлен
    setState(state) {
      const placing = state === 'placing' || state === 'placingWall';
      actions.hidden = !placing;
      // Настенный предмет висит плоско — кнопку поворота прячем
      rotateBtn.style.display = state === 'placingWall' ? 'none' : '';
      if (state === 'inSlot') showHint(t('ui.hint_take'));
      else if (state === 'placing') showHint(t('ui.hint_place'));
      else if (state === 'placingWall') showHint(t('ui.hint_place_wall'));
      else showHint(t('ui.hint_pickup'));
      // Первый напольный предмет «в руке» — один раз подсказываем про поворот стрелкой
      // на кнопку «Повернуть». Настенные не вращаются (placingWall) — там не показываем.
      if (state === 'placing' && !rotateTipShown) {
        rotateTipShown = true;
        dismissRotateTip = showPointer(rotateBtn, t('ui.tip_rotate'), 'left');
      } else if (state !== 'placing' && dismissRotateTip) {
        dismissRotateTip();
        dismissRotateTip = null;
      }
    },
    // Стрелка-подсказка на журнал заданий (game.js зовёт в начале — после приветствия)
    pointToQuests() {
      showPointer(questsBox, t('ui.tip_quests'), 'right');
    },
    // Стрелка-подсказка на кнопку режима любования (game.js зовёт после ремонта).
    // 'below-right': глаз в самом углу — стрелка ↑ строго под ним, подпись уходит влево
    // (не путается с соседней кнопкой звука, как было бы у боковой стрелки).
    pointToCinema() {
      showPointer(cinemaBtn, t('ui.tip_cinema'), 'below-right');
    },
    // Изменить количество предмета в ячейке (взяли из ячейки −1, вернули +1)
    changeCount(id, delta) {
      const slot = slots.get(id);
      if (!slot) return;
      slot.count += delta;
      refreshSlot(slot);
    },
    // Снимок панели для сохранения: остаток в каждой ячейке + заблокирована ли она
    serialize() {
      const counts = {}, locked = {};
      for (const [id, slot] of slots) { counts[id] = slot.count; locked[id] = slot.locked; }
      return { counts, locked };
    },
    // Восстановить панель из снимка (counts + locked), перерисовать ячейки
    applySave(data) {
      if (!data) return;
      for (const [id, slot] of slots) {
        if (data.counts && id in data.counts) slot.count = data.counts[id];
        if (data.locked && id in data.locked) slot.locked = data.locked[id];
        refreshSlot(slot);
      }
    },
  };
}
