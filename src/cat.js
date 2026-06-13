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
// cols/rows/sub — сетка комнаты (sub = подклеток в клетке, как SUB в placement.js):
// по ней кот ищет путь A* и ОБХОДИТ мебель (занятость приходит в ctx.isBlocked).
export function createCat({ scene, doorPoint, cols, rows, sub, windowFocus }) {
  const root = buildCatModel();
  root.visible = false;
  scene.add(root);
  const parts = root.userData.parts;

  const DOOR = new THREE.Vector3(doorPoint.x, 0, doorPoint.z);
  const from = new THREE.Vector3();   // для дуги прыжка
  const to = new THREE.Vector3();
  const subCols = cols * sub, subRows = rows * sub;
  const SPEED = 2.3;                   // скорость бега, юнитов/сек

  let state = 'hidden';
  let stateStart = 0;   // время начала текущего состояния
  let moveDur = 1;      // длительность прыжка
  let nextAt = null;    // когда коту в следующий раз появиться
  let yawFrom = 0, yawTo = 0; // для доворота в прыжке
  let spotBlocked = false;    // кот пришёл, а место занято
  let now = 0, lastTime = 0;
  let leaveStartY = 0;        // высота, с которой кот спрыгивает (со стула)
  let path = [], pathI = 0, goalKey = ''; // текущий маршрут (мировые точки) и индекс
  let isBlocked = () => false;            // занятость клетки мебелью (из ctx)

  // Сидя кот смотрит В ОКНО (на центр оконного проёма дальней стены). Точка окна
  // приходит из game.js; запасной вариант — центр дальней стены.
  const winFocus = windowFocus || { x: 0, z: -rows / 2 };
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

  // === Сетка и поиск пути (A*) ===
  const inBounds = (c, s) => c >= 0 && c < subCols && s >= 0 && s < subRows;
  const worldToSub = (x, z) => ({
    sc: THREE.MathUtils.clamp(Math.floor((x + cols / 2) * sub), 0, subCols - 1),
    sr: THREE.MathUtils.clamp(Math.floor((z + rows / 2) * sub), 0, subRows - 1),
  });
  const subToWorld = (sc, sr) => new THREE.Vector3(-cols / 2 + (sc + 0.5) / sub, 0, -rows / 2 + (sr + 0.5) / sub);

  // Ближайшая свободная клетка к (sc,sr) — на случай, если цель попала в занятую
  function nearestFree(sc, sr) {
    if (!isBlocked(sc, sr)) return { sc, sr };
    for (let r = 1; r <= 6; r++) {
      for (let dc = -r; dc <= r; dc++) for (let dr = -r; dr <= r; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== r) continue;
        const c = sc + dc, s = sr + dr;
        if (inBounds(c, s) && !isBlocked(c, s)) return { sc: c, sr: s };
      }
    }
    return { sc, sr };
  }

  // A* по подсетке, 8 направлений. Стартовая клетка всегда проходима (кот мог
  // стоять на «занятой» клетке своего табурета). Возвращает массив {sc,sr} или null.
  function findPath(start, goal) {
    const idx = (c, s) => c * subRows + s;
    const h = (c, s) => { const dc = Math.abs(c - goal.sc), ds = Math.abs(s - goal.sr); return (dc + ds) + (Math.SQRT2 - 2) * Math.min(dc, ds); };
    const g = new Map(), came = new Map(), closed = new Set();
    const open = [{ c: start.sc, s: start.sr, f: h(start.sc, start.sr) }];
    g.set(idx(start.sc, start.sr), 0);
    const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let guard = 0;
    while (open.length && guard++ < 4000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      const cId = idx(cur.c, cur.s);
      if (cur.c === goal.sc && cur.s === goal.sr) {
        const out = [{ sc: cur.c, sr: cur.s }]; let k = cId;
        while (came.has(k)) { const p = came.get(k); out.push({ sc: p.c, sr: p.s }); k = idx(p.c, p.s); }
        return out.reverse();
      }
      if (closed.has(cId)) continue; closed.add(cId);
      for (const [dc, ds] of N8) {
        const nc = cur.c + dc, ns = cur.s + ds;
        if (!inBounds(nc, ns)) continue;
        const isStart = nc === start.sc && ns === start.sr;
        if (isBlocked(nc, ns) && !isStart) continue;
        if (dc !== 0 && ds !== 0 && isBlocked(cur.c + dc, cur.s) && isBlocked(cur.c, cur.s + ds)) continue; // не срезать угол
        const nId = idx(nc, ns); if (closed.has(nId)) continue;
        const ng = (g.get(cId) ?? Infinity) + (dc !== 0 && ds !== 0 ? Math.SQRT2 : 1);
        if (ng < (g.get(nId) ?? Infinity)) {
          came.set(nId, { c: cur.c, s: cur.s }); g.set(nId, ng);
          open.push({ c: nc, s: ns, f: ng + h(nc, ns) });
        }
      }
    }
    return null;
  }

  // Прямая видимость между клетками (для сглаживания зигзагов сетки)
  function lineClear(a, b) {
    const steps = Math.ceil(Math.hypot(a.sc - b.sc, a.sr - b.sr)) * 2;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (isBlocked(Math.round(a.sc + (b.sc - a.sc) * t), Math.round(a.sr + (b.sr - a.sr) * t))) return false;
    }
    return true;
  }
  // String-pulling: выкидываем промежуточные точки, если до следующей видно по прямой
  function smooth(cells) {
    if (cells.length <= 2) return cells;
    const out = [cells[0]]; let anchor = 0;
    for (let i = 2; i < cells.length; i++) {
      if (!lineClear(cells[anchor], cells[i])) { out.push(cells[i - 1]); anchor = i - 1; }
    }
    out.push(cells[cells.length - 1]);
    return out;
  }

  // Построить маршрут к мировой точке goalWorld (огибая мебель). Если пути нет —
  // прямая линия (чтобы кот всё равно дошёл, не застрял).
  function buildPath(goalWorld) {
    const s = worldToSub(root.position.x, root.position.z);
    const gRaw = worldToSub(goalWorld.x, goalWorld.z);
    const gg = nearestFree(gRaw.sc, gRaw.sr);
    const cells = findPath(s, gg);
    if (!cells) {
      path = [new THREE.Vector3(root.position.x, 0, root.position.z), new THREE.Vector3(goalWorld.x, 0, goalWorld.z)];
    } else {
      path = smooth(cells).map((c) => subToWorld(c.sc, c.sr));
      path[0] = new THREE.Vector3(root.position.x, 0, root.position.z);
      path[path.length - 1] = new THREE.Vector3(goalWorld.x, 0, goalWorld.z);
    }
    pathI = 1;
  }
  const goalKeyOf = (w) => { const g = worldToSub(w.x, w.z); return `${g.sc},${g.sr}`; };

  // Двигаться вдоль path со скоростью SPEED. Возвращает true, когда дошёл до конца.
  function followPath(dt) {
    let budget = SPEED * dt;
    while (budget > 0 && pathI < path.length) {
      const tgt = path[pathI];
      const dx = tgt.x - root.position.x, dz = tgt.z - root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= budget + 1e-5) {
        root.position.x = tgt.x; root.position.z = tgt.z; budget -= dist; pathI++;
        if (dist > 1e-4) root.rotation.y = Math.atan2(dx, dz);
      } else {
        root.position.x += (dx / dist) * budget; root.position.z += (dz / dist) * budget;
        root.rotation.y = Math.atan2(dx, dz); budget = 0;
      }
    }
    return pathI >= path.length;
  }

  function startJump(stool) {
    from.copy(root.position);
    to.set(stool.position.x, sitY(stool), stool.position.z);
    moveDur = 0.55; stateStart = now;
    yawFrom = root.rotation.y;
    yawTo = yawOf(stool.position.x, stool.position.z, winFocus.x, winFocus.z); // приземлится мордой в окно
    enter('jumping');
  }
  function goLeave() { leaveStartY = root.position.y; buildPath(DOOR); enter('leaving'); }

  function update(time, ctx) {
    now = time;
    const dt = Math.min(Math.max(time - lastTime, 0), 0.05); // защита от скачков (вкладка спала)
    lastTime = time;
    isBlocked = ctx.isBlocked || (() => false);
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
            const ap = approachOf(stool);
            buildPath(ap); goalKey = goalKeyOf(ap);
            enter('entering');
          }
        } else {
          nextAt = null;
        }
        break;

      case 'entering': {
        if (!stool) { goLeave(); break; }
        const ap = approachOf(stool);
        const gk = goalKeyOf(ap);
        if (gk !== goalKey) { buildPath(ap); goalKey = gk; } // табурет передвинули — перестроить путь
        const done = followPath(dt);
        applyPose(parts, 'run', time);
        if (done) {
          if (occupied) { spotBlocked = true; enter('look'); } // место занято — смотрит снизу
          else startJump(stool);                                // прыжок на табурет
        }
        break;
      }

      case 'jumping': {
        const p = ease(prog());
        root.position.lerpVectors(from, to, p);
        root.position.y = from.y + (to.y - from.y) * p + Math.sin(prog() * Math.PI) * 0.28; // дуга прыжка
        const dyaw = Math.atan2(Math.sin(yawTo - yawFrom), Math.cos(yawTo - yawFrom)); // кратчайший доворот
        root.rotation.y = yawFrom + dyaw * p;
        applyPose(parts, prog() < 0.6 ? 'run' : 'sit', time);
        if (prog() >= 1) { root.position.copy(to); enter('sitting'); }
        break;
      }

      case 'sitting':
        if (!stool) { goLeave(); break; }
        root.position.set(stool.position.x, sitY(stool), stool.position.z);
        root.rotation.y = yawOf(stool.position.x, stool.position.z, winFocus.x, winFocus.z); // смотрит в окно
        applyPose(parts, 'sit', time);
        if (occupied) { goLeave(); break; } // на стул что-то поставили — уходит
        if (now - stateStart > 8) goLeave();
        break;

      case 'look': {                       // сидит перед занятым табуретом, смотрит вверх
        if (!stool) { goLeave(); break; }
        const ap = approachOf(stool);
        root.position.set(ap.x, 0, ap.z);
        root.rotation.y = yawOf(ap.x, ap.z, stool.position.x, stool.position.z);
        applyPose(parts, 'look', time);
        if (!occupied) { startJump(stool); break; } // освободили при коте — сразу прыгает
        if (now - stateStart > 4.5) goLeave();
        break;
      }

      case 'leaving': {
        const done = followPath(dt);
        const ky = THREE.MathUtils.clamp((now - stateStart) / 0.35, 0, 1);
        root.position.y = leaveStartY * (1 - ky); // спрыгивание со стула к полу
        applyPose(parts, 'run', time);
        if (done) { root.visible = false; enter('hidden'); nextAt = time + 15 + Math.random() * 15; }
        break;
      }
    }
  }

  return {
    group: root,
    update,
    isSpotBlocked: () => spotBlocked,
    get state() { return state; },
  };
}
