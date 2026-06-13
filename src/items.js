// items.js — 3D-модели предметов из примитивов Three.js (стиль PS1).
// Параметры предметов (размер в клетках, уют, количество) — в data/items.json.
// Здесь только геометрия. Каждая модель центрирована по своей площади,
// низ на полу (y=0); занимает size[0]×size[1] клеток (1 клетка = 1 юнит).

import * as THREE from 'three';

// Общий материал с текстурой, если файл есть, и цветом-заглушкой, если нет.
// Игра не ждёт текстур: положил файл в textures/ — материал «оделся» сам.
function texturedMaterial(url, fallbackColor, warnName) {
  const material = new THREE.MeshLambertMaterial({ color: fallbackColor });
  // Цвет для иконки в панели: там текстуру заменяем сплошным цветом (в 56px она
  // читалась бы как шум), поэтому запоминаем родной цвет-заглушку материала.
  material.userData.iconColor = fallbackColor;
  new THREE.TextureLoader().load(
    url,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture;
      material.color.set(0xffffff); // белый, чтобы не тонировать текстуру
      material.needsUpdate = true;
    },
    undefined,
    () => console.warn(`Текстура не найдена (${url}) — ${warnName} пока цветом.`)
  );
  return material;
}

// Общие материалы мебели (текстуры волокон/фактуры делают заметным и поворот)
const woodMaterial = texturedMaterial('textures/wood_light.jpg', 0x9c6b30, 'дерево');
// Орех — отдельный тёмный класс дерева. Пока только у серванта; позже можно
// присвоить и другим «статусным» предметам (новый предмет = указать этот материал).
const walnutMaterial = texturedMaterial('textures/wood_walnut.jpg', 0x7a4028, 'орех');
const plasticMaterial = texturedMaterial('textures/plastic_dark.jpg', 0x35353c, 'пластик');
const metalMaterial = texturedMaterial('textures/metal_brushed.jpg', 0x8a8c94, 'металл');
// Узор ковра: маппится на верх ковра один-в-один (не повторяется)
const rugPatternMaterial = texturedMaterial('textures/rug_pattern.jpg', 0xb05a40, 'узор ковра');
// Ткани: обивка кресла (оливковая рогожка), плед-одеяло, постельный тик
const fabricMaterial = texturedMaterial('textures/fabric_green.jpg', 0x8a875a, 'обивка');
const blanketMaterial = texturedMaterial('textures/bedspread_pattern.jpg', 0x7a3a2e, 'плед');
const linenMaterial = texturedMaterial('textures/bed_linen.jpg', 0xe6dfca, 'постель');
// Бетон — для обломков строительного мусора (та же текстура, что на голых стенах)
const concreteMaterial = texturedMaterial('textures/concrete_bare.jpg', 0x9a968e, 'бетон');

// Палитра остальных материалов (советские приглушённые тона)
const COLORS = {
  fabric: 0x5a7a5a,      // зелёная обивка кресел
  cushion: 0x6f936f,     // подушка кресла посветлее
  mattress: 0xcfc4a6,    // матрас
  pillow: 0xeae4d2,      // подушка кровати
  blanket: 0x7a3a3a,     // одеяло
  rug: 0x8a3030,         // ковёр бордовый
  rugBorder: 0xb05a40,   // кайма ковра
  dark: 0x35353c,        // тёмный пластик/корпуса
  panel: 0x55555e,       // светлее тёмного (панели техники)
  screen: 0x16243d,      // экран ТВ
  metal: 0x8a8c94,       // металл (ножка торшера)
  lampshade: 0xe0a060,   // абажур
  terracotta: 0x9e5a3a,  // горшок
  leaf: 0x3f7a3f,        // листья
  bloom: 0xc04545,       // цветок
  glass: 0x7ab0c8,       // стекло аквариума
  water: 0x3a6a8a,       // вода
  fish: 0xd97a30,        // рыбка
};

// Вспомогалка: бокс с материалом в позиции (x, y, z)
function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

// Слабое устройство (ретина + сенсор ≈ iPad): отключаем второстепенный свет (магнитола).
// Тот же признак, что в lighting.js (дублируем одну строку, чтобы не плодить зависимость).
const LOW_END = window.devicePixelRatio > 1.5 && 'ontouchstart' in window;

// Точечный свет прибора: тёплая/холодная «лужица» от лампы/экрана. БЕЗ тени (дёшево),
// с ограниченным радиусом (distance, decay 2) — не пересвечивает всю комнату. Стартовая
// яркость 0; гасится/зажигается в userData.tick по g.userData.powered (нет тока — 0).
// ВАЖНО: свет вырезается из иконки (icon.js) и призрака (placement.makeGhost), иначе
// засветит превью в панели и будет «лампой в руке» при расстановке.
// ПРАВИЛО НА БУДУЩЕЕ: новый светящийся предмет (лава-лампа, неон, фигурка) — это запись
// в data/items.json (surface:"emissive" + блок light) + такой же makeApplianceLight в его
// builder-функции. Сама система света (lighting.js) и гашение по току уже готовы.
function makeApplianceLight(color, distance, pos) {
  const light = new THREE.PointLight(color, 0, distance, 2);
  light.position.set(pos[0], pos[1], pos[2]);
  light.castShadow = false;
  return light;
}

// Цилиндр — для круглых деталей (верньеры ТВ, динамики, антенны, ручки).
// rx/rz — наклон в радианах (по умолчанию стоит вертикально вдоль Y).
function cyl(radius, h, material, x, y, z, rx = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, h, 12), material);
  mesh.position.set(x, y, z);
  mesh.rotation.x = rx;
  mesh.rotation.z = rz;
  return mesh;
}
// Поворот меша вокруг вертикальной оси (для наваленных обломков мусора)
const rotY = (mesh, a) => { mesh.rotation.y = a; return mesh; };

// Фрагментный шейдер зелёного аквалайзера магнитофона: ретро-сегментный дисплей,
// столбики скачут «под музыку», у каждого свой ритм; сверху падающий пик-маркер.
// Без текстур, светится сам (unlit) — читается как включённый зелёный индикатор.
const EQUALIZER_FRAG = `
  precision mediump float;
  uniform float uTime;
  uniform float uOn;      // 1 — есть ток (аквалайзер горит), 0 — тёмный дисплей
  varying vec2 vUv;
  float eqHash(float n){ return fract(sin(n * 91.37) * 43758.5453); }
  void main(){
    vec2 uv = vUv;
    // Нет тока — погасший дисплей (едва различимый тёмно-зелёный)
    if (uOn < 0.5) { gl_FragColor = vec4(0.012, 0.028, 0.014, 1.0); return; }
    float bars = 7.0;
    float bx = uv.x * bars;
    float col = floor(bx);
    float fx = fract(bx);
    float gap = step(0.14, fx) * step(fx, 0.86);          // зазор между столбиками
    // Уровень столбика — псевдо-спектр: свой ритм + общий «бит»
    float seed = eqHash(col * 1.7 + 3.0);
    float speed = 3.0 + seed * 5.0;
    float lvl = 0.30 + 0.70 * abs(sin(uTime * speed * 0.55 + seed * 9.0))
                       * (0.6 + 0.4 * sin(uTime * 2.3 + col));
    lvl = clamp(lvl, 0.07, 1.0);
    float segs = 9.0;
    float segCenter = (floor(uv.y * segs) + 0.5) / segs;  // центр сегмента по высоте
    float lit = step(segCenter, lvl);
    float segGapY = step(0.16, fract(uv.y * segs));       // тёмные разрывы между сегментами
    // Пик-маркер — отдельная горящая точка чуть выше уровня
    float peak = clamp(lvl + 0.06 + 0.04 * sin(uTime * 1.3 + seed * 6.0), 0.0, 1.0);
    float peakSeg = step(abs(segCenter - peak), 0.5 / segs);
    vec3 onCol = mix(vec3(0.10, 0.85, 0.20), vec3(0.55, 1.0, 0.35), segCenter); // желтее к верху
    vec3 c = mix(vec3(0.02, 0.09, 0.03), onCol, lit * gap);
    c = max(c, peakSeg * gap * vec3(0.7, 1.0, 0.5));
    c *= mix(0.45, 1.0, segGapY);
    c += vec3(0.0, 0.03, 0.0);                            // лёгкое свечение фосфора
    gl_FragColor = vec4(c, 1.0);
  }
`;

