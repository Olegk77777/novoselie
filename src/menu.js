// menu.js — главное меню: титул поверх живой 3D-сцены, «Продолжить» / «Новая игра»,
// выбор языка (РУС/ENG) и тумблер звука. Тексты — через t() (ключи в locales/),
// в коде только ключи. Стили — блок «Главное меню» в index.html.
//
// Почему звук выбирается здесь, а не отдельным модалом (как было раньше): браузеры
// (особенно Safari) пускают звук только в ответ на явный клик. Клик по «Продолжить» /
// «Новая игра» и есть этот жест — game.js включает музыку прямо в обработчике onStart.
//
// «Новая игра» при живом сохранении показывает подтверждение (те же тексты, что у
// кнопки «Начать заново») и через onWipe() стирает сейв + перезагружает страницу.

export function createMenu({ t, hasSave, lang, onLang, onWipe, onStart }) {
  let sound = true; // звук по умолчанию включён; тумблер внизу переключает

  const overlay = document.createElement('div');
  overlay.id = 'menu';

  const box = document.createElement('div');
  box.className = 'menu-box';

  // Бумажный штамп-кикер — как у модалок (общий класс из index.html)
  const kicker = document.createElement('div');
  kicker.className = 'ui-modal-kicker';
  kicker.textContent = t('menu.kicker');

  const title = document.createElement('div');
  title.className = 'menu-title';
  title.textContent = t('game.title');

  const subtitle = document.createElement('div');
  subtitle.className = 'menu-subtitle';
  subtitle.textContent = t('menu.subtitle');

  // Закрыть меню и отдать управление игре. Оверлей плавно гаснет и удаляется.
  const start = (fresh) => {
    overlay.classList.add('closing');
    document.body.classList.remove('menu');
    setTimeout(() => overlay.remove(), 1000); // дать доиграть fade-out (CSS 0.9s)
    onStart({ sound, fresh });
  };

  // Основные кнопки: «Продолжить» (если есть сохранение) + «Новая игра»
  const buttons = document.createElement('div');
  buttons.className = 'menu-buttons';

  if (hasSave) {
    const cont = document.createElement('button');
    cont.type = 'button';
    cont.className = 'ui-modal-ok';
    cont.textContent = t('menu.continue');
    cont.addEventListener('click', () => start(false));
    buttons.appendChild(cont);
  }

  const freshBtn = document.createElement('button');
  freshBtn.type = 'button';
  // Без сейва «Новая игра» — главная (амбер); с сейвом — вторая (приглушённое стекло)
  freshBtn.className = hasSave ? 'ui-modal-ok ui-modal-alt' : 'ui-modal-ok';
  freshBtn.textContent = t('menu.new_game');
  freshBtn.addEventListener('click', () => {
    if (!hasSave) { start(true); return; }
    // Сохранение есть — новая игра его сотрёт, предупреждаем
    buttons.hidden = true;
    confirmBox.hidden = false;
  });
  buttons.appendChild(freshBtn);

  // Подтверждение «Новой игры» при живом сохранении (тексты те же, что у «Начать заново»)
  const confirmBox = document.createElement('div');
  confirmBox.className = 'menu-confirm';
  confirmBox.hidden = true;
  const confirmText = document.createElement('div');
  confirmText.className = 'menu-confirm-text';
  confirmText.textContent = t('ui.restart_confirm_text');
  const confirmYes = document.createElement('button');
  confirmYes.type = 'button';
  confirmYes.className = 'ui-modal-ok';
  confirmYes.textContent = t('ui.restart_confirm_yes');
  confirmYes.addEventListener('click', () => onWipe()); // game.js: стереть сейв + reload
  const confirmNo = document.createElement('button');
  confirmNo.type = 'button';
  confirmNo.className = 'ui-modal-ok ui-modal-alt';
  confirmNo.textContent = t('ui.restart_confirm_no');
  confirmNo.addEventListener('click', () => {
    confirmBox.hidden = true;
    buttons.hidden = false;
  });
  const confirmBtns = document.createElement('div');
  confirmBtns.className = 'menu-buttons';
  confirmBtns.append(confirmYes, confirmNo);
  confirmBox.append(confirmText, confirmBtns);

  // Нижний ряд: язык (РУС | ENG) и тумблер звука. Подписи языков нарочно не в локали —
  // каждый язык подписан на себе самом, так его найдёт и «чужой» игрок.
  const row = document.createElement('div');
  row.className = 'menu-row';
  const makeLangBtn = (code, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu-mini' + (lang === code ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => { if (lang !== code) onLang(code); });
    return b;
  };
  const soundBtn = document.createElement('button');
  soundBtn.type = 'button';
  soundBtn.className = 'menu-mini';
  const refreshSound = () => {
    soundBtn.textContent = t(sound ? 'menu.sound_on' : 'menu.sound_off');
    soundBtn.classList.toggle('active', sound);
  };
  soundBtn.addEventListener('click', () => { sound = !sound; refreshSound(); });
  refreshSound();
  row.append(makeLangBtn('ru', 'РУС'), makeLangBtn('en', 'ENG'), soundBtn);

  box.append(kicker, title, subtitle, buttons, confirmBox, row);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  // body.menu прячет весь HUD (CSS в index.html) — на экране только сцена и меню
  document.body.classList.add('menu');
}
