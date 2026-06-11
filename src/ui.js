// ui.js — нижняя панель (ячейка предмета, кнопки) и крупная подсказка-тост сверху.
// Все тексты — через функцию t() из locales/, в коде только ключи.

export function createUI({ t, onTake, onRotate, onReturn }) {
  // Десктоп (есть мышь и наведение) — показываем подписи горячих клавиш на кнопках.
  // На сенсорном экране клавиатуры нет, поэтому подписи там не показываем.
  const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hotkey = (key) => (isDesktop ? ` (${key})` : '');
  // Тост-подсказка сверху экрана: крупная, чтобы была заметна и на планшете
  const toast = document.createElement('div');
  toast.id = 'ui-hint-toast';
  document.body.appendChild(toast);

  const panel = document.createElement('div');
  panel.id = 'ui-panel';

  // Ячейка с предметом (слот)
  const slotWrap = document.createElement('div');
  slotWrap.className = 'ui-slot-wrap';
  const slot = document.createElement('button');
  slot.className = 'ui-slot';
  slot.textContent = '🪑'; // иконка-заглушка; в шаге 3 будут нормальные превью
  const label = document.createElement('div');
  label.className = 'ui-slot-label';
  label.textContent = t('items.stool');
  slotWrap.append(slot, label);

  // Кнопки «Повернуть» и «Убрать» — видны, только когда предмет «в руке»
  const rotateBtn = document.createElement('button');
  rotateBtn.className = 'ui-btn';
  rotateBtn.textContent = '⟳ ' + t('ui.rotate') + hotkey('R');
  rotateBtn.hidden = true;
  const returnBtn = document.createElement('button');
  returnBtn.className = 'ui-btn';
  returnBtn.textContent = '⤓ ' + t('ui.to_slot') + hotkey('Esc');
  returnBtn.hidden = true;

  panel.append(slotWrap, rotateBtn, returnBtn);
  document.body.appendChild(panel);

  let slotFull = true;
  slot.addEventListener('click', () => {
    if (slotFull) onTake();
  });
  rotateBtn.addEventListener('click', onRotate);
  returnBtn.addEventListener('click', onReturn);

  // Показывает подсказку со «вспышкой», чтобы смена текста бросалась в глаза
  function showHint(text) {
    toast.textContent = text;
    toast.classList.remove('flash');
    void toast.offsetWidth; // перезапуск CSS-анимации: браузер «замечает» снятие класса
    toast.classList.add('flash');
  }

  // Состояния: 'inSlot' — предмет в ячейке, 'placing' — в руке, 'placed' — стоит на полу
  function setState(state) {
    slotFull = state === 'inSlot';
    slot.classList.toggle('empty', !slotFull);
    slot.textContent = slotFull ? '🪑' : '';
    rotateBtn.hidden = state !== 'placing';
    returnBtn.hidden = state !== 'placing';
    if (state === 'inSlot') showHint(t('ui.hint_take'));
    else if (state === 'placing') showHint(t('ui.hint_place'));
    else showHint(t('ui.hint_pickup'));
  }

  setState('inSlot');
  return { setState };
}