// Фрагментный шейдер экрана телевизора: «90-е по телевизору» под плохим аналоговым
// сигналом. 11 «каналов»-передач (контент сгенерирован агентами, каждый — отдельная
// функция ch_*), мастер сам выбирает канал по uChannel и накладывает аналоговую
// деградацию: хроматический сдвиг, лёгкий снег, сканлайны/апертура, сетевой гул,
// бегущая полоса, виньетку выпуклого кинескопа, блик на стекле. Канал и всплески
// помех переключает game.js через uChannel/uStatic (см. tick в createTV).
const TV_FRAG = `
  precision highp float;
  uniform float uTime;
  uniform float uChannel;
  uniform float uStatic;
  uniform float uOn;      // 1 — есть ток (экран работает), 0 — тёмное стекло
  varying vec2 vUv;

  // --- общие хелперы (доступны всем каналам) ---
  float hash11(float n){ return fract(sin(n * 91.37) * 43758.5453); }
  float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for(int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.0; a *= 0.5; } return s; }

  // ===================== КАНАЛЫ (сгенерированы агентами) =====================

  // --- Настроечная таблица ---
  vec3 _testcard_bars(float x){
    float idx = floor(clamp(x,0.0,0.999)*7.0);
    vec3 c = vec3(0.62);
    if(idx>0.5)  c = vec3(0.60,0.58,0.18);
    if(idx>1.5)  c = vec3(0.18,0.55,0.58);
    if(idx>2.5)  c = vec3(0.20,0.52,0.24);
    if(idx>3.5)  c = vec3(0.55,0.22,0.50);
    if(idx>4.5)  c = vec3(0.58,0.22,0.20);
    if(idx>5.5)  c = vec3(0.16,0.20,0.50);
    return c;
  }
  vec3 ch_testcard(vec2 uv, float t){
    float hum = 1.0 + 0.012*sin(t*2.0) + 0.006*sin(t*7.3);
    vec3 col;
    if(uv.y > 0.34){
      col = _testcard_bars(uv.x);
    } else if(uv.y > 0.20){
      float idx = floor(clamp(uv.x,0.0,0.999)*7.0);
      col = (mod(idx,2.0)<0.5) ? vec3(0.12,0.14,0.30) : vec3(0.20);
    } else {
      float s = floor(clamp(uv.x,0.0,0.999)*8.0)/7.0;
      col = vec3(s*0.85+0.05);
    }
    vec2 p = uv - vec2(0.5,0.5);
    float r = length(p);
    float ring = smoothstep(0.255,0.245,r) - smoothstep(0.235,0.225,r);
    float disc = smoothstep(0.245,0.235,r);
    if(disc>0.5){
      vec3 inner = vec3(0.45);
      vec2 g = abs(fract(uv*16.0)-0.5);
      float grid = step(min(g.x,g.y),0.045);
      inner = mix(inner, vec3(0.30), grid*0.6);
      col = inner;
    }
    float cross = step(abs(uv.x-0.5),0.0035) + step(abs(uv.y-0.5),0.0035);
    col = mix(col, vec3(0.85), clamp(cross,0.0,1.0));
    col = mix(col, vec3(0.88), clamp(ring,0.0,1.0));
    float plate = step(0.36,uv.x)*step(uv.x,0.64)*step(0.06,uv.y)*step(uv.y,0.12);
    float blink = 0.5+0.5*sin(t*1.3);
    col = mix(col, vec3(0.10), plate*0.8);
    float seg = step(0.5, fract(uv.x*30.0 - t*0.4));
    col = mix(col, vec3(0.70), plate*seg*0.5*blink);
    return clamp(col*hum, 0.0, 1.0);
  }

  // --- Выпуск новостей «Время» ---
  vec3 _news_studio(vec2 uv, float t){
    float v = smoothstep(-0.2, 1.1, uv.y);
    vec3 top = vec3(0.04, 0.07, 0.16);
    vec3 bot = vec3(0.02, 0.03, 0.07);
    vec3 col = mix(bot, top, v);
    float glow = exp(-pow(length((uv-vec2(0.5,0.62))*vec2(1.4,1.0)),2.0)*3.0);
    col += vec3(0.05,0.08,0.14) * glow * (0.85 + 0.15*sin(t*0.5));
    return col;
  }
  float _news_meridian(vec2 d, float r, float fz, float t){
    float rad = length(d);
    float lon = fz + t*0.35;
    float wob = cos(lon);
    float hw = abs(wob)*r;
    float edge = abs(abs(d.x) - hw);
    float line = smoothstep(0.018*r, 0.0, edge) * step(rad, r);
    line *= 0.5 + 0.5*step(0.0, wob);
    return line;
  }
  vec3 _news_globe(vec2 uv, float t, out float mask){
    vec2 c = vec2(0.5, 0.66);
    vec2 d = (uv - c) * vec2(1.0, 1.0);
    float r = 0.16;
    float rad = length(d);
    mask = smoothstep(r, r-0.012, rad);
    vec3 sphere = mix(vec3(0.06,0.16,0.28), vec3(0.10,0.26,0.40), 1.0-rad/max(r,0.0001));
    float lit = clamp(dot(normalize(vec2(-0.6,0.7)), d/max(rad,0.0001)),0.0,1.0);
    sphere += vec3(0.04,0.10,0.14)*lit;
    float grid = 0.0;
    for(int i=0;i<5;i++){
      float fz = float(i)*1.2566;
      grid += _news_meridian(d, r, fz, t);
    }
    for(int j=0;j<3;j++){
      float yy = (float(j)-1.0)*0.5*r;
      float e = abs(d.y - yy);
      grid += smoothstep(0.014*r,0.0,e)*step(rad,r)*0.7;
    }
    vec3 lines = vec3(0.45,0.75,0.95);
    vec3 col = mix(sphere, lines, clamp(grid,0.0,1.0)*0.7);
    return col;
  }
  float _news_clock(vec2 uv, float t){
    vec2 p = uv - vec2(0.86, 0.86);
    float box = step(abs(p.x),0.10)*step(abs(p.y),0.035);
    float seg = 0.0;
    for(int i=0;i<3;i++){
      float x0 = -0.07 + float(i)*0.06;
      seg += step(abs(p.x-x0),0.02)*step(abs(p.y),0.024);
    }
    float blink = step(0.5, fract(t*0.5));
    float colon = step(abs(p.x+0.01),0.006)*step(abs(p.y),0.018)*blink;
    return box*0.25 + seg*0.8 + colon;
  }
  vec3 ch_news(vec2 uv, float t){
    vec3 col = _news_studio(uv, t);
    float gm;
    vec3 g = _news_globe(uv, t, gm);
    col = mix(col, g, gm);
    float bar1 = step(uv.y,0.20)*step(0.14,uv.y);
    float bar2 = step(uv.y,0.12)*step(0.04,uv.y);
    col = mix(col, vec3(0.10,0.16,0.34), bar1*0.92);
    col = mix(col, vec3(0.55,0.10,0.12), bar2*0.92);
    if(bar2>0.5){
      float sx = fract(uv.x*7.0 + t*0.4);
      float wcell = step(0.15,sx)*step(sx,0.78);
      float wy = step(abs(uv.y-0.08),0.022);
      col = mix(col, vec3(0.92,0.86,0.70), wcell*wy*0.85);
    }
    if(bar1>0.5){
      float lb = step(abs(uv.x-0.12),0.07)*step(abs(uv.y-0.17),0.022);
      col = mix(col, vec3(0.80,0.84,0.95), lb*0.8);
    }
    col += vec3(0.85,0.90,1.0) * _news_clock(uv,t) * 0.6;
    return clamp(col,0.0,1.0);
  }

  // --- Мультики ---
  float _cartoon_circle(vec2 p, vec2 c, float r){
    return smoothstep(r, r - 0.012, length(p - c));
  }
  vec3 ch_cartoon(vec2 uv, float t){
    vec3 skyTop = vec3(0.62, 0.74, 0.82);
    vec3 skyBot = vec3(0.86, 0.84, 0.74);
    vec3 col = mix(skyBot, skyTop, uv.y);
    vec2 sunC = vec2(0.82, 0.82);
    float pulse = 0.075 + 0.006 * sin(t * 1.3);
    float sun = _cartoon_circle(uv, sunC, pulse);
    col = mix(col, vec3(0.95, 0.86, 0.55), sun);
    float halo = smoothstep(0.22, 0.075, length(uv - sunC));
    col = mix(col, vec3(0.93, 0.85, 0.62), halo * 0.35);
    for(int i = 0; i < 2; i++){
      float fi = float(i);
      float cx = fract(0.15 + fi * 0.5 + t * 0.018);
      float cy = 0.66 + fi * 0.08;
      vec2 cc = vec2(cx, cy);
      float cl = _cartoon_circle(uv, cc, 0.05);
      cl = max(cl, _cartoon_circle(uv, cc + vec2(0.055, -0.005), 0.042));
      cl = max(cl, _cartoon_circle(uv, cc - vec2(0.05, 0.0), 0.04));
      col = mix(col, vec3(0.93, 0.92, 0.90), cl * 0.9);
    }
    float hill = 0.30 + 0.10 * sin(uv.x * 3.1416 + 0.3);
    float onHill = smoothstep(hill + 0.01, hill - 0.01, uv.y);
    vec3 grass = mix(vec3(0.42, 0.56, 0.30), vec3(0.34, 0.48, 0.24), uv.x * 0.5);
    col = mix(col, grass, onHill);
    float walk = abs(fract(t * 0.10) * 2.0 - 1.0);
    float px = mix(0.16, 0.84, walk);
    float ground = 0.30 + 0.10 * sin(px * 3.1416 + 0.3);
    float hop = abs(sin(t * 4.2)) * 0.06;
    vec2 bc = vec2(px, ground + 0.055 + hop);
    float body = _cartoon_circle(uv, bc, 0.05);
    body = max(body, _cartoon_circle(uv, bc + vec2(-0.028, 0.052), 0.018));
    body = max(body, _cartoon_circle(uv, bc + vec2( 0.028, 0.052), 0.018));
    col = mix(col, vec3(0.80, 0.62, 0.55), body);
    float dir = sign(fract(t * 0.10) * 2.0 - 1.0);
    vec2 eye = bc + vec2(0.018 * dir, 0.012);
    float eyeW = _cartoon_circle(uv, eye, 0.013);
    col = mix(col, vec3(0.95, 0.95, 0.92), eyeW);
    float eyeP = _cartoon_circle(uv, eye + vec2(0.004 * dir, 0.0), 0.006);
    col = mix(col, vec3(0.15, 0.13, 0.12), eyeP);
    if(uv.y < 0.085 && uv.y > 0.03){
      float run = fract(uv.x * 6.0 - t * 0.25);
      float blk = step(0.35, run) * step(run, 0.78);
      col = mix(col, vec3(0.88, 0.82, 0.66), blk * 0.5);
    }
    return clamp(col, 0.0, 1.0);
  }

  // --- Прогноз погоды ---
  float _weather_eq(float a, float b){ return step(abs(a - b), 0.5); }
  float _weather_digit(vec2 p, float digit){
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;
    float top = step(0.78, p.y);
    float mid = step(0.44, p.y) * step(p.y, 0.56);
    float bot = step(p.y, 0.22);
    float upH = step(0.5, p.y);
    float loH = step(p.y, 0.5);
    float left = step(p.x, 0.25);
    float right = step(0.75, p.x);
    float dd = floor(digit + 0.5);
    float A = 1.0 - max(_weather_eq(dd,1.0), _weather_eq(dd,4.0));
    float B = 1.0 - max(_weather_eq(dd,5.0), _weather_eq(dd,6.0));
    float C = 1.0 - _weather_eq(dd,2.0);
    float D = 1.0 - max(max(_weather_eq(dd,1.0), _weather_eq(dd,4.0)), _weather_eq(dd,7.0));
    float E = max(max(_weather_eq(dd,0.0), _weather_eq(dd,2.0)), max(_weather_eq(dd,6.0), _weather_eq(dd,8.0)));
    float F = 1.0 - max(max(_weather_eq(dd,1.0), _weather_eq(dd,2.0)), max(_weather_eq(dd,3.0), _weather_eq(dd,7.0)));
    float G = 1.0 - max(max(_weather_eq(dd,0.0), _weather_eq(dd,1.0)), _weather_eq(dd,7.0));
    float v = 0.0;
    v = max(v, top * step(0.2,p.x)*step(p.x,0.8) * A);
    v = max(v, bot * step(0.2,p.x)*step(p.x,0.8) * D);
    v = max(v, mid * step(0.2,p.x)*step(p.x,0.8) * G);
    v = max(v, right * upH * B);
    v = max(v, right * loH * C);
    v = max(v, left  * loH * E);
    v = max(v, left  * upH * F);
    return clamp(v, 0.0, 1.0);
  }
  float _weather_land(vec2 uv){
    float m = 0.0;
    m = max(m, step(0.18,uv.x)*step(uv.x,0.74)*step(0.30,uv.y)*step(uv.y,0.70));
    m = max(m, step(0.30,uv.x)*step(uv.x,0.62)*step(0.62,uv.y)*step(uv.y,0.80));
    m = max(m, step(0.40,uv.x)*step(uv.x,0.82)*step(0.22,uv.y)*step(uv.y,0.40));
    m = max(m, step(0.12,uv.x)*step(uv.x,0.30)*step(0.40,uv.y)*step(uv.y,0.56));
    return m;
  }
  vec3 ch_weather(vec2 uv, float t){
    vec3 bg = mix(vec3(0.06,0.12,0.30), vec3(0.03,0.06,0.18), uv.y);
    float land = _weather_land(uv);
    vec3 landCol = vec3(0.20,0.30,0.22);
    float edge = land * (1.0 - _weather_land(uv + vec2(0.006,0.0)) * _weather_land(uv - vec2(0.006,0.0))
                              * _weather_land(uv + vec2(0.0,0.006)) * _weather_land(uv - vec2(0.0,0.006)));
    vec3 col = mix(bg, landCol, land);
    col = mix(col, vec3(0.55,0.70,0.55), edge * 0.6);
    vec2 cp = uv * vec2(3.5, 2.6) + vec2(t * 0.05, t * 0.02);
    float cl = fbm(cp);
    cl = smoothstep(0.55, 0.85, cl);
    float cl2 = smoothstep(0.62, 0.92, fbm(uv * vec2(2.0,1.6) - vec2(t*0.03, 0.0)));
    float clouds = clamp(cl * 0.7 + cl2 * 0.6, 0.0, 1.0);
    col = mix(col, vec3(0.78,0.80,0.86), clouds * 0.7);
    float fx = uv.x + uv.y * 0.4 - fract(t * 0.04);
    float wob = 0.02 * sin(uv.y * 22.0 + t * 0.6);
    float front = smoothstep(0.010, 0.0, abs(fract(fx) - 0.5 + wob));
    col = mix(col, vec3(0.85,0.35,0.30), front * 0.55);
    for (int i = 0; i < 3; i++){
      float fi = float(i);
      vec2 base = vec2(0.16 + fi * 0.26, 0.74);
      vec2 cell = vec2(0.07, 0.11);
      float val = floor(2.0 + 7.0 * fract(hash11(fi * 3.1) + t * 0.03));
      float d10 = floor(val / 10.0);
      float d1  = mod(val, 10.0);
      vec2 pl = (uv - base) / vec2(cell.x * 2.4, cell.y * 1.3);
      float plate = step(0.0, pl.x)*step(pl.x,1.0)*step(0.0,pl.y)*step(pl.y,1.0);
      col = mix(col, vec3(0.02,0.04,0.10), plate * 0.7);
      vec2 p0 = (uv - base) / cell;
      float g = _weather_digit(p0, d10);
      vec2 p1 = (uv - base - vec2(cell.x * 1.15, 0.0)) / cell;
      g = max(g, _weather_digit(p1, d1));
      col = mix(col, vec3(1.0,0.85,0.45), g);
    }
    float bar = step(uv.y, 0.10) * step(0.0, uv.y);
    col = mix(col, vec3(0.02,0.05,0.14), bar * 0.85);
    float run = fract(uv.x * 9.0 + t * 0.5);
    float blk = step(0.15, run) * step(run, 0.62);
    float rowy = step(0.03, uv.y) * step(uv.y, 0.08);
    col = mix(col, vec3(0.55,0.72,0.80), bar * rowy * blk * 0.6);
    float logo = step(0.04,uv.x)*step(uv.x,0.14)*step(0.90,uv.y)*step(uv.y,0.97);
    float blink = 0.6 + 0.4 * sin(t * 1.3);
    col = mix(col, vec3(0.80,0.78,0.40), logo * blink * 0.7);
    return clamp(col, 0.0, 1.0);
  }

  // --- Реклама ---
  float _ad_box(vec2 p, vec2 c, vec2 h){
    vec2 d = abs(p - c) - h;
    return step(max(d.x, d.y), 0.0);
  }
  vec3 ch_ad(vec2 uv, float t){
    float beat = 0.5 + 0.5 * sin(t * 3.4);
    float zoom = 1.0 - 0.07 * beat;
    vec2 p = (uv - 0.5) * zoom + 0.5;
    vec2 c = (p - 0.5) * vec2(1.3, 1.0);
    float r = length(c);
    float a = atan(c.y, c.x + 1e-6);
    float rays = sin(a * 12.0 - t * 1.6);
    float burst = smoothstep(0.0, 0.55, rays);
    float rad = exp(-r * 1.4);
    vec3 col = mix(vec3(0.55, 0.10, 0.06), vec3(0.95, 0.62, 0.10), burst) * (0.35 + 0.65 * rad);
    col = mix(vec3(0.20, 0.05, 0.25), col, 0.7 + 0.3 * beat);
    float ps = 0.16 + 0.03 * beat;
    float box = _ad_box(c, vec2(0.0), vec2(ps * 1.1, ps * 0.85));
    float face = _ad_box(c, vec2(0.0), vec2(ps * 0.95, ps * 0.72));
    col = mix(col, vec3(0.05, 0.55, 0.62), box);
    col = mix(col, vec3(0.85, 0.90, 0.45), face);
    float band = step(0.4, fract(c.x * 6.0 - t * 0.8)) * step(abs(c.y), ps * 0.25) * face;
    col = mix(col, vec3(0.85, 0.10, 0.30), band);
    float blink = step(0.5, fract(t * 2.0));
    float tag = _ad_box(p, vec2(0.80, 0.18), vec2(0.13, 0.08));
    vec3 tagCol = mix(vec3(0.9, 0.85, 0.1), vec3(0.95, 0.15, 0.1), blink);
    col = mix(col, tagCol, tag);
    float digits = step(0.55, fract(p.x * 14.0)) * step(abs(p.y - 0.18), 0.035) * tag;
    col = mix(col, vec3(0.05), digits);
    col *= 1.0 + 0.25 * beat;
    return clamp(col, 0.0, 1.0);
  }

  // --- Ракорд (обратный отсчёт) ---
  float _leader_box(vec2 p, vec2 c, vec2 h){
    vec2 d = abs(p - c) - h;
    return step(max(d.x, d.y), 0.0);
  }
  float _leader_digit(vec2 p, float n){
    float on = 0.0;
    float th = 0.07;
    float w  = 0.18;
    float A=0.0,B=0.0,C=0.0,D=0.0,E=0.0,F=0.0,G=0.0;
    if(n>4.5){A=1.0;C=1.0;D=1.0;F=1.0;G=1.0;}
    else if(n>3.5){B=1.0;C=1.0;F=1.0;G=1.0;}
    else if(n>2.5){A=1.0;B=1.0;C=1.0;D=1.0;G=1.0;}
    else if(n>1.5){A=1.0;B=1.0;D=1.0;E=1.0;G=1.0;}
    else {B=1.0;C=1.0;}
    on = max(on, A*_leader_box(p, vec2(0.0, 0.32), vec2(w, th)));
    on = max(on, G*_leader_box(p, vec2(0.0, 0.00), vec2(w, th)));
    on = max(on, D*_leader_box(p, vec2(0.0,-0.32), vec2(w, th)));
    on = max(on, F*_leader_box(p, vec2(-w, 0.16), vec2(th, 0.18)));
    on = max(on, E*_leader_box(p, vec2(-w,-0.16), vec2(th, 0.18)));
    on = max(on, B*_leader_box(p, vec2( w, 0.16), vec2(th, 0.18)));
    on = max(on, C*_leader_box(p, vec2( w,-0.16), vec2(th, 0.18)));
    return on;
  }
  vec3 ch_leader(vec2 uv, float t){
    vec2 p = uv - 0.5;
    float r = length(p);
    float ang = atan(p.y, p.x + 1e-6);
    vec3 col = vec3(0.10, 0.095, 0.085);
    float disc = smoothstep(0.45, 0.43, r);
    col = mix(col, vec3(0.55, 0.52, 0.46), disc * 0.75);
    float ring = smoothstep(0.012, 0.0, abs(r - 0.44));
    col = mix(col, vec3(0.85, 0.82, 0.72), ring);
    float cross = max(step(abs(p.x), 0.006), step(abs(p.y), 0.006)) * step(r, 0.46);
    col = mix(col, vec3(0.82, 0.79, 0.70), cross * 0.9);
    float ticks = abs(fract(ang / 6.2831853 * 12.0 + 0.5) - 0.5) * 2.0;
    float tick = smoothstep(0.85, 1.0, ticks) * smoothstep(0.40, 0.42, r) * smoothstep(0.45, 0.43, r);
    col = mix(col, vec3(0.88, 0.84, 0.74), tick);
    float sweep = -t * 3.14159265;
    float a = mod(ang - sweep, 6.2831853);
    float wedge = smoothstep(0.55, 0.0, a) * smoothstep(0.44, 0.0, r);
    col = mix(col, vec3(0.90, 0.86, 0.74), wedge * 0.85);
    float edge = smoothstep(0.10, 0.0, a) * step(r, 0.42);
    col = mix(col, vec3(0.96, 0.93, 0.82), edge);
    float n = 5.0 - mod(floor(t), 5.0);
    float d = _leader_digit(p * 3.0, n);
    float pulse = 0.5 + 0.5 * smoothstep(0.0, 0.15, fract(t));
    col = mix(col, vec3(0.06, 0.06, 0.05), d * 0.92);
    col = mix(col, col * (0.8 + 0.2 * pulse), d);
    return clamp(col, 0.0, 1.0);
  }

  // --- Заставка канала ---
  float _ident_box(vec2 p, vec2 b){ vec2 d = abs(p) - b; return max(d.x, d.y); }
  float _ident_diamond(vec2 p, float r){ return abs(p.x) + abs(p.y) - r; }
  vec3 ch_ident(vec2 uv, float t){
    vec2 p = uv - 0.5;
    p.x *= 1.30;
    float g = uv.x * 0.6 + uv.y * 0.4;
    vec3 cA = vec3(0.06, 0.09, 0.17);
    vec3 cB = vec3(0.16, 0.10, 0.07);
    float wob = 0.5 + 0.5 * sin(t * 0.18 + g * 3.0);
    vec3 col = mix(cA, cB, wob);
    col += vec3(0.05, 0.04, 0.03) * (1.0 - length(p) * 1.1);
    vec2 e = p + vec2(0.04, 0.0);
    float d1 = _ident_diamond(e, 0.235);
    float ringOuter = smoothstep(0.012, 0.0, abs(d1));
    float dInner = _ident_diamond(e, 0.135);
    float ringInner = smoothstep(0.010, 0.0, abs(dInner));
    float puls = 0.052 + 0.008 * sin(t * 0.9);
    float core = smoothstep(0.006, 0.0, _ident_diamond(e, puls));
    float corefill = 1.0 - smoothstep(puls - 0.005, puls + 0.01, abs(e.x) + abs(e.y));
    vec3 emblemCol = vec3(0.78, 0.70, 0.42);
    vec3 coreCol   = vec3(0.86, 0.55, 0.30);
    col = mix(col, emblemCol, clamp(ringOuter + ringInner, 0.0, 1.0));
    col = mix(col, coreCol, clamp(core + corefill, 0.0, 1.0) * 0.9);
    float emblemMask = smoothstep(0.02, -0.06, d1);
    float sw = sin(t * 0.55);
    float sweepCoord = (e.x + e.y) * 1.4;
    float band = smoothstep(0.16, 0.0, abs(sweepCoord - sw));
    col += emblemMask * band * vec3(0.55, 0.50, 0.40);
    vec2 n = p - vec2(0.31, 0.0);
    float blink = 0.55 + 0.45 * sin(t * 0.7);
    float dig = 1.0;
    dig = min(dig, _ident_box(n - vec2(-0.035, 0.0), vec2(0.022, 0.072)));
    dig = min(dig, _ident_box(n - vec2( 0.035, 0.0), vec2(0.022, 0.072)));
    float digit = smoothstep(0.008, 0.0, dig);
    col = mix(col, vec3(0.80, 0.74, 0.55) * blink, digit);
    float by = smoothstep(0.012, 0.0, abs(p.y + 0.40));
    float scrollX = fract(uv.x * 5.0 - t * 0.25);
    float words = step(0.35, scrollX) * step(scrollX, 0.78);
    float barMask = by * words * step(abs(p.x), 0.36);
    col = mix(col, vec3(0.55, 0.52, 0.45), barMask * 0.7);
    return clamp(col, 0.0, 1.0);
  }

  // --- Ночной клип ---
  vec3 _clip_palette(float p){
    vec3 a = vec3(0.45, 0.10, 0.55);
    vec3 b = vec3(0.85, 0.15, 0.55);
    vec3 c = vec3(0.10, 0.55, 0.70);
    float s = sin(p * 6.2831);
    vec3 col = mix(a, b, smoothstep(-1.0, 1.0, s));
    col = mix(col, c, smoothstep(-1.0, 1.0, cos(p * 6.2831 * 0.5)));
    return col;
  }
  float _clip_city(float x, float horizon){
    float top = horizon;
    for(int i = 0; i < 5; i++){
      float fi = float(i);
      float w = 0.07 + hash11(fi * 3.1) * 0.06;
      float seg = floor(x / w + hash11(fi) * 7.0);
      float h = 0.05 + hash11(seg + fi * 13.0) * 0.22;
      top = max(top, horizon + h);
    }
    return top;
  }
  float _clip_dancer(vec2 uv, float t){
    float sway = sin(t * 1.6) * 0.06;
    vec2 c = vec2(0.5 + sway, 0.30);
    vec2 p = uv - c;
    float body = length(vec2(p.x * 4.5, (p.y - 0.07) * 1.6)) - 0.22;
    float head = length(p - vec2(0.0, 0.33)) - 0.045;
    float arm = sin(t * 3.1);
    float aL = length(p - vec2(-0.10 - 0.06 * arm, 0.16 + 0.06 * arm)) - 0.03;
    float aR = length(p - vec2( 0.10 + 0.06 * arm, 0.16 - 0.06 * arm)) - 0.03;
    float d = min(min(body, head), min(aL, aR));
    return 1.0 - smoothstep(-0.01, 0.02, d);
  }
  vec3 ch_clip(vec2 uv, float t){
    float beat = 0.85 + 0.15 * pow(abs(sin(t * 2.2)), 6.0);
    float cyc = t * 0.07;
    float horizon = 0.46;
    vec3 sky = mix(vec3(0.03, 0.02, 0.07), _clip_palette(cyc) * 0.25, smoothstep(0.9, horizon, uv.y));
    sky += vec3(0.10, 0.04, 0.16) * smoothstep(0.7, horizon, uv.y);
    float top = _clip_city(uv.x, horizon);
    float inCity = step(uv.y, top) * step(horizon, uv.y);
    vec3 col = mix(sky, vec3(0.02, 0.01, 0.04), inCity);
    vec2 g = floor(vec2(uv.x * 40.0, uv.y * 55.0));
    float win = step(0.93, hash21(g)) * inCity * step(0.5, fract(uv.x * 40.0)) * step(0.4, fract(uv.y * 55.0));
    col += vec3(0.9, 0.65, 0.3) * win * 0.7;
    if(uv.y < horizon){
      float refl = (horizon - uv.y) / max(horizon, 1e-4);
      vec3 neon = _clip_palette(cyc + 0.3);
      float ripple = sin(uv.y * 60.0 + t * 2.0 + uv.x * 8.0) * 0.5 + 0.5;
      col = mix(vec3(0.02, 0.01, 0.05), neon, (0.35 + 0.4 * ripple) * (1.0 - refl));
      col += vec3(0.6, 0.2, 0.5) * pow(1.0 - refl, 2.0) * 0.4;
    }
    col += _clip_palette(cyc) * smoothstep(0.012, 0.0, abs(uv.y - horizon)) * 1.3;
    float dn = _clip_dancer(uv, t);
    vec3 rim = _clip_palette(cyc + 0.5);
    col = mix(col, vec3(0.0), dn);
    float dn2 = _clip_dancer(uv + vec2(0.006, 0.006), t);
    col += rim * abs(dn - dn2) * 3.0;
    if(uv.y < 0.09 && uv.y > 0.05){
      float scroll = uv.x * 16.0 + t * 1.5;
      float blk = step(0.4, fract(scroll)) * step(0.35, hash11(floor(scroll)));
      col = mix(col, vec3(0.8, 0.8, 0.85), blk * 0.6);
    }
    return clamp(col * beat, 0.0, 1.0);
  }

  // --- Нет сигнала ---
  float _snow_static(vec2 uv, float t){
    float frame = floor(t * 24.0);
    vec2 p = floor(uv * vec2(180.0, 130.0));
    return hash21(p + frame * 7.13);
  }
  float _snow_ghost(vec2 uv, float t){
    vec2 q = uv * vec2(3.0, 2.2);
    q.y += t * 0.045;
    q.x += sin(t * 0.07) * 0.2;
    float g = fbm(q * 1.5);
    g += 0.5 * fbm(q * 4.0 + 11.0);
    g = clamp((g / 1.5 - 0.5) * 1.3 + 0.5, 0.0, 1.0);
    return g;
  }
  float _snow_tear(vec2 uv, float t){
    float band = floor(uv.y * 14.0 + t * 1.7);
    float when = hash11(band);
    float fire = step(0.93, fract(when + t * 0.5));
    return fire * (hash11(band + 3.0) - 0.5);
  }
  vec3 ch_snow(vec2 uv, float t){
    float shift = _snow_tear(uv, t) * 0.35;
    vec2 suv = vec2(uv.x + shift, uv.y);
    float sn = _snow_static(suv, t);
    float sn2 = _snow_static(suv * 1.7 + 5.0, t * 1.3);
    sn = mix(sn, sn2, 0.4);
    float gh = _snow_ghost(uv, t);
    float base = 0.30 + (gh - 0.5) * 0.16;
    float lum = mix(base, sn, 0.62);
    lum += abs(shift) * 0.8;
    lum = clamp(lum, 0.0, 1.0);
    vec3 col = vec3(lum) * vec3(0.94, 0.97, 1.0);
    return col;
  }

  // --- Поле (заставка-пейзаж) ---
  float _field_hill(vec2 uv, float baseY, float amp, float freq, float ph){
    float h = baseY + amp * sin(uv.x * freq + ph) + amp * 0.45 * sin(uv.x * freq * 2.3 + ph * 1.7);
    return step(uv.y, h);
  }
  vec3 ch_field(vec2 uv, float t){
    vec3 skyTop = vec3(0.40, 0.43, 0.48);
    vec3 skyLow = vec3(0.86, 0.66, 0.40);
    vec3 col = mix(skyLow, skyTop, smoothstep(0.30, 1.0, uv.y));
    vec2 sp = vec2(0.30, 0.345 + 0.006 * sin(t * 0.18));
    float ds = length((uv - sp) * vec2(1.0, 1.25));
    col += vec3(0.95, 0.74, 0.42) * smoothstep(0.40, 0.0, ds) * 0.45;
    col = mix(col, vec3(1.0, 0.92, 0.70), smoothstep(0.060, 0.045, ds));
    float c1 = fbm(vec2(uv.x * 3.0 - t * 0.020, uv.y * 4.5 + 7.0));
    float cl1 = smoothstep(0.55, 0.85, c1) * smoothstep(0.42, 0.70, uv.y);
    col = mix(col, vec3(0.80, 0.78, 0.76), cl1 * 0.55);
    float c2 = fbm(vec2(uv.x * 6.0 - t * 0.045, uv.y * 7.0 + 2.0));
    float cl2 = smoothstep(0.62, 0.90, c2) * smoothstep(0.50, 0.80, uv.y);
    col = mix(col, vec3(0.88, 0.84, 0.80), cl2 * 0.35);
    float far  = _field_hill(uv, 0.355, 0.012, 5.0,  0.6);
    float mid  = _field_hill(uv, 0.300, 0.022, 3.4,  2.1);
    float near = _field_hill(uv, 0.205, 0.038, 2.2, -0.4);
    vec3 hFar  = vec3(0.55, 0.55, 0.46);
    vec3 hMid  = vec3(0.46, 0.49, 0.34);
    vec3 hNear = vec3(0.34, 0.38, 0.24);
    col = mix(col, hFar,  far);
    col = mix(col, hMid,  mid);
    col = mix(col, hNear, near);
    float grass = sin(uv.x * 90.0 + sin(t * 0.5) * 2.0) * 0.5 + 0.5;
    col = mix(col, col * 0.90, near * grass * 0.10);
    for (int i = 0; i < 2; i++){
      float fi = float(i);
      float bx = fract(0.62 + fi * 0.18 + t * 0.012);
      float by = 0.72 + fi * 0.05 + 0.015 * sin(t * 0.4 + fi);
      vec2 d = (uv - vec2(bx, by)) * vec2(1.0, 1.4);
      float flap = 0.012 * abs(sin(t * 5.0 + fi * 1.7));
      float wing = smoothstep(0.018, 0.0, abs(abs(d.x) * 0.6 - d.y) - flap) * step(abs(d.x), 0.020) * step(by - 0.5, uv.y);
      col = mix(col, vec3(0.16, 0.15, 0.18), wing * 0.8);
    }
    if (uv.y > 0.055 && uv.y < 0.095){
      float scroll = uv.x + t * 0.05;
      float cell = fract(scroll * 9.0);
      float on = step(0.35, hash11(floor(scroll * 9.0)));
      float blk = step(0.15, cell) * step(cell, 0.80) * on;
      col = mix(col, vec3(0.92, 0.86, 0.72), blk * 0.7);
    }
    return col;
  }

  // --- Концерт ---
  float _concert_band(float x, float c, float w){ return smoothstep(w, 0.0, abs(x - c)); }
  float _concert_beam(vec2 uv, float baseX, float ang){
    vec2 src = vec2(baseX, 1.18);
    vec2 d = uv - src;
    vec2 dir = vec2(sin(ang), -cos(ang));
    float along = dot(d, dir);
    float perp  = d.x*dir.y - d.y*dir.x;
    along = max(along, 0.0);
    float width = 0.02 + along*0.22;
    float core = smoothstep(width, 0.0, abs(perp));
    float fall = exp(-along*1.3);
    return core*fall;
  }
  vec3 ch_concert(vec2 uv, float t){
    vec3 col = mix(vec3(0.05,0.04,0.06), vec3(0.10,0.07,0.05), uv.y);
    vec3 c1 = vec3(0.85,0.20,0.30);
    vec3 c2 = vec3(0.25,0.45,0.85);
    vec3 c3 = vec3(0.90,0.70,0.30);
    vec3 c4 = vec3(0.55,0.30,0.70);
    float s = 0.30;
    col += c1 * _concert_beam(uv, 0.20, sin(t*0.27     )*s - 0.35);
    col += c3 * _concert_beam(uv, 0.42, sin(t*0.21+1.7 )*s - 0.12);
    col += c2 * _concert_beam(uv, 0.58, sin(t*0.19+3.1 )*s + 0.12);
    col += c4 * _concert_beam(uv, 0.80, sin(t*0.24+4.6 )*s + 0.35);
    col += vec3(0.06,0.05,0.07) * fbm(uv*3.0 + vec2(0.0, t*0.15)) * (1.0-uv.y);
    float cx = 0.5 + sin(t*0.6)*0.006;
    float head = smoothstep(0.052, 0.044, length((uv-vec2(cx,0.60))*vec2(1.0,1.15)));
    float bodyW = 0.06 + (0.52-uv.y)*0.16;
    float body = _concert_band(uv.x, cx, bodyW) * smoothstep(0.56,0.54,uv.y) * smoothstep(0.10,0.14,uv.y);
    float sil = clamp(head+body, 0.0, 1.0);
    float stand = _concert_band(uv.x, cx-0.085, 0.006) * smoothstep(0.55,0.53,uv.y) * smoothstep(0.08,0.10,uv.y);
    float micH  = smoothstep(0.026,0.018, length((uv-vec2(cx-0.085,0.55))));
    sil = clamp(sil+stand+micH, 0.0, 1.0);
    col = mix(col, vec3(0.0), sil*0.97);
    float halo = exp(-length((uv-vec2(cx,0.61))*vec2(1.0,1.1))*7.0);
    col += vec3(0.9,0.65,0.35)*halo*0.18;
    if(uv.y < 0.22){
      vec2 g = vec2(uv.x*26.0, uv.y*7.0);
      vec2 cell = floor(g);
      float rnd = hash21(cell);
      float on = step(0.55, rnd);
      vec2 f = fract(g) - 0.5;
      float tw = 0.5 + 0.5*sin(t*(2.0+rnd*4.0) + rnd*30.0);
      float glow = smoothstep(0.30, 0.0, length(f)) * on * tw;
      float depth = smoothstep(0.0, 0.22, uv.y);
      col += vec3(1.0,0.78,0.45)*glow*(1.0-depth*0.6)*0.8;
    }
    float fp = floor(t*0.5);
    float fph = hash11(fp);
    float ft = fract(t*0.5);
    float flashOn = step(0.92, fph);
    float flash = flashOn * exp(-ft*22.0);
    vec2 fpos = vec2(hash11(fp+3.1)*0.8+0.1, 0.05+hash11(fp+7.7)*0.12);
    float blink = exp(-length(uv-fpos)*6.0);
    col += vec3(1.0)*blink*flash*1.2;
    col += vec3(1.0)*flash*0.05;
    return clamp(col, 0.0, 1.0);
  }

  // ===================== ДИСПЕТЧЕР + АНАЛОГОВАЯ ДЕГРАДАЦИЯ =====================
  vec3 picture(int c, vec2 uv, float t){
    if (c == 0) return ch_testcard(uv, t);
    else if (c == 1) return ch_news(uv, t);
    else if (c == 2) return ch_cartoon(uv, t);
    else if (c == 3) return ch_weather(uv, t);
    else if (c == 4) return ch_ad(uv, t);
    else if (c == 5) return ch_leader(uv, t);
    else if (c == 6) return ch_ident(uv, t);
    else if (c == 7) return ch_clip(uv, t);
    else if (c == 8) return ch_snow(uv, t);
    else if (c == 9) return ch_field(uv, t);
    return ch_concert(uv, t);
  }

  void main(){
    float t = uTime;
    vec2 uv = vUv;

    // Нет тока — тёмное выключенное стекло кинескопа (лёгкое холодное отражение + блик)
    if (uOn < 0.5) {
      vec3 off = vec3(0.015, 0.016, 0.022);
      off += vec3(0.020, 0.025, 0.035) * smoothstep(1.0, 0.0, uv.y);                                  // отблеск сверху
      off += vec3(0.06, 0.07, 0.09) * smoothstep(0.55, 0.0, abs((uv.x - uv.y) + 0.25)) * 0.5;          // косой блик
      vec2 qo = (uv - 0.5) * 2.0;
      off *= mix(0.5, 1.0, smoothstep(1.6, 0.2, dot(qo, qo)));                                          // виньетка
      gl_FragColor = vec4(off, 1.0);
      return;
    }

    // лёгкая дрожь строки (горизонтальный джиттер аналогового сигнала)
    float lineJit = (hash11(floor(uv.y * 200.0) + floor(t * 12.0)) - 0.5) * 0.004;
    uv.x += lineJit;

    // хроматический сдвиг — расхождение цветов кинескопа
    int c = int(uChannel + 0.5);
    float ca = 0.004 + 0.0015 * sin(t * 0.7);
    vec3 img;
    img.r = picture(c, uv + vec2(ca, 0.0), t).r;
    img.g = picture(c, uv, t).g;
    img.b = picture(c, uv - vec2(ca, 0.0), t).b;

    // постоянный лёгкий «снежок» (сигнал не идеально чистый)
    float grain = hash21(uv * vec2(640.0, 480.0) + t * 60.0);
    img += (grain - 0.5) * 0.06;

    // всплеск помех при переключении/просадке: статический снег + разрыв синхры
    float snowN = hash21(floor(uv * vec2(180.0, 130.0)) + floor(t * 24.0) * 7.13);
    float tear = step(0.6, uStatic) * step(0.97, fract(uv.y * 8.0 + t * 3.0));
    img = mix(img, vec3(snowN) * vec3(0.95, 0.97, 1.0), clamp(uStatic, 0.0, 1.0) * (0.85 + 0.15 * tear));

    // сканлайны CRT + апертурная решётка
    img *= 0.88 + 0.12 * sin(uv.y * 240.0 * 3.14159);
    img *= 0.95 + 0.05 * sin(uv.x * 220.0 * 3.14159);

    // медленная бегущая яркая полоса (увод кадра)
    float band = smoothstep(0.06, 0.0, abs(fract(uv.y - t * 0.06) - 0.5));
    img += band * 0.04;

    // обесцвечивание + тёплый ламповый фосфор (думерский аналог)
    float luma = dot(img, vec3(0.299, 0.587, 0.114));
    img = mix(vec3(luma), img, 0.82);
    img *= vec3(1.06, 1.0, 0.92);

    // сетевой гул 50 Гц (едва заметное мерцание)
    img *= 0.97 + 0.03 * sin(t * 50.0);

    // виньетка выпуклого кинескопа
    vec2 q = (vUv - 0.5) * 2.0;
    float vig = smoothstep(1.5, 0.3, dot(q, q));
    img *= mix(0.55, 1.0, vig);

    // косой блик на стекле
    img += vec3(0.5, 0.55, 0.6) * smoothstep(0.6, 0.0, abs((vUv.x - vUv.y) + 0.25)) * 0.05;

    gl_FragColor = vec4(clamp(img, 0.0, 1.0), 1.0);
  }
`;

