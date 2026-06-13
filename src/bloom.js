// bloom.js — пост-эффект «свечение» (Bloom / Glow) вокруг светлых участков.
//
// ИДЕЯ. Свет — главная составляющая атмосферы игры. Bloom добавляет вокруг ярких
// мест (луна за окном, абажур торшера, экран ТВ, аквариум, горящие окна панелек)
// мягкое таинственное сияние — будто свет «дышит» в холодном воздухе комнаты.
//
// КАК УСТРОЕНО (важно для думерской палитры — НЕ испортить уже настроенную картинку):
//   Обычный путь three.js (EffectComposer + тон-маппинг на выходе) ПЕРЕСВЕТИЛ БЫ окно:
//   шейдер окна самосветящийся и НЕ должен проходить тон-маппинг (см. CLAUDE.md). Поэтому
//   мы НЕ трогаем основной рендер. Кадр рисуется на экран КАК РАНЬШЕ (1:1, та же картинка),
//   затем мы:
//     1) копируем готовый кадр с холста в текстуру (copyFramebufferToTexture);
//     2) bright-pass: оставляем только яркие пиксели (мягкий порог по яркости);
//     3) размываем их Гауссом в 2 прохода (широкое мягкое гало) на уменьшенном разрешении;
//     4) АДДИТИВНО подмешиваем свечение поверх уже нарисованного кадра.
//   Так базовая картинка сохраняется идеально, а сверху добавляется только сияние.
//
// Параметры (strength/threshold/tint) приходят из lighting.js каждый кадр — ночью и в
// полнолуние свечение ярче и чуть холоднее (таинственнее), днём мягче.

import * as THREE from 'three';

// Слабое устройство (ретина + сенсор ≈ iPad): меньше разрешение и один проход размытия.
const LOW_END = window.devicePixelRatio > 1.5 && 'ontouchstart' in window;

// Общий вершинный шейдер полноэкранного прямоугольника: позиции уже в клип-пространстве
// (PlaneGeometry 2×2 → −1..1), камера не нужна. Пробрасываем uv.
const VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Bright-pass: оставить только яркое. Мягкий порог (knee) — чтобы свечение нарастало плавно.
const BRIGHT_FRAG = `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); // воспринимаемая яркость
    float k = smoothstep(uThreshold, uThreshold + uKnee, l);
    gl_FragColor = vec4(c * k, 1.0);
  }
`;

// Сепарабельный Гаусс (9 отсчётов через 5 текстур-выборок). uDir — шаг по одной оси.
const BLUR_FRAG = `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
    c += texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
    c += texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
    c += texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
    c += texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(c, 1.0);
  }
`;

// Композит: свечение × сила × оттенок. Рисуется аддитивно поверх готового кадра.
const COMPOSITE_FRAG = `
  precision highp float;
  uniform sampler2D tBloom;
  uniform float uStrength;
  uniform vec3 uTint;
  varying vec2 vUv;
  void main() {
    vec3 b = texture2D(tBloom, vUv).rgb;
    gl_FragColor = vec4(b * uStrength * uTint, 1.0);
  }
`;

