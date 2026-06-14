// music.js — фоновая думерская музыка: перемешанный плейлист, очень плавный вход и
// кнопка «выключить звук». Файлы лежат в /audio. Тексты кнопки — через t() (ключи в
// locales/ru.json), в коде только ключи.
//
// Почему Web Audio (AudioContext + GainNode), а не простой audio.volume:
//   на iOS Safari громкость элемента <audio> программно НЕ меняется (свойство volume
//   игнорируется) — значит плавное появление не сработало бы на iPad. Усиление через
//   GainNode работает везде, поэтому плавность делаем им.
//
// Почему музыка НЕ заводится сама при загрузке:
//   браузеры (особенно Safari) запрещают звук, пока пользователь явно не нажал кнопку.
//   Поэтому в начале игры показываем выбор «Со звуком / Без звука» (game.js), и звук
//   включается ИМЕННО кликом по «Со звуком» — этот клик и есть нужный жест. enable()
//   надо вызывать прямо из обработчика клика (внутри жеста), иначе play() не пустят.

export function createMusic({ t, tracks }) {
  // Фоновая громкость: негромко — музыка должна быть атмосферой, а не давить.
  const TARGET_VOLUME = 0.5;
  // За сколько секунд музыка плавно набирает громкость в самый первый раз («не бьёт по ушам»).
  const FADE_IN_SEC = 8;
  // Более короткое плавное затухание/нарастание при выключении/включении звука кнопкой.
  const FADE_TOGGLE_SEC = 0.7;

  // Один элемент <audio> на текущий трек: грузим по одному (не все шесть сразу),
  // чтобы старт игры был лёгким. Следующий подгружается, когда текущий доиграл.
  const audio = new Audio();
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';

  // Перемешиваем порядок треков (Фишер–Йейтс), чтобы каждый запуск звучал иначе.
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  const order = tracks.slice();
  shuffle(order);
  let idx = 0;
  const loadCurrent = () => { audio.src = order[idx]; };
  loadCurrent();

  // Трек доиграл — берём следующий по кругу; после последнего перетасовываем заново.
  audio.addEventListener('ended', () => {
    idx += 1;
    if (idx >= order.length) { idx = 0; shuffle(order); }
    loadCurrent();
    audio.play().catch(() => {});
  });

  // Web Audio создаём лениво — только при первом включении (внутри жеста пользователя),
  // иначе браузер держит контекст «спящим» и звук не пойдёт.
  let ctx = null;
  let gain = null;
  let built = false;     // граф Web Audio уже собран?
  let firstPlay = true;  // первый запуск (длинный fade-in) или последующий (короткий)?
  let muted = false;     // звук выключен пользователем?

  function buildGraph() {
    if (built) return;
    built = true;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return; // совсем старый браузер — тихо выходим, игра работает без музыки
    ctx = new AudioCtx();
    const source = ctx.createMediaElementSource(audio);
    gain = ctx.createGain();
    gain.gain.value = 0; // стартуем из полной тишины — её поднимет fade-in
    source.connect(gain).connect(ctx.destination);
  }

  // Плавно ведём громкость к value за seconds секунд (линейная рампа усиления).
  function ramp(value, seconds) {
    if (!gain || !ctx) return;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(value, now + seconds);
  }

  // Включить звук. ВАЖНО: вызывать прямо из клика (жест) — иначе браузер не пустит play().
  function enable() {
    muted = false;
    buildGraph();
    ctx?.resume?.();
    const dur = firstPlay ? FADE_IN_SEC : FADE_TOGGLE_SEC;
    firstPlay = false;
    audio.play().then(() => ramp(TARGET_VOLUME, dur)).catch(() => {});
    refreshBtn();
  }

  // Выключить звук: плавно гасим и ставим на паузу (если уже играло).
  function disable() {
    muted = true;
    if (built) {
      ramp(0, FADE_TOGGLE_SEC);
      setTimeout(() => { if (muted) audio.pause(); }, FADE_TOGGLE_SEC * 1000 + 50);
    }
    refreshBtn();
  }

  // Кнопка «звук»: тонкая стеклянная плитка в углу (рядом с «глазом» любования).
  const btn = document.createElement('button');
  btn.id = 'ui-sound';
  btn.type = 'button';
  const ICON_ON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 9v6h3.5L13 19V5L7.5 9H4Z"/>' +
    '<path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M18.8 6.2a8 8 0 0 1 0 11.6"/></svg>';
  const ICON_OFF =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 9v6h3.5L13 19V5L7.5 9H4Z"/>' +
    '<path d="M17 9.5l4 5M21 9.5l-4 5"/></svg>';
  function refreshBtn() {
    btn.innerHTML = muted ? ICON_OFF : ICON_ON;
    btn.classList.toggle('muted', muted);
    btn.title = t(muted ? 'ui.music_unmute' : 'ui.music_mute');
    btn.setAttribute('aria-label', btn.title);
  }
  refreshBtn();
  btn.addEventListener('click', () => { if (muted) enable(); else disable(); });
  document.body.appendChild(btn);

  // enable/disable дёргает game.js из модала выбора «Со звуком / Без звука».
  return { enable, disable };
}
