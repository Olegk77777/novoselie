// quests.js — движок квестов. Условия описаны декларативно в data/quests.json
// (тот же принцип, что items.json и combos.json: новый квест = новая запись).

// Расстояние между центрами двух предметов по полу
function dist2d(a, b) {
  return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
}

// Проверяет условие одного квеста.
// ctx: {
//   placedItems — поставленные предметы,
//   connections — Map прибор→розетка (power.js),
//   windowSeg — отрезок окна { alongMin, alongMax, z } на дальней стене,
//   wallDist(item) — расстояние от предмета до ближайшей стены
// }
export function isQuestDone(quest, ctx) {
  const itemsById = (id) => ctx.placedItems.filter((i) => i.userData.def.id === id);

  switch (quest.type) {
    case 'placed':
      return itemsById(quest.item).length > 0;

    case 'placedCount':
      // Поставлено минимум count предметов item (используется в requires)
      return itemsById(quest.item).length >= (quest.count || 1);

    case 'connected':
      return [...ctx.connections.keys()].some((d) => d.userData.def.id === quest.item);

    case 'near': {
      const as = itemsById(quest.a);
      const bs = itemsById(quest.b);
      return as.some((a) => bs.some((b) => dist2d(a, b) <= quest.maxDist));
    }

    case 'nearWindow':
      // Расстояние до ближайшей точки окна (отрезка на дальней стене)
      return itemsById(quest.item).some((i) => {
        const cx = Math.min(Math.max(i.position.x, ctx.windowSeg.alongMin), ctx.windowSeg.alongMax);
        return Math.hypot(i.position.x - cx, i.position.z - ctx.windowSeg.z) <= quest.maxDist;
      });

    case 'nearWall':
      return itemsById(quest.item).some((i) => ctx.wallDist(i) <= quest.maxDist);

    case 'onRug': {
      // Сколько предметов item стоят на ковре (пересечение занятых подклеток)
      const rugs = itemsById(quest.rug);
      const count = itemsById(quest.item).filter((item) => {
        if (!item.userData.keys) return false;
        const keys = new Set(item.userData.keys);
        return rugs.some((rug) => (rug.userData.keys || []).some((k) => keys.has(k)));
      }).length;
      return count >= (quest.minCount || 1);
    }

    case 'seatsNear':
      // У стола минимум minCount посадочных мест в радиусе maxDist
      return itemsById(quest.table).some((table) => {
        const seats = quest.seats.flatMap((s) => itemsById(s));
        return seats.filter((s) => dist2d(s, table) <= quest.maxDist).length >= quest.minCount;
      });

    default:
      console.warn(`Неизвестный тип квеста: ${quest.type}`);
      return false;
  }
}
