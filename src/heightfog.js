// heightfog.js — воздушная перспектива ВНУТРИ комнаты (атмосферная глубина на 3D-геометрии).
//
// ИДЕЯ. За окном дымка уже есть (шейдер стекла в walls.js), вокруг квартиры — туман-фон
// (fog.js). А сам объём комнаты до сих пор «вырезан» из мглы резко: дальняя стена, верх
// углов и дальняя мебель такие же чёткие и контрастные, как ближние. Воздушная перспектива
// (закон: дальнее бледнеет, холодеет, теряет контраст и тонет в дымке) на геометрии не
// читается. Этот модуль добавляет её — дёшево и так, чтобы НЕ мешать геймплею.
//
// ПОЧЕМУ НЕ scene.fog. Камера ОРТОграфическая и зафиксирована. Дистанционный туман красил
// бы дальнюю ПОЛОВИНУ пола и дальние линии сетки ровно так же, как дальнюю стену, — то есть
// бил бы по читаемости расстановки там же, где наращивает атмосферу. Поэтому глубину ставим
// ВЕРТИКАЛЬНО — по мировой высоте Y: плоскость пола (y=0) и линии сетки остаются кристально
// чистыми ВСЕГДА (сетка — THREE.Line, врезкой не одевается вовсе), а к дымке уходят верх стен и
// дальняя стена (физически выше в кадре). Это ровно референс «авто в тумане»: низ детальный,
// верх/даль растворяется. ДОБАВЛЕНО (запрос Олега «туман заползает внутрь»): в ДАЛЬНЕМ от камеры
// углу (у окна/двери) дымка дополнительно натекает на НИЖНИЕ стены/мебель чуть выше пола (член
// hfFar с маской hfFarMask, которая гаснет у самой плоскости пола — клетки расстановки чисты).
//
// КАК УСТРОЕНО. material.onBeforeCompile врезает в фрагментный шейдер стандартного
// MeshLambertMaterial подмешивание цвета дымки по мировой высоте Y фрагмента:
//   hfFactor = smoothstep(uYLow, uYHigh, worldY) * uHazeAmt
//   color    = mix(color, uHazeColor, hfFactor)
// Врезка стоит ПЕРЕД <tonemapping_fragment> — дымка проходит через ACES roll-off вместе со
// всей картинкой (фильмичность сохраняется, цвет — в ЛИНЕЙНОМ рабочем пространстве, как и
// gl_FragColor на этом этапе; THREE.Color при включённом ColorManagement уже хранит linear,
// поэтому отдельная sRGB→linear конверсия не нужна — см. game.js, копирование hazeColor).
//
// ПЕРФ. Почти бесплатно: один smoothstep + один mix во фрагменте уже идущего прохода Lambert
// + один varying и одно modelMatrix*vec4 в вершиннике. Ноль новых draw-call/проходов/текстур.
// Один ОБЩИЙ объект uniforms на все материалы (замыкание, как в fog.js) — апдейт цвета/плотности
// раз в кадр уходит сразу во все. Идемпотентно (WeakSet): повторный вызов apply на уже одетом
// материале — no-op (важно: материалы стен/мебели шарятся и переустанавливаются при ремонте/
// перестановке; без защиты onBeforeCompile форсил бы рекомпиляцию шейдера и фриз на iPad).
//
// НЕ override-им customProgramCacheKey: материалы комнаты разнородны (текстурный пол vs
// цветной, бетон vs обои, дерево/пластик/металл мебели). Константный ключ схлопнул бы их в
// одну программу → битый рендер. Дефолтный ключ Three.js (учитывает map/defines) — то что надо.

import * as THREE from 'three';