export function createBloom(renderer) {
  const ZERO = new THREE.Vector2(0, 0);
  const size = new THREE.Vector2();

  // Рабочее разрешение размытия (доля от кадра) и число проходов: на iPad полегче.
  const SCALE = LOW_END ? 0.20 : 0.25;
  const ROUNDS = LOW_END ? 1 : 2;

  // Полноэкранный прямоугольник: одна геометрия, материал подменяем под каждый проход.
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadMesh = new THREE.Mesh(quadGeo, null);
  quadMesh.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quadMesh);
  const quadCam = new THREE.Camera(); // не используется (позиции уже в клип-пространстве)

  const brightMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uThreshold: { value: 0.64 }, uKnee: { value: 0.28 } },
    vertexShader: VERT, fragmentShader: BRIGHT_FRAG,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: VERT, fragmentShader: BLUR_FRAG,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const compMat = new THREE.ShaderMaterial({
    uniforms: { tBloom: { value: null }, uStrength: { value: 0.5 }, uTint: { value: new THREE.Vector3(1, 1, 1) } },
    vertexShader: VERT, fragmentShader: COMPOSITE_FRAG,
    depthTest: false, depthWrite: false,
    transparent: true, blending: THREE.AdditiveBlending, // поверх кадра — только добавляем свет
    toneMapped: false,
  });

  // Текстура для снимка готового кадра и две цели для пинг-понга размытия.
  let baseTex = null;   // FramebufferTexture (снимок холста)
  let rtA = null, rtB = null;
  let fbW = 0, fbH = 0; // размер кадрового буфера, под который созданы цели
  let disabled = false; // аварийное отключение (если железо не поддержит копирование)

  function makeRT(w, h) {
    return new THREE.WebGLRenderTarget(w, h, {
      depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
    });
  }

  function setSize() {
    renderer.getDrawingBufferSize(size);
    fbW = Math.max(1, Math.floor(size.x));
    fbH = Math.max(1, Math.floor(size.y));
    if (baseTex) baseTex.dispose();
    baseTex = new THREE.FramebufferTexture(fbW, fbH);
    baseTex.minFilter = THREE.LinearFilter;
    baseTex.magFilter = THREE.LinearFilter;
    baseTex.generateMipmaps = false;
    const w = Math.max(1, Math.floor(fbW * SCALE));
    const h = Math.max(1, Math.floor(fbH * SCALE));
    if (rtA) rtA.dispose();
    if (rtB) rtB.dispose();
    rtA = makeRT(w, h);
    rtB = makeRT(w, h);
  }
  setSize();

  function blit(mat, target) {
    quadMesh.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCam);
  }

  // Один проход размытия по оси (dx, dy) — шаг в долях текстуры × ширина гало.
  function blurAxis(srcRT, dstRT, dx, dy) {
    blurMat.uniforms.tDiffuse.value = srcRT.texture;
    blurMat.uniforms.uDir.value.set(dx, dy);
    blit(blurMat, dstRT);
  }

  // Вызывать ПОСЛЕ renderer.render(scene, camera) — кадр уже на холсте.
  function apply(params) {
    if (disabled) return;
    // Размер кадрового буфера мог измениться (поворот планшета, смена DPR) — пересоздать.
    renderer.getDrawingBufferSize(size);
    if (Math.floor(size.x) !== fbW || Math.floor(size.y) !== fbH) setSize();

    const strength = params ? params.strength : 0.5;
    const threshold = params ? params.threshold : 0.64;
    const tint = params ? params.tint : null;

    try {
      // 1) снимок готового кадра с холста
      renderer.copyFramebufferToTexture(baseTex, ZERO);

      // 2) bright-pass (с уменьшением разрешения) → rtA
      brightMat.uniforms.tDiffuse.value = baseTex;
      brightMat.uniforms.uThreshold.value = threshold;
      blit(brightMat, rtA);

      // 3) размытие: широкое мягкое гало. Текстельные шаги по рабочему разрешению.
      const tx = 1 / rtA.width;
      const ty = 1 / rtA.height;
      // первый проход — уже, второй — заметно шире (мечтательное многомасштабное свечение)
      blurAxis(rtA, rtB, tx * 1.2, 0);
      blurAxis(rtB, rtA, 0, ty * 1.2);
      if (ROUNDS > 1) {
        blurAxis(rtA, rtB, tx * 3.0, 0);
        blurAxis(rtB, rtA, 0, ty * 3.0);
      }

      // 4) аддитивная подмешка свечения поверх кадра (холст НЕ очищаем)
      compMat.uniforms.tBloom.value = rtA.texture;
      compMat.uniforms.uStrength.value = strength;
      if (tint) compMat.uniforms.uTint.value.set(tint[0], tint[1], tint[2]);
      const prevAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      quadMesh.material = compMat;
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCam);
      renderer.autoClear = prevAutoClear;
    } catch (err) {
      // Если копирование кадра не поддержано — выключаем эффект, игра продолжает работать.
      console.warn('Bloom отключён (ошибка пост-обработки):', err);
      disabled = true;
    }
    renderer.setRenderTarget(null);
  }

  return { apply, setSize };
}
