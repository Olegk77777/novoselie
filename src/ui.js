// ui.js — панель предметов (ячейки со счётчиками), кнопки действий и подсказка-тост.
// Все тексты — через функцию t() из locales/, в коде только ключи.
// items: [{ id, name, iconUrl, count, enabled }] — из data/items.json (game.js).

export function createUI({ t, items, maxComfort, onTake, onRotate, onReturn }) {
  // Десктоп (есть мышь и наведение) — показываем подписи горячих клавиш на кнопках.
  const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hotkey = (key) => (isDesktop ? ` (${key})` : '');

  // Тост-подсказка сверху экрана: крупная, чтобы была заметна и на планшете
  const toast = document.createElement('div');
  toast.id = 'ui-hint-toast';
  document.body.appendChild(toast);

  // Шкала уюта (слева сверху): подпись, число и полоска-прогресс
  const comfortBox = document.createElement('div');
  comfortBox.id = 'ui-comfort';
  const comfortTitle = document.createElement('div');
  comfortTitle.className = 'ui-comfort-title';
  const comfortValue = document.createElement('span');
  comfortValue.className = 'ui-comfort-value';
  comfortTitle.append(t('ui.comfort') + ' ', comfortValue);
  const comfortBar = document.createElement('div');
  comfortBar.className = 'ui-comfort-bar';
  const comfortFill = document.createElement('div');
  comfortFill.className = 'ui-comfort-fill';
  comfortBar.appendChild(comfortFill);
  // Список активных бонусов за сочетания — под полоской уюта
  const combosList = document.createElement('div');
  combosList.className = 'ui-combos';
  comfortBox.append(comfortTitle, comfortBar, combosList);
  document.body.appendChild(comfortBox);

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
  rotateBtn.textContent = '⟳ ' + t('ui.rotate') + hotkey('R');
  const returnBtn = document.createElement('button');
  returnBtn.className = 'ui-btn';
  returnBtn.textContent = '⤓ ' + t('ui.to_slot') + hotkey('Esc');
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
  }
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    refreshToggle();
  });

  // Кнопки действий — вверху справа; кнопка «Свернуть» — внизу у своей панели,
  // чтобы было понятно, что именно она сворачивает.
  top.append(actions);
  bottom.append(toggle, panel);
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

  function refreshSlot(slot) {
    slot.button.classList.toggle('empty', slot.count === 0);
    slot.button.classList.toggle('disabled', !slot.enabled || slot.locked);
    slot.badge.textContent = slot.count > 1 ? '×' + slot.count : '';
    slot.img.style.visibility = slot.count > 0 ? 'visible' : 'hidden';
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

  return {
    setComfort,
    showHint,
    // Обновляет список активных бонусов (results — из combos.js)
    setCombos(results) {
      combosList.textContent = '';
      for (const combo of results) {
        if (!combo.active) continue;
        const line = document.createElement('div');
        line.className = 'ui-combo-line';
        line.textContent = `+${combo.bonus} · ${t('combos.' + combo.id)}`;
        combosList.appendChild(line);
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
    },
    // Изменить количество предмета в ячейке (взяли из ячейки −1, вернули +1)
    changeCount(id, delta) {
      const slot = slots.get(id);
      if (!slot) return;
      slot.count += delta;
      refreshSlot(slot);
    },
  };
}
