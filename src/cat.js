// cat.js — кот-житель: появляется как бонус, когда у окна стоит табурет (квест "cat").
// Время от времени забегает из дверного проёма, прыгает на свой табурет, сидит и
// убегает. Если табурет занят (на нём предмет) — подходит, садится перед ним и
// смотрит снизу вверх; тогда game.js показывает задание «освободить место кота».
//
// Модель — низкополигональная (стиль PS1), собрана из примитивов: корпус, голова с
// ушами/мордой/глазами, 4 лапы (качаются при беге), сегментный хвост (виляет).
// Анимация и поведение — конечный автомат в update(time, ctx), который game.js
// зовёт каждый кадр.

import * as THREE from 'three';

// Серый дворовый кот (приглушённые тона — в думерскую палитру)
const FUR = 0x908e87;     // основная шерсть (серый, читается в комнатном свете)
const DARK = 0x615f59;    // тёмные полоски, лапки
const BELLY = 0xb6b3a9;   // светлее — грудь/живот
const EAR = 0xc89a93;     // розоватое ухо изнутри
const NOSE = 0xb87a78;    // нос (мягкий, не ярко-красный)
const EYE = 0x9bd36a;     // зелёные глаза (чуть светятся)

// Собирает модель кота (мордой вдоль +Z). Возвращает корень и именованные части
// для анимации. Все материалы общие — один кот, экономить не на чем, но и плодить ни к чему.
function buildCatModel() {
  const root = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color: FUR });
  const dark = new THREE.MeshLambertMaterial({ color: DARK });
  const belly = new THREE.MeshLambertMaterial({ color: BELLY });
  const ear = new THREE.MeshLambertMaterial({ color: EAR });
  const nose = new THREE.MeshLambertMaterial({ color: NOSE });
  const eye = new THREE.MeshLambertMaterial({ color: EYE, emissive: 0x2c4a18 });

  const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
  const b = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // bodyPivot — общий наклон для позы «сидит»; position.y задаёт рост (лапы до пола)
  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = 0.19;
  root.add(bodyPivot);

  // Корпус (вдоль Z) + грудь снизу светлее + тёмные полоски на спине
  bodyPivot.add(mesh(b(0.2, 0.17, 0.34), fur, 0, 0, 0));
  bodyPivot.add(mesh(b(0.17, 0.1, 0.26), belly, 0, -0.05, 0.02));
  for (const z of [-0.1, -0.02, 0.06, 0.14]) bodyPivot.add(mesh(b(0.205, 0.025, 0.03), dark, 0, 0.085, z));

  // Голова (на +Z): череп, морда, нос, уши-пирамидки, глаза
  const head = new THREE.Group();
  head.position.set(0, 0.05, 0.21);
  bodyPivot.add(head);
  head.add(mesh(b(0.17, 0.15, 0.15), fur, 0, 0, 0));
  head.add(mesh(b(0.1, 0.08, 0.07), fur, 0, -0.035, 0.09));
  head.add(mesh(b(0.026, 0.02, 0.02), nose, 0, -0.04, 0.13));
  const earGeo = new THREE.ConeGeometry(0.055, 0.1, 4);
  const earInGeo = new THREE.ConeGeometry(0.03, 0.06, 4);
  for (const sx of [-1, 1]) {
    const e = mesh(earGeo, fur, sx * 0.06, 0.11, -0.01); e.rotation.y = Math.PI / 4; head.add(e);
    const ei = mesh(earInGeo, ear, sx * 0.06, 0.115, 0.0); ei.rotation.y = Math.PI / 4; head.add(ei);
  }
  for (const sx of [-1, 1]) head.add(mesh(b(0.03, 0.038, 0.02), eye, sx * 0.045, 0.012, 0.077));

  // Лапы: каждая — группа с осью у бедра (качается rotation.x при беге)
  const legGeo = b(0.05, 0.16, 0.055);
  const pawGeo = b(0.06, 0.04, 0.075);
  function makeLeg(x, z) {
    const hip = new THREE.Group();
    hip.position.set(x, -0.03, z);
    hip.add(mesh(legGeo, fur, 0, -0.08, 0));
    hip.add(mesh(pawGeo, dark, 0, -0.155, 0.012));
    bodyPivot.add(hip);
    return hip;
  }
  const legs = {
    FL: makeLeg(-0.07, 0.1), FR: makeLeg(0.07, 0.1),
    BL: makeLeg(-0.07, -0.1), BR: makeLeg(0.07, -0.1),
  };

  // Хвост: цепочка сегментов (на -Z), каждый — ребёнок предыдущего, чтобы изгибался
  const tail = new THREE.Group();
  tail.position.set(0, 0.04, -0.18);
  bodyPivot.add(tail);
  const tailSegs = [];
  let parent = tail;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, 0, i === 0 ? 0 : -0.07);
    seg.add(mesh(b(0.05, 0.05, 0.08), i % 2 ? dark : fur, 0, 0, -0.04));
    parent.add(seg);
    tailSegs.push(seg);
    parent = seg;
  }

  root.userData.parts = { bodyPivot, head, legs, tailSegs };
  return root;
}

