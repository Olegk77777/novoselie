// ui.js — нижняя панель: ячейка с предметом, кнопка поворота, строка-подсказка.
// Все тексты — через функцию t() из locales/, в коде только ключи.

export function createUI({ t, onTake, onRotate }) {
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

  // Кнопка поворота (видна, только когда предмет «в руке»)
  const rotateBtn = document.createElement('button');
  rotateBtn.className = 'ui-rotate';
  rotateBtn.textContent = '⟳ ' + t('ui.rotate');
  rotateBtn.hidden = true;

  // Подсказка, что делать дальше
  const hint = document.createElement('div');
  hint.className = 'ui-hint';

  panel.append(slotWrap, rotateBtn, hint);
  document.body.appendChild(panel);

  let slotFull = true;
  slot.addEventListener('click', () => {
    if (slotFull) onTake();
  });
  rotateBtn.addEventListener('click', onRotate);

  // Состояния: 'inSlot' — предмет в ячейке, 'placing' — в руке, 'placed' — стоит на полу
  function setState(state) {
    slotFull = state === 'inSlot';
    slot.classList.toggle('empty', !slotFull);
    slot.textContent = slotFull ? '🪑' : '';
    rotateBtn.hidden = state !== 'placing';
    if (state === 'inSlot') hint.textContent = t('ui.hint_take');
    else if (state === 'placing') hint.textContent = t('ui.hint_place');
    else hint.textContent = t('ui.hint_pickup');
  }

  setState('inSlot');
  return { setState };
}