// Материал полотнища шторы: ткань (curtain_fabric.jpg) + лёгкое колыхание от сквозняка.
// Колыхание — сдвиг вершин в onBeforeCompile (поверх ламбертова освещения), у каждого
// полотнища своя фаза. uTime крутит game.js через userData.tick группы шторы.
// Низ полотнища качается, верх (у карниза) приколочен.
function curtainMaterial(phase) {
  const m = new THREE.MeshLambertMaterial({ color: 0x6e2733, side: THREE.DoubleSide });
  m.userData.iconColor = 0x6e2733;
  const uniforms = { uTime: { value: 0 }, uPhase: { value: phase } };
  m.userData.sway = uniforms;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uPhase = uniforms.uPhase;
    shader.vertexShader =
      'uniform float uTime;\nuniform float uPhase;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float _bil = smoothstep(0.85, -0.85, position.y);        // 0 у карниза, 1 у низа
         transformed.z += cos(position.x * 9.0 + uPhase) * 0.03;  // вертикальные складки
         transformed.x += sin(uTime * 0.8 + position.y * 2.2 + uPhase) * 0.02 * _bil;
         transformed.z += sin(uTime * 0.6 + position.y * 3.0 + uPhase) * 0.012 * _bil;`
      );
  };
  new THREE.TextureLoader().load(
    'textures/curtain_fabric.jpg',
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      m.map = tex;
      m.color.set(0xffffff);
      m.needsUpdate = true;
    },
    undefined,
    () => {} // нет текстуры — остаётся бордовый цвет-заглушка
  );
  return m;
}

// === Табурет 1×1: сиденье + 4 ножки ===
export function createStool() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.12, 0.7, woodMaterial, 0, 0.51, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.add(box(0.09, 0.45, 0.09, woodMaterial, sx * 0.26, 0.225, sz * 0.26));
  }
  return g;
}

// === Кровать 1×2: рама, матрас, подушка, одеяло, спинка ===
export function createBed() {
  const g = new THREE.Group();
  g.add(box(0.92, 0.3, 1.92, woodMaterial, 0, 0.15, 0));          // рама
  g.add(box(0.84, 0.14, 1.8, linenMaterial, 0, 0.37, 0));         // матрас — тик
  g.add(box(0.6, 0.1, 0.4, linenMaterial, 0, 0.49, -0.65));       // подушка — тик
  g.add(box(0.86, 0.07, 1.0, blanketMaterial, 0, 0.47, 0.4));     // одеяло — плед
  g.add(box(0.92, 0.45, 0.07, woodMaterial, 0, 0.5, -0.93));      // спинка
  return g;
}

// === Кресло 1×1: база, спинка, подлокотники, подушка ===
export function createArmchair() {
  const g = new THREE.Group();
  const fabric = fabricMaterial; // оливковая рогожка
  g.add(box(0.8, 0.34, 0.8, fabric, 0, 0.17, 0));
  g.add(box(0.8, 0.52, 0.2, fabric, 0, 0.6, -0.3));
  g.add(box(0.18, 0.26, 0.62, fabric, -0.31, 0.47, 0.05));
  g.add(box(0.18, 0.26, 0.62, fabric, 0.31, 0.47, 0.05));
  g.add(box(0.44, 0.1, 0.5, fabric, 0, 0.39, 0.05)); // подушка — та же обивка
  return g;
}

// === Стол 2×1: столешница + 4 ножки ===
export function createTable() {
  const g = new THREE.Group();
  g.add(box(1.84, 0.08, 0.84, woodMaterial, 0, 0.74, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.add(box(0.09, 0.7, 0.09, woodMaterial, sx * 0.82, 0.35, sz * 0.33));
  }
  return g;
}

// === Сервант «стенка» 3×1: советская горка ===
// Снизу — тумба с дверцами и ящиками, сверху — застеклённая витрина
// с полками и посудой, по краям карниз и цоколь. Высота ~2.0.
export function createCupboard() {
  const g = new THREE.Group();
  // Корпус серванта — из ореха: локально подменяем материал дерева на ореховый,
  // поэтому весь корпус ниже (woodMaterial) рисуется тёмной текстурой. Остальная
  // мебель в игре по-прежнему светлая — у неё свой woodMaterial.
  const woodMaterial = walnutMaterial;
  // Локальные тона (тёмные акценты — темнее ореха, для контраста с посудой)
  const shadow = lambert(0x3a2014);   // тёмная тень: цоколь, теневые пояски
  const inset = lambert(0x7a4e26);    // утопленная филёнка дверцы
  const back = lambert(0x3a2616);     // тёмный полированный шпон задней стенки (контраст для посуды)
  // Полки и дверцы — стекло. depthWrite:false, чтобы сквозь них была видна
  // посуда вглубь (иначе верхняя полка прятала бы нижние ярусы под изо-углом).
  const shelf = lambert(0xbfe2ee, { transparent: true, opacity: 0.3, depthWrite: false });
  const glass = lambert(0x86a6b4, { transparent: true, opacity: 0.2, depthWrite: false });
  const handle = metalMaterial;

  // --- Цоколь (утоплен, корпус над ним нависает) ---
  g.add(box(2.78, 0.14, 0.74, shadow, 0, 0.07, 0));

  // --- Нижняя тумба ---
  g.add(box(2.84, 0.84, 0.8, woodMaterial, 0, 0.56, 0));
  // Левая и правая дверцы (выступающие накладки + утопленная филёнка + ручка)
  for (const sx of [-1, 1]) {
    const x = sx * 0.947;
    g.add(box(0.88, 0.76, 0.05, woodMaterial, x, 0.56, 0.41));
    g.add(box(0.6, 0.5, 0.03, inset, x, 0.56, 0.4));
    g.add(box(0.04, 0.2, 0.05, handle, x + sx * -0.39, 0.56, 0.45)); // ручка у внутреннего края
  }
  // Центр — два ящика с горизонтальными ручками
  for (const y of [0.4, 0.74]) {
    g.add(box(0.88, 0.32, 0.05, woodMaterial, 0, y, 0.41));
    g.add(box(0.22, 0.04, 0.05, handle, 0, y, 0.45));
  }

  // --- Разделительный поясок (выступает по бокам и вперёд) ---
  g.add(box(2.9, 0.03, 0.84, shadow, 0, 0.985, 0)); // тень-ступень под поясок
  g.add(box(2.94, 0.08, 0.88, woodMaterial, 0, 1.02, 0));

  // --- Верхняя витрина (каркас) ---
  g.add(box(2.78, 0.84, 0.04, back, 0, 1.48, -0.37));   // задняя стенка
  g.add(box(0.06, 0.84, 0.78, woodMaterial, -1.39, 1.48, 0)); // левая боковина
  g.add(box(0.06, 0.84, 0.78, woodMaterial, 1.39, 1.48, 0));  // правая боковина
  g.add(box(0.05, 0.84, 0.74, woodMaterial, 0, 1.48, 0));     // средняя стойка
  g.add(box(2.8, 0.05, 0.78, back, 0, 1.085, 0));             // дно витрины (тёмное — посуда читается)
  g.add(box(2.8, 0.05, 0.78, woodMaterial, 0, 1.875, 0));     // потолок витрины
  g.add(box(2.7, 0.03, 0.74, shelf, 0, 1.3, 0));   // нижняя полка (стекло)
  g.add(box(2.7, 0.03, 0.74, shelf, 0, 1.62, 0));  // верхняя полка (стекло)

  // --- Посуда за стеклом (то, что делает сервант сервантом) ---
  // Полки прозрачные, поэтому видны все три яруса. Тарелки ставим «на ребро»
  // у задней стенки — так они читаются лицом, как в настоящей горке.
  const crystal = lambert(0xeef6f8, { emissive: 0x33444c }); // хрусталь (светится на тёмном фоне)
  // Ярус 1 (дно): фарфоровый сервиз слева, стопка тарелок справа
  g.add(box(0.3, 0.15, 0.2, lambert(0xdfe7ee), -0.65, 1.185, 0.02));    // супница
  g.add(box(0.12, 0.05, 0.12, lambert(0x9a3b3b), -0.65, 1.285, 0.02));  // крышка
  g.add(box(0.26, 0.14, 0.22, lambert(0xeee6d4), 0.7, 1.18, 0));        // стопка тарелок
  g.add(box(0.27, 0.02, 0.23, lambert(0xb04040), 0.7, 1.265, 0));       // верхняя тарелка с каймой
  // Ярус 2 (нижняя полка): ряд хрустальных фужеров слева, графин + рюмки справа
  for (const x of [-1.05, -0.85, -0.65, -0.45]) g.add(box(0.08, 0.26, 0.08, crystal, x, 1.445, 0.04));
  g.add(box(0.18, 0.28, 0.18, crystal, 0.5, 1.455, 0.02));              // графин
  for (const x of [0.82, 1.0]) g.add(box(0.08, 0.18, 0.08, crystal, x, 1.405, 0.06)); // рюмки
  // Ярус 3 (верхняя полка): книги-корешки, ваза с цветком, парадные тарелки на ребре
  const spines = [[-1.05, 0.19, 0xc24a4a], [-0.93, 0.16, 0xd8b050], [-0.81, 0.2, 0x6a90c0], [-0.69, 0.17, 0xcebfa0]];
  for (const [x, h, c] of spines) g.add(box(0.1, h, 0.2, lambert(c), x, 1.635 + h / 2, -0.02));
  g.add(box(0.15, 0.17, 0.15, lambert(0xc09060), -0.38, 1.72, 0.02));   // ваза
  g.add(box(0.1, 0.08, 0.1, lambert(COLORS.bloom), -0.38, 1.81, 0.02)); // цветок
  g.add(box(0.26, 0.2, 0.02, lambert(0xe8dcbc), 0.55, 1.735, -0.28));   // парадная тарелка на ребре
  g.add(box(0.26, 0.2, 0.02, lambert(0xdcc9a0), 0.92, 1.735, -0.28));   // вторая тарелка
  g.add(box(0.1, 0.16, 0.1, crystal, 1.05, 1.715, 0.05));              // вазочка справа

  // --- Стеклянные дверцы витрины + ручки ---
  for (const sx of [-1, 1]) {
    g.add(box(1.28, 0.78, 0.03, glass, sx * 0.7, 1.48, 0.385));
    g.add(box(0.03, 0.14, 0.04, handle, sx * 0.12, 1.46, 0.42));
  }

  // --- Карниз (массивный козырёк) ---
  g.add(box(2.9, 0.04, 0.86, shadow, 0, 1.885, 0)); // теневой поясок под карнизом
  g.add(box(2.96, 0.1, 0.9, woodMaterial, 0, 1.95, 0));
  return g;
}

// === Тумба под ТВ 1×1 (поверхность: на неё можно ставить телевизор/магнитофон) ===
export function createTVStand() {
  const g = new THREE.Group();
  g.add(box(0.8, 0.42, 0.56, woodMaterial, 0, 0.21, 0));
  return g;
}

// === Телевизор 1×1: ламповый ТВ — экран в рамке, верньеры, антенны-усы ===
// (низ на y=0 — может стоять на полу или на тумбе)
export function createTV() {
  const g = new THREE.Group();
  const dark = lambert(0x2a2a30);
  const knob = lambert(0xc8c2b2); // кремовые ручки-верньеры
  // Ножки
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.add(box(0.06, 0.07, 0.06, dark, sx * 0.26, 0.035, sz * 0.17));
  }
  // Корпус (тёмный пластик)
  g.add(box(0.62, 0.4, 0.46, plasticMaterial, 0, 0.27, 0));
  // Экран в тёмной рамке (смещён влево, панель управления — справа)
  g.add(box(0.42, 0.32, 0.02, lambert(0x141418), -0.07, 0.3, 0.235));
  // Включённый экран: анимированный шейдер — «90-е по телевизору» под плохим
  // аналоговым сигналом. Светится сам (unlit), как настоящий кинескоп в тёмной комнате.
  const tvUniforms = { uTime: { value: 0 }, uChannel: { value: 0 }, uStatic: { value: 0 }, uOn: { value: 1 } };
  const tvMat = new THREE.ShaderMaterial({
    uniforms: tvUniforms,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: TV_FRAG,
  });
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.26), tvMat);
  tvScreen.position.set(-0.07, 0.3, 0.246);
  g.add(tvScreen);
  // Панель справа: два верньера (громкость/каналы) + решётка динамика
  g.add(cyl(0.045, 0.03, knob, 0.2, 0.37, 0.235, Math.PI / 2));
  g.add(cyl(0.045, 0.03, knob, 0.2, 0.27, 0.235, Math.PI / 2));
  g.add(box(0.15, 0.12, 0.01, lambert(0x15151a), 0.2, 0.15, 0.235));
  // Антенны-усы (металл, расходятся V назад-вверх)
  g.add(box(0.1, 0.04, 0.1, dark, 0, 0.49, -0.08));
  g.add(cyl(0.012, 0.55, metalMaterial, -0.16, 0.72, -0.14, -0.35, 0.5));
  g.add(cyl(0.012, 0.55, metalMaterial, 0.16, 0.72, -0.14, -0.35, -0.5));

  // Синий мерцающий свет кинескопа — «телек в тёмной комнате» (гаснет без тока).
  const tvLight = makeApplianceLight(0x5878a8, 3.2, [-0.07, 0.32, 0.5]);
  g.add(tvLight);

  // === Переключение «каналов»: случайный канал держится ~6–11 c, при смене —
  // короткий всплеск помех; плюс редкие самопроизвольные просадки сигнала. ===
  const CH_COUNT = 11;
  let curChannel = 0;          // стартуем с настроечной таблицы (и для иконки в панели)
  let started = false, wasOn = false;
  let nextSwitch = 0, nextDropout = 0, staticUntil = 0;
  g.userData.tick = (t) => {
    tvUniforms.uTime.value = t;
    // Телевизор работает только при наличии тока (game.js ставит userData.powered)
    const on = !!g.userData.powered;
    tvUniforms.uOn.value = on ? 1.0 : 0.0;
    if (!on) { wasOn = false; started = false; tvLight.intensity = 0; return; } // нет тока — тёмное стекло
    if (!started) { started = true; nextSwitch = t + 6 + Math.random() * 5; nextDropout = t + 4 + Math.random() * 8; }
    if (!wasOn) { staticUntil = t + 0.4; wasOn = true; }  // только что включился — миг прогрева (помехи)
    if (t >= nextSwitch) {
      let ch = curChannel;
      while (ch === curChannel) ch = Math.floor(Math.random() * CH_COUNT);
      curChannel = ch;
      tvUniforms.uChannel.value = ch;
      staticUntil = t + 0.35 + Math.random() * 0.2;   // помехи на миг переключения
      nextSwitch = t + 6 + Math.random() * 5;
    }
    if (t >= nextDropout) {
      staticUntil = Math.max(staticUntil, t + 0.08 + Math.random() * 0.15); // короткая просадка
      nextDropout = t + 6 + Math.random() * 10;
    }
    tvUniforms.uStatic.value = t < staticUntil ? 1.0 : 0.0;
    // мерцание света по «кадрам» + всплеск на помехах (смена канала/снег)
    tvLight.intensity = 0.9 + 0.3 * Math.sin(t * 9.0) + (t < staticUntil ? 0.7 : 0);
  };
  return g;
}

// === Ковёр на пол 3×2: узор на всю площадь, мебель можно ставить сверху (layer: rug) ===
// Текстура rug_pattern уже содержит кайму — натягиваем на весь ковёр, без подложки.
export function createFloorRug() {
  const g = new THREE.Group();
  g.add(box(2.9, 0.05, 1.9, rugPatternMaterial, 0, 0.025, 0));
  return g;
}

// === Ковёр на стену 3×1.5: узор на всю площадь ===
// ВАЖНО: настенные модели строим с центром в (0,0,0) — placement.js ставит
// position.y = высота центра, и зона коллизий должна совпадать с картинкой.
export function createWallRug() {
  const g = new THREE.Group();
  g.add(box(2.7, 1.5, 0.05, rugPatternMaterial, 0, 0, 0));
  return g;
}

// === Шторы на гардину над окном (настенный предмет, fixedWall/overWindow) ===
// Перекрывают окно ЛИШЬ по краям — центр стекла с шейдером остаётся открыт.
// Модель центрирована в (0,0,0): placement.js ставит её центр на высоту окна.
// Карниз сверху, два полотнища по краям + лёгкий ламбрекен над окном. Полотнища
// еле-еле колышутся от сквозняка — анимация вершин в curtainMaterial, время из tick.
export function createCurtains() {
  const g = new THREE.Group();

  // --- Гардина (карниз): стержень вдоль X над окном + наконечники + кольца ---
  const rodY = 0.82;
  g.add(cyl(0.028, 3.4, metalMaterial, 0, rodY, 0.0, 0, Math.PI / 2)); // стержень вдоль X
  for (const sx of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), metalMaterial);
    knob.position.set(sx * 1.72, rodY, 0.0); // наконечник
    g.add(knob);
  }
  // Кольца, на которых висят полотнища (тонкие цилиндры поперёк стержня)
  for (let i = 0; i < 12; i++) {
    const x = -1.55 + i * (3.1 / 11);
    g.add(cyl(0.05, 0.02, metalMaterial, x, rodY, 0.0, Math.PI / 2, 0));
  }

  // --- Полотнища: два плоских полотна по краям окна, со складками и колыханием ---
  const sway = []; // материалы, которым нужно крутить uTime
  const panelGeo = new THREE.PlaneGeometry(0.7, 1.6, 6, 16);
  for (const [sx, ph] of [[-1, 0.0], [1, 2.1]]) {
    const mat = curtainMaterial(ph);
    sway.push(mat);
    const panel = new THREE.Mesh(panelGeo, mat);
    panel.position.set(sx * 1.3, 0.0, 0.04); // внутренний край у ±0.95, окно открыто в центре
    g.add(panel);
  }

  // --- Ламбрекен: короткая оборка над самим окном (выше стекла, не закрывает шейдер) ---
  const valMat = curtainMaterial(1.0);
  sway.push(valMat);
  const valance = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.18, 12, 2), valMat);
  valance.position.set(0, 0.74, 0.05); // низ оборки у верхней кромки окна
  g.add(valance);

  // game.js зовёт tick(t) — лёгкий сквозняк качает все полотнища
  g.userData.tick = (t) => { for (const m of sway) m.userData.sway.uTime.value = t; };
  return g;
}

// === Розетка (настенная, двойная): корпус + два тёмных гнезда ===
export function createOutlet() {
  const g = new THREE.Group();
  g.add(box(0.26, 0.26, 0.06, lambert(0xe8e0cc), 0, 0, 0));
  g.add(box(0.07, 0.07, 0.02, lambert(0x2a2a30), -0.06, 0, 0.035));
  g.add(box(0.07, 0.07, 0.02, lambert(0x2a2a30), 0.06, 0, 0.035));
  return g;
}

// === Удлинитель 1×1 (напольная розетка-колодка): ставится на пол куда угодно ===
// Электроприбор-наоборот: сам даёт гнёзда (sockets), к нему тянутся приборы.
// Бонус за «электрификацию» — открывается, когда все приборы хоть раз подключены.
export function createExtensionCord() {
  const g = new THREE.Group();
  const body = lambert(0xd8d0bc);   // пожелтевший белый пластик
  const dark = lambert(0x2a2a30);
  // Колодка
  g.add(box(0.5, 0.06, 0.18, body, 0, 0.04, 0));
  // Гнёзда сверху (три тёмных углубления с парой контактов)
  for (const x of [-0.15, 0, 0.15]) {
    g.add(box(0.11, 0.012, 0.11, dark, x, 0.072, 0));
    g.add(box(0.012, 0.014, 0.012, body, x - 0.025, 0.076, 0));
    g.add(box(0.012, 0.014, 0.012, body, x + 0.025, 0.076, 0));
  }
  // Кнопка-выключатель с красным огоньком на торце
  g.add(box(0.06, 0.03, 0.06, lambert(0xc23a2a, { emissive: 0x401008 }), -0.22, 0.05, 0.05));
  // Шнур-«хвост» уходит в сторону и лежит на полу (тонкий тёмный)
  g.add(box(0.26, 0.02, 0.025, dark, 0.36, 0.01, 0.06));
  g.add(box(0.025, 0.02, 0.18, dark, 0.48, 0.01, 0.14));
  return g;
}

// === Иконки ремонта (в комнату не ставятся — применяются кликом) ===
// Паркет: плашка дерева
export function createRenoParquet() {
  const g = new THREE.Group();
  g.add(box(0.8, 0.08, 0.5, woodMaterial, 0, 0.04, 0));
  g.add(box(0.74, 0.02, 0.44, lambert(0xb98a4e), 0, 0.09, 0));
  return g;
}

// Обои: стоящий рулон
export function createRenoWallpaper() {
  const g = new THREE.Group();
  g.add(box(0.26, 0.8, 0.26, lambert(0xd8cdb2), 0, 0.4, 0));
  g.add(box(0.3, 0.1, 0.3, lambert(0xb05a40), 0, 0.62, 0));
  return g;
}

// === Торшер 1×1: основание, металлическая стойка, абажур ===
export function createFloorLamp() {
  const g = new THREE.Group();
  g.add(box(0.4, 0.06, 0.4, plasticMaterial, 0, 0.03, 0));
  g.add(box(0.06, 1.32, 0.06, metalMaterial, 0, 0.72, 0));
  // Абажур светится сам (emissive) + льёт тёплый свет в комнату — ГЛАВНЫЙ очаг уюта.
  const shadeMat = lambert(COLORS.lampshade, { emissive: 0x6a4a20 });
  g.add(box(0.46, 0.34, 0.46, shadeMat, 0, 1.52, 0));
  const lamp = makeApplianceLight(0xffd9a0, 6.5, [0, 1.5, 0]); // янтарный, тёплый радиус
  g.add(lamp);
  // Торшер — электроприбор (cordLength): горит только при токе (game.js ставит powered).
  // Раньше абажур светился всегда — теперь, как ТВ/аквариум, зависит от розетки.
  g.userData.tick = (t) => {
    const on = !!g.userData.powered;
    lamp.intensity = on ? 3.4 * (0.97 + 0.03 * Math.sin(t * 2.0)) : 0; // лёгкое «дыхание» накала
    shadeMat.emissive.setHex(on ? 0x6a4a20 : 0x141008);
  };
  return g;
}

// === Кассетный магнитофон 1×1: переносная магнитола ===
// Динамики по бокам, кассетный отсек, клавиши, ручка для переноски, антенна.
// (низ на y=0 — пол или тумба)
export function createTapePlayer() {
  const g = new THREE.Group();
  const grille = lambert(0x18181c);
  const key = lambert(0xc2bca8); // кремовые клавиши
  // Корпус
  g.add(box(0.72, 0.36, 0.26, plasticMaterial, 0, 0.18, 0));
  // Два динамика по бокам: ободок + решётка + колпачок
  for (const sx of [-1, 1]) {
    g.add(cyl(0.115, 0.012, lambert(0x3a3a40), sx * 0.22, 0.18, 0.128, Math.PI / 2));
    g.add(cyl(0.1, 0.02, grille, sx * 0.22, 0.18, 0.136, Math.PI / 2));
    g.add(cyl(0.028, 0.025, lambert(0x4a4a50), sx * 0.22, 0.18, 0.145, Math.PI / 2));
  }
  // Кассетный отсек (тёмное окошко) + две катушки
  g.add(box(0.22, 0.13, 0.02, lambert(0x2a3038), 0, 0.23, 0.135));
  g.add(cyl(0.03, 0.012, lambert(0x6a6a70), -0.05, 0.23, 0.146, Math.PI / 2));
  g.add(cyl(0.03, 0.012, lambert(0x6a6a70), 0.05, 0.23, 0.146, Math.PI / 2));
  // Ряд клавиш (play/stop/rewind…)
  for (const x of [-0.1, -0.05, 0, 0.05, 0.1]) g.add(box(0.035, 0.05, 0.03, key, x, 0.08, 0.135));
  // Ручка для переноски (П-образная, металл)
  g.add(box(0.46, 0.025, 0.03, metalMaterial, 0, 0.44, 0));
  g.add(box(0.025, 0.1, 0.03, metalMaterial, -0.22, 0.39, 0));
  g.add(box(0.025, 0.1, 0.03, metalMaterial, 0.22, 0.39, 0));
  // Регулятор громкости + телескопическая антенна
  g.add(cyl(0.03, 0.025, key, -0.3, 0.375, 0.05));
  g.add(cyl(0.01, 0.38, metalMaterial, 0.32, 0.52, -0.08, -0.15, -0.35));

  // === Зелёный аквалайзер: ретро-сегментный дисплей по центру корпуса ===
  // Тёмная окантовка + светящаяся панель со скачущими столбиками (шейдер).
  g.add(box(0.25, 0.085, 0.012, lambert(0x080d08), 0, 0.135, 0.135));
  const eqUniforms = { uTime: { value: 0 }, uOn: { value: 1 } };
  const eqMat = new THREE.ShaderMaterial({
    uniforms: eqUniforms,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: EQUALIZER_FRAG,
  });
  const eqScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.225, 0.062), eqMat);
  eqScreen.position.set(0, 0.135, 0.142);
  g.add(eqScreen);
  // Еле заметный зелёный отсвет аквалайзера (характерная деталь, не «прожектор»).
  // На iPad выключен ради перфа (второстепенный свет).
  const eqLight = LOW_END ? null : makeApplianceLight(0x2e8a36, 0.85, [0, 0.135, 0.18]);
  if (eqLight) g.add(eqLight);
  // game.js зовёт tick(t) каждый кадр: время крутим всегда, но горит только при токе
  g.userData.tick = (t) => {
    eqUniforms.uTime.value = t;
    const on = g.userData.powered ? 1.0 : 0.0;
    eqUniforms.uOn.value = on; // аквалайзер горит только при наличии тока
    if (eqLight) eqLight.intensity = on ? 0.18 : 0;
  };
  return g;
}

// === Аквариум на тумбе 1×1 (электроприбор) ===
// Полностью кодом: ореховая тумба, стеклянная банка, АНИМИРОВАННАЯ вода (шейдер
// с бегущими каустиками), плавающие рыбки, грунт, водоросли, камни, пузырьки.
// Анимация — через userData.tick(t): game.js зовёт его каждый кадр (как у окна).
export function createAquarium() {
  const g = new THREE.Group();

  // --- Тумба под аквариум (орех) ---
  g.add(box(0.84, 0.46, 0.6, walnutMaterial, 0, 0.23, 0));          // корпус
  g.add(box(0.9, 0.05, 0.64, lambert(0x4a2e18), 0, 0.475, 0));      // крышка-карниз
  g.add(box(0.66, 0.34, 0.02, lambert(0x7a4e26), 0, 0.22, 0.305));  // дверца
  g.add(box(0.04, 0.1, 0.03, metalMaterial, 0.22, 0.22, 0.315));    // ручка

  // Габариты банки (центр по высоте tankY)
  const tankY = 0.74, tankW = 0.78, tankH = 0.48, tankD = 0.5;
  const innerW = tankW - 0.06, innerD = tankD - 0.06;
  const floorY = tankY - tankH / 2;                 // дно банки

  // --- Грунт и камни на дне ---
  g.add(box(innerW, 0.06, innerD, lambert(0x4a3a2c), 0, floorY + 0.03, 0));
  g.add(box(0.12, 0.08, 0.1, lambert(0x6a6660), -0.18, floorY + 0.07, 0.05));
  g.add(box(0.09, 0.06, 0.08, lambert(0x565250), 0.17, floorY + 0.06, -0.06));

  // --- Вода: анимированный шейдер (бегущие каустики + блик у поверхности) ---
  const waterTop = tankY + tankH / 2 - 0.05;        // поверхность чуть ниже верха
  const waterBot = floorY + 0.06;                    // над грунтом
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uOn: { value: 1 } },
    vertexShader: `
      varying vec3 vP;
      void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float uTime;
      uniform float uOn;      // 1 — есть ток (подсветка/компрессор), 0 — тёмная стоячая вода
      varying vec3 vP;
      void main(){
        float top = smoothstep(-0.18, 0.18, vP.y);          // светлее к поверхности
        vec3 col = mix(vec3(0.05,0.20,0.24), vec3(0.13,0.39,0.42), top);
        // каустики — две бегущие волны
        float c = (sin(vP.x*16.0 + vP.y*7.0 + uTime*1.5)*0.5+0.5)
                * (sin(vP.x*9.0 - vP.z*7.0 - uTime*1.1)*0.5+0.5);
        col += vec3(0.16,0.26,0.24) * c * 0.7;
        // блик у самой поверхности
        float surf = smoothstep(0.12,0.18,vP.y) * (0.5+0.5*sin(vP.x*22.0+uTime*3.0));
        col += vec3(0.5,0.7,0.68) * surf * 0.18;
        gl_FragColor = vec4(col * mix(0.28, 1.0, uOn), 0.6); // без тока вода тускнеет
      }
    `,
  });
  const water = new THREE.Mesh(new THREE.BoxGeometry(innerW, waterTop - waterBot, innerD), waterMat);
  water.position.set(0, (waterTop + waterBot) / 2, 0);
  water.renderOrder = 1;
  g.add(water);

  // --- Водоросли (качаются в tick) ---
  const plantMat = lambert(0x3f6f3a);
  const plants = [];
  for (const [px, ph, pz] of [[-0.22, 0.26, 0.07], [-0.12, 0.34, -0.08], [0.2, 0.3, 0.09], [0.27, 0.22, -0.05]]) {
    const blade = box(0.05, ph, 0.05, plantMat, px, floorY + 0.06 + ph / 2, pz);
    blade.userData.bx = px;
    plants.push(blade);
    g.add(blade);
  }

  // --- Рыбки (тело + хвост + плавник; плавают в tick) ---
  const fishOrange = lambert(0xd9762e, { emissive: 0x331403 });
  const fishPale = lambert(0xc9b85a, { emissive: 0x2a2408 });
  const fishes = [];
  function makeFish(mat) {
    const f = new THREE.Group();
    f.add(box(0.14, 0.08, 0.05, mat, 0, 0, 0));        // тело
    const tail = box(0.06, 0.07, 0.03, mat, -0.1, 0, 0); // хвост
    f.add(tail);
    f.add(box(0.05, 0.05, 0.04, mat, 0.02, 0.06, 0));  // верхний плавник
    f.userData.tail = tail;
    return f;
  }
  for (const p of [
    { mat: fishOrange, speed: 0.7, phase: 0.0, xr: 0.26, y: 0.74, z: 0.06, by: 0.03 },
    { mat: fishOrange, speed: 0.5, phase: 2.1, xr: 0.22, y: 0.66, z: -0.08, by: 0.04 },
    { mat: fishPale, speed: 0.95, phase: 4.0, xr: 0.2, y: 0.81, z: 0.0, by: 0.02 },
  ]) {
    const f = makeFish(p.mat);
    f.userData.p = p;
    fishes.push(f);
    g.add(f);
  }

  // --- Пузырьки (поднимаются и сбрасываются в tick) ---
  const bubbleMat = lambert(0xcfe8ee, { transparent: true, opacity: 0.5, depthWrite: false });
  const bubbles = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.012 + i * 0.003, 6, 6), bubbleMat);
    b.userData.off = i / 4;
    b.renderOrder = 2;
    bubbles.push(b);
    g.add(b);
  }

  // --- Стеклянная банка + рамка + крышка-светильник (поверх воды) ---
  g.add(box(tankW + 0.02, 0.03, tankD + 0.02, lambert(0x2a2a30), 0, tankY + tankH / 2, 0)); // верхний кант
  g.add(box(tankW + 0.02, 0.04, tankD + 0.02, lambert(0x2a2a30), 0, tankY - tankH / 2, 0)); // нижний кант
  g.add(box(tankW, 0.04, tankD, lambert(0x33333a), 0, tankY + tankH / 2 + 0.03, 0));        // крышка
  const lampMat = lambert(0xffe8b0, { emissive: 0xffcf80 });
  g.add(box(tankW - 0.08, 0.015, tankD - 0.08, lampMat, 0, tankY + tankH / 2 + 0.005, 0)); // лампа под крышкой (гаснет без тока)
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(tankW, tankH, tankD),
    lambert(COLORS.glass, { transparent: true, opacity: 0.16, depthWrite: false })
  );
  glass.position.set(0, tankY, 0);
  glass.renderOrder = 3;
  g.add(glass);

  // Холодный бирюзовый свет аквариума (от подсветки крышки) — гаснет без тока.
  const aqLight = makeApplianceLight(0x9fd4e8, 2.6, [0, tankY + tankH / 2, 0]);
  g.add(aqLight);

  // --- Анимация: game.js зовёт tick(t) каждый кадр ---
  // Аквариум — электроприбор: компрессор и подсветка работают только при токе.
  // Без розетки он «тёмный и неподвижный»: копим время только под током (рыбки,
  // вода и водоросли замирают), свет гаснет, вода тускнеет, пузырьки пропадают.
  let animT = 0, lastT = null;
  g.userData.tick = (t) => {
    const on = !!g.userData.powered;
    if (lastT === null) lastT = t;
    if (on) animT += t - lastT; // время идёт, только пока есть ток
    lastT = t;
    const tt = animT;
    waterMat.uniforms.uTime.value = tt;
    waterMat.uniforms.uOn.value = on ? 1.0 : 0.0;
    lampMat.emissive.setHex(on ? 0xffcf80 : 0x080808); // подсветка под крышкой гаснет
    aqLight.intensity = on ? 1.1 + 0.15 * Math.sin(animT * 0.8) : 0; // дыхание от animT (замирает без тока)
    for (const f of fishes) {
      const p = f.userData.p;
      const arg = tt * p.speed + p.phase;
      f.position.set(Math.sin(arg) * p.xr, p.y + Math.sin(arg * 1.3) * p.by, p.z);
      f.rotation.y = Math.cos(arg) >= 0 ? 0 : Math.PI;        // разворот по ходу
      f.userData.tail.rotation.y = Math.sin(tt * 8.0 + p.phase) * 0.5; // виляет хвостом
    }
    for (const bl of plants) bl.rotation.z = Math.sin(tt * 1.2 + bl.userData.bx * 5.0) * 0.12;
    for (const b of bubbles) {
      const u = (tt * 0.3 + b.userData.off) % 1.0;
      b.position.set(0.24 + Math.sin(u * 6.28 + b.userData.off * 6.0) * 0.015, waterBot + u * (waterTop - waterBot), -0.1);
      b.visible = on && u < 0.95; // без компрессора пузырьков нет
    }
  };

  return g;
}

// === Горшок с цветком 1×1 ===
export function createFlowerPot() {
  const g = new THREE.Group();
  g.add(box(0.3, 0.28, 0.3, lambert(COLORS.terracotta), 0, 0.14, 0));
  g.add(box(0.05, 0.45, 0.05, lambert(COLORS.leaf), 0, 0.5, 0));
  g.add(box(0.34, 0.06, 0.12, lambert(COLORS.leaf), 0, 0.62, 0));
  g.add(box(0.12, 0.06, 0.34, lambert(COLORS.leaf), 0, 0.68, 0));
  g.add(box(0.13, 0.13, 0.13, lambert(COLORS.bloom), 0, 0.78, 0));
  return g;
}

// === Куча строительного мусора: обломки бетона, кирпичи, доска ===
function createRubblePile() {
  const g = new THREE.Group();
  const brick = lambert(0x9a4a38);
  g.add(box(0.6, 0.03, 0.5, concreteMaterial, 0, 0.015, 0)); // россыпь/пыль у основания
  // Обломки бетона навалены
  g.add(rotY(box(0.3, 0.2, 0.26, concreteMaterial, -0.05, 0.1, 0.02), 0.2));
  g.add(rotY(box(0.24, 0.16, 0.2, concreteMaterial, 0.18, 0.08, 0.08), -0.4));
  g.add(rotY(box(0.2, 0.14, 0.17, concreteMaterial, -0.16, 0.07, -0.12), 0.6));
  g.add(rotY(box(0.17, 0.12, 0.14, concreteMaterial, 0.04, 0.22, 0.0), 0.3));
  // Кирпичи
  g.add(rotY(box(0.24, 0.1, 0.11, brick, -0.22, 0.05, 0.16), 0.5));
  g.add(rotY(box(0.24, 0.1, 0.11, brick, -0.16, 0.15, 0.13), 0.2));
  // Доска под углом
  g.add(rotY(box(0.55, 0.04, 0.1, woodMaterial, 0.12, 0.04, -0.2), -0.3));
  return g;
}

// Поле мусора: несколько куч по углам и у стен. Каждая куча помечена
// userData.debrisPile — по ней игрок кликает, чтобы убрать (game.js).
export function createDebrisField() {
  const g = new THREE.Group();
  const spots = [
    [-4.3, -3.3, 0.3], [-1.0, -3.4, 1.2], [3.0, -3.3, -0.5],
    [-4.4, 0.5, 0.8], [-4.2, 2.8, 2.0], [2.2, 1.4, -0.8],
  ];
  for (const [x, z, ry] of spots) {
    const pile = createRubblePile();
    pile.position.set(x, 0, z);
    pile.rotation.y = ry;
    pile.userData.debrisPile = true;
    g.add(pile);
  }
  return g;
}

// === Иконка «Вставить окно» (в комнату не ставится — применяется кликом) ===
export function createRenoWindow() {
  const g = new THREE.Group();
  g.add(box(0.46, 0.5, 0.04, lambert(0x42547a), 0, 0.42, 0)); // стекло
  const fr = lambert(0xe2ddd0);
  g.add(box(0.56, 0.06, 0.06, fr, 0, 0.17, 0.01));   // низ рамы
  g.add(box(0.56, 0.06, 0.06, fr, 0, 0.67, 0.01));   // верх рамы
  g.add(box(0.06, 0.56, 0.06, fr, -0.27, 0.42, 0.01)); // левый брус
  g.add(box(0.06, 0.56, 0.06, fr, 0.27, 0.42, 0.01));  // правый брус
  g.add(box(0.04, 0.5, 0.05, fr, 0, 0.42, 0.02));    // переплёт вертикальный
  g.add(box(0.46, 0.04, 0.05, fr, 0, 0.42, 0.02));   // переплёт горизонтальный
  return g;
}

// Реестр моделей: ключ — поле "model" из data/items.json.
// Новый предмет = запись в JSON + (если нужна новая форма) функция здесь.
export const MODEL_BUILDERS = {
  stool: createStool,
  bed: createBed,
  armchair: createArmchair,
  table: createTable,
  cupboard: createCupboard,
  tv: createTV,
  tv_stand: createTVStand,
  floor_rug: createFloorRug,
  wall_rug: createWallRug,
  floor_lamp: createFloorLamp,
  curtains: createCurtains,
  tape_player: createTapePlayer,
  aquarium: createAquarium,
  flower_pot: createFlowerPot,
  outlet: createOutlet,
  extension_cord: createExtensionCord,
  reno_parquet: createRenoParquet,
  reno_wallpaper: createRenoWallpaper,
  reno_window: createRenoWindow,
};