export function createHeightFog() {
  // Общий объект юниформов на ВСЕ материалы (game.js обновляет color/amt из lighting.js).
  // uYLow/uYHigh — диапазон высот набора дымки: ниже uYLow дымки нет, выше uYHigh — максимум.
  // uYLow ОПУЩЕН к полу (0.25), чтобы мгла «заползала» снизу (запрос Олега «туман даже внутрь»),
  // но сам пол (плоскость y=0) и линии сетки остаются чистыми: пол даёт smoothstep(0.25,..,0)=0,
  // а сетка — THREE.Line (не Lambert) и врезкой не одевается вовсе → клетки читаются сквозь мглу.
  // uHazeFar — доп. плотность в ДАЛЬНЕМ от камеры углу (там окно и дверь): туман натекает снаружи.
  // uTime — лёгкое клубление дымки (один sin по XZ): мгла живёт, а не ровная пелена.
  const u = {
    uHazeColor: { value: new THREE.Color(0x182f3c) },
    uHazeAmt:   { value: 0.0 },
    uYLow:      { value: 0.25 },
    uYHigh:     { value: 3.0 },
    uTime:      { value: 0.0 },
    uHazeFar:   { value: 0.0 },
  };

  // Какие материалы уже одеты — чтобы apply был идемпотентным и для шаренных материалов.
  const applied = new WeakSet();

  // Одеть один материал. Только матовая геометрия комнаты/мебели (MeshLambertMaterial).
  // Прозрачное (стекло/вода/призрак) и шейдерное (экраны ТВ/аквариум/окно) пропускаем —
  // у них своя оптика, дымка им не нужна.
  function apply(material) {
    if (!material || applied.has(material)) return;
    if (!material.isMeshLambertMaterial) return;
    if (material.transparent || material.isShaderMaterial) return;
    applied.add(material);

    const prevOBC = material.onBeforeCompile;
    material.onBeforeCompile = (shader) => {
      if (prevOBC) prevOBC(shader); // не затираем чужую врезку, если появится
      Object.assign(shader.uniforms, u); // ссылки на ОБЩИЕ {value} — один апдейт на всех

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying float vHfWorldY;\nvarying vec2 vHfWorldXZ;'
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n  vec3 vHfWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vHfWorldY = vHfWP.y;\n  vHfWorldXZ = vHfWP.xz;'
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying float vHfWorldY;\nvarying vec2 vHfWorldXZ;\n' +
          'uniform vec3 uHazeColor;\nuniform float uHazeAmt;\nuniform float uYLow;\nuniform float uYHigh;\n' +
          'uniform float uTime;\nuniform float uHazeFar;'
        )
        .replace(
          '#include <tonemapping_fragment>',
          // вертикаль: мгла набирается от пола вверх (плоскость пола y=0 → 0; низ мебели чистый)
          'float hfH = smoothstep(uYLow, uYHigh, vHfWorldY);\n' +
          // дальний от камеры угол (back-left: окно z≈-4 + дверь x≈-5) тонет сильнее — туман снаружи
          '  float hfFar = clamp(0.5 + (-vHfWorldXZ.x) * 0.06 + (-vHfWorldXZ.y) * 0.075, 0.0, 1.0);\n' +
          // дальний туман ГАСНЕТ у самой плоскости пола: у y=0 маска=0 → пол и сетка остаются чистыми
          // (читаемость расстановки), мгла «заползает» лишь на нижние стены/мебель чуть ВЫШЕ пола
          '  float hfFarMask = smoothstep(0.0, 0.6, vHfWorldY);\n' +
          // дешёвое клубление (один sin по мировым XZ + время) — дымка живёт, не ровная пелена
          '  float hfCurl = 0.86 + 0.14 * sin(vHfWorldXZ.x * 0.8 + vHfWorldXZ.y * 0.6 + uTime * 0.25);\n' +
          '  float hfFactor = (hfH + uHazeFar * hfFar * hfFarMask * (1.0 - hfH) * 0.55) * uHazeAmt * hfCurl;\n' +
          '  hfFactor = min(hfFactor, 0.62);\n' + // потолок: даже в углу не глухая стена (читаемость)
          '  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, hfFactor);\n' +
          '#include <tonemapping_fragment>'
        );
    };
    material.needsUpdate = true; // пересобрать программу с врезкой
  }

  // Одеть все Lambert-материалы внутри объекта (пол/стены/мебель). Безопасно вызывать
  // многократно (apply идемпотентен). Линии (сетка/шнуры), Points (пылинки), шейдерные и
  // прозрачные меши пропускаются сами.
  function applyTo(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (Array.isArray(m)) m.forEach(apply);
      else apply(m);
    });
  }

  return { apply, applyTo, u };
}