// Позы кота. t — время (для покачиваний). Все позы выставляют ВСЕ задействованные
// повороты, чтобы переход между состояниями не оставлял «застрявших» частей.
function applyPose(parts, kind, t) {
  const { bodyPivot, head, legs, tailSegs } = parts;
  if (kind === 'run') {
    const f = t * 13;
    const sw = Math.sin(f);
    bodyPivot.rotation.x = 0;
    bodyPivot.position.y = 0.19 + Math.abs(Math.sin(f)) * 0.012; // лёгкий бег вприпрыжку
    legs.FL.rotation.x = sw * 0.6; legs.BR.rotation.x = sw * 0.6;   // диагональные пары
    legs.FR.rotation.x = -sw * 0.6; legs.BL.rotation.x = -sw * 0.6;
    head.rotation.set(0, 0, 0);
    tailSegs.forEach((s, i) => s.rotation.set(-0.18, Math.sin(f * 0.7 - i * 0.6) * 0.2, 0)); // хвост трубой, метёт
  } else if (kind === 'sit' || kind === 'look') {
    // Прямая «кошачья» посадка: грудь поднята (наклон корпуса), передние лапы
    // вертикально (компенсируют наклон), задние подобраны под себя.
    const tilt = -0.5;
    bodyPivot.rotation.x = tilt;
    bodyPivot.position.y = 0.2;
    legs.FL.rotation.x = -tilt; legs.FR.rotation.x = -tilt;            // передние прямо вниз
    legs.BL.rotation.x = -tilt + 1.5; legs.BR.rotation.x = -tilt + 1.5; // задние сложены
    // Голова в мире смотрит вперёд (sit) или вверх на табурет (look). Мировой наклон
    // головы = tilt + локальный, поэтому локальный = -tilt + up.
    const up = kind === 'look' ? -0.5 : 0;
    head.rotation.set(-tilt + up, Math.sin(t * 1.3) * 0.1, 0);
    // Хвост обёрнут вперёд, кончик подрагивает (в look — нервнее)
    const flick = Math.sin(t * (kind === 'look' ? 6 : 3)) * (kind === 'look' ? 0.45 : 0.3);
    tailSegs.forEach((s, i) => s.rotation.set(0.6, i === tailSegs.length - 1 ? flick : 0.12, 0));
  }
}

