// ui.js — панель предметов (ячейки со счётчиками), кнопки действий и подсказка-тост.
// Все тексты — через функцию t() из locales/, в коде только ключи.
// items: [{ id, name, iconUrl, count, enabled }] — из data/items.json (game.js).

export function createUI({ t, items, onTake, onRotate, onReturn }) {
  // Десктоп (есть мышь и наведение) — показываем подписи горячих клавиш на кнопках.
  const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hotkey = (key) => (isDesktop ? ` (${key})` : '');

  // Тост-подсказка сверху экрана: крупная, чтобы была заметна и на планшете
  const toast = document.createElement('div');
  toast.id = 'ui-hint-toast';
  document.body.appendChild(toast);

  // Кнопки «Повернуть» и «Убрать» — отдельной строкой над панелью,
  // чтобы не уезжали при прокрутке ячеек на узких экранах
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
  document.body.appendChild(actions);
  rotateBtn.addEventListener('click', onRotate);
  returnBtn.addEventListener('click', onReturn);

  // Панель с ячейками предметов
  const panel = document.createElement('div');
  panel.id = 'ui-panel';
  document.body.appendChild(panel);

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

    const slot = { button, img, badge, count: item.count, enabled: item.enabled };
    slots.set(item.id, slot);

    button.addEventListener('click', () => {
      if (!slot.enabled) {
        showHint(t('ui.hint_wall_soon'));
        return;
      }
      if (slot.count > 0) onTake(item.id);
    });
    refreshSlot(slot);
  }

  function refreshSlot(slot) {
    slot.button.classList.toggle('empty', slot.count === 0);
    slot.button.classList.toggle('disabled', !slot.enabled);
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

  return {
    // Состояния: 'inSlot' — ничего в руке, 'placing' — предмет в руке, 'placed' — поставлен
    setState(state) {
      actions.hidden = state !== 'placing';
      if (state === 'inSlot') showHint(t('ui.hint_take'));
      else if (state === 'placing') showHint(t('ui.hint_place'));
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
