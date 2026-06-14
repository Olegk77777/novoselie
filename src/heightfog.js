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
// ВЕРТИКАЛЬНО — по мировой высоте Y: пол (y=0), линии сетки и низ мебели остаются кристально
// чистыми ВСЕГДА, а к дымке уходят только верх стен и дальняя стена (они физически выше в
// кадре). Это ровно референс «авто в тумане»: низ детальный, верх/даль растворяется.
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
  // uYLow/uYHigh — диапазон высот набора дымки: ниже uYLow дымки нет (пол, сетка, низ мебели),
  // выше uYHigh — максимум. uYHigh чуть ниже WALL_HEIGHT(2.5), чтобы верх дальней стены успевал
  // выйти на полную дымку.
  const u = {
    uHazeColor: { value: new THREE.Color(0x16202e) },
    uHazeAmt:   { value: 0.0 },
    uYLow:      { value: 0.7 },
    uYHigh:     { value: 2.3 },
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
          '#include <common>\nvarying float vHfWorldY;'
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvHfWorldY = (modelMatrix * vec4(transformed, 1.0)).y;'
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying float vHfWorldY;\n' +
          'uniform vec3 uHazeColor;\nuniform float uHazeAmt;\nuniform float uYLow;\nuniform float uYHigh;'
        )
        .replace(
          '#include <tonemapping_fragment>',
          'float hfFactor = smoothstep(uYLow, uYHigh, vHfWorldY) * uHazeAmt;\n' +
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