// Контроллер кота. doorPoint — точка появления у дверного проёма (мир, на полу).
export function createCat({ scene, doorPoint }) {
  const root = buildCatModel();
  root.visible = false;
  scene.add(root);
  const parts = root.userData.parts;

  const DOOR = new THREE.Vector3(doorPoint.x, 0, doorPoint.z);
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();

  let state = 'hidden';
  let stateStart = 0;   // время начала текущего состояния
  let moveDur = 1;
  let nextAt = null;    // когда коту в следующий раз появиться
  let yawFrom = 0, yawTo = 0; // для доворота в прыжке
  let spotBlocked = false;    // кот пришёл, а место занято
  let now = 0;

  // Сидя кот развёрнут на 3/4 к зрителю (видно мордочку и глаза), а не спиной в окно.
  const SIT_FACE = Math.PI * 0.18;
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const prog = () => THREE.MathUtils.clamp((now - stateStart) / moveDur, 0, 1);
  const sitY = (stool) => (stool.userData.def.surfaceHeight || 0.5) - 0.1;
  // Точка перед табуретом со стороны двери (откуда кот подходит/смотрит)
  function approachOf(stool) {
    const d = new THREE.Vector3().subVectors(DOOR, stool.position).setY(0);
    if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
    d.normalize();
    return new THREE.Vector3().copy(stool.position).addScaledVector(d, 0.5).setY(0);
  }
  const yawOf = (ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az;
    return Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : root.rotation.y;
  };
  function enter(s) { state = s; stateStart = now; }

  function startMove(a, b, dur, faceWindow) {
    from.copy(a); to.copy(b); moveDur = dur; stateStart = now;
    yawFrom = root.rotation.y;
    yawTo = faceWindow ? Math.PI : yawOf(a.x, a.z, b.x, b.z);
    if (!faceWindow) root.rotation.y = yawTo; // в беге смотрим по ходу сразу
  }

  function update(time, ctx) {
    now = time;
    const stool = ctx.stool;
    const occupied = !!ctx.occupied;
    // Освободили место — задание снимается (даже если кот ещё стоит и смотрит)
    if (spotBlocked && !occupied) spotBlocked = false;

    switch (state) {
      case 'hidden':
        root.visible = false;
        if (ctx.active && stool) {
          if (nextAt === null) nextAt = time + 4;        // первое появление
          if (time >= nextAt) {
            root.position.copy(DOOR);
            root.visible = true;
            startMove(DOOR, approachOf(stool), 2.2, false);
            enter('entering');
          }
        } else {
          nextAt = null;
        }
        break;

      case 'entering': {
        if (!stool) { leaveTo(1.6); break; }
        root.position.lerpVectors(from, approachOf(stool), ease(prog()));
        applyPose(parts, 'run', time);
        if (prog() >= 1) {
          if (occupied) {                 // место занято — садится и смотрит снизу
            spotBlocked = true;
            enter('look');
          } else {                        // прыжок на табурет
            from.copy(root.position);
            to.set(stool.position.x, sitY(stool), stool.position.z);
            moveDur = 0.55; stateStart = now;
            yawFrom = root.rotation.y; yawTo = SIT_FACE;
            enter('jumping');
          }
        }
        break;
      }

      case 'jumping': {
        const p = ease(prog());
        root.position.lerpVectors(from, to, p);
        root.position.y = from.y + (to.y - from.y) * p + Math.sin(prog() * Math.PI) * 0.28; // дуга прыжка
        root.rotation.y = yawFrom + (yawTo - yawFrom) * p;
        applyPose(parts, prog() < 0.6 ? 'run' : 'sit', time);
        if (prog() >= 1) { root.position.copy(to); enter('sitting'); }
        break;
      }

      case 'sitting':
        if (!stool) { leaveFromStool(); break; }
        root.position.set(stool.position.x, sitY(stool), stool.position.z);
        root.rotation.y = SIT_FACE;       // сидит, развёрнут на 3/4 к зрителю
        applyPose(parts, 'sit', time);
        if (occupied) { leaveFromStool(); break; } // на стул что-то поставили — уходит
        if (now - stateStart > 8) leaveFromStool();
        break;

      case 'look': {                       // сидит перед занятым табуретом, смотрит вверх
        if (!stool) { leaveTo(1.6); break; }
        const ap = approachOf(stool);
        root.position.set(ap.x, 0, ap.z);
        root.rotation.y = yawOf(ap.x, ap.z, stool.position.x, stool.position.z);
        applyPose(parts, 'look', time);
        if (!occupied) {                   // освободили при коте — сразу прыгает
          from.copy(root.position);
          to.set(stool.position.x, sitY(stool), stool.position.z);
          moveDur = 0.55; stateStart = now; yawFrom = root.rotation.y; yawTo = SIT_FACE;
          enter('jumping');
          break;
        }
        if (now - stateStart > 4.5) leaveTo(1.6);
        break;
      }

      case 'leaving': {
        const p = ease(prog());
        root.position.lerpVectors(from, to, p);
        root.position.y = from.y * (1 - p);  // если прыгал со стула — плавно вниз
        applyPose(parts, 'run', time);
        if (prog() >= 1) { root.visible = false; enter('hidden'); nextAt = time + 15 + Math.random() * 15; }
        break;
      }
    }
  }

  // Уход со стула (сначала к точке перед ним, потом к двери — но упрощаем: сразу к двери)
  function leaveFromStool() { startMove(root.position.clone(), DOOR, 2.2, false); enter('leaving'); }
  function leaveTo(dur) { startMove(root.position.clone(), DOOR, dur, false); enter('leaving'); }

  return {
    group: root,
    update,
    isSpotBlocked: () => spotBlocked,
    get state() { return state; },
  };
}
