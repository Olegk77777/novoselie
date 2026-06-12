// combos.js — бонусы за сочетания. Условия описаны декларативно в data/combos.json
// (тот же принцип, что items.json: новый бонус = новая запись, без правки логики).

// Считает все бонусы по текущей расстановке.
// placedItems — поставленные предметы; connections — Map прибор→розетка (power.js).
// Возвращает [{ id, bonus, active }] в порядке из данных.
export function evaluateCombos(comboDefs, placedItems, connections) {
  const itemsById = (id) => placedItems.filter((i) => i.userData.def.id === id);

  return comboDefs.map((combo) => {
    let active = false;

    if (combo.type === 'placed') {
      // Предмет просто стоит/висит
      active = itemsById(combo.item).length > 0;
    } else if (combo.type === 'connected') {
      // Прибор подключён к розетке
      active = [...connections.keys()].some((d) => d.userData.def.id === combo.item);
    } else if (combo.type === 'near') {
      // Предмет a в радиусе maxDist клеток от предмета b (по центрам)
      const as = itemsById(combo.a);
      const bs = itemsById(combo.b);
      active = as.some((a) =>
        bs.some(
          (b) =>
            Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) <= combo.maxDist
        )
      );
    } else if (combo.type === 'onRug') {
      // Предмет стоит на ковре: пересечение занятых подклеток
      const rugs = itemsById(combo.rug);
      active = itemsById(combo.item).some((item) => {
        if (!item.userData.keys) return false;
        const keys = new Set(item.userData.keys);
        return rugs.some((rug) => (rug.userData.keys || []).some((k) => keys.has(k)));
      });
    }

    return { id: combo.id, bonus: combo.bonus, active };
  });
}
