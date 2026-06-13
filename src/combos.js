// combos.js — бонусы за сочетания. Условия описаны декларативно в data/combos.json
// (тот же принцип, что items.json: новый бонус = новая запись, без правки логики).

// Считает все бонусы по текущей расстановке.
// placedItems — поставленные предметы; connections — Map прибор→розетка (power.js).
// Возвращает [{ id, bonus, active }] в порядке из данных.
export function evaluateCombos(comboDefs, placedItems, connections) {
  const itemsById = (id) => placedItems.filter((i) => i.userData.def.id === id);

  // Проверка одного условия (combo или подусловие внутри 'all')
  function evalOne(c) {
    if (c.type === 'all') {
      // Все подусловия истинны (напр. «кресло у ТВ И ТВ подключён»)
      return c.conditions.every(evalOne);
    }
    if (c.type === 'placed') {
      // Предмет просто стоит/висит
      return itemsById(c.item).length > 0;
    }
    if (c.type === 'connected') {
      // Прибор подключён к розетке
      return [...connections.keys()].some((d) => d.userData.def.id === c.item);
    }
    if (c.type === 'near') {
      // Предмет a в радиусе maxDist клеток от предмета b (по центрам)
      const as = itemsById(c.a);
      const bs = itemsById(c.b);
      return as.some((a) =>
        bs.some((b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) <= c.maxDist)
      );
    }
    if (c.type === 'onRug') {
      // Предмет стоит на ковре: пересечение занятых подклеток
      const rugs = itemsById(c.rug);
      return itemsById(c.item).some((item) => {
        if (!item.userData.keys) return false;
        const keys = new Set(item.userData.keys);
        return rugs.some((rug) => (rug.userData.keys || []).some((k) => keys.has(k)));
      });
    }
    return false;
  }

  return comboDefs.map((combo) => ({ id: combo.id, bonus: combo.bonus, active: evalOne(combo) }));
}
