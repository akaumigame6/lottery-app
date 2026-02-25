/**
 * 抽選ロジックを管理するモジュール
 */

/**
 * 完全ランダム抽選: 毎回全員が対象。重複あり。
 * @param items 全体のアイテムリスト
 * @returns 抽選されたアイテム
 */
export function drawRandom(items: string[]): string | null {
  if (items.length === 0) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

/**
 * 一巡（重複なし）抽選: 全員が当たるまで、一度当たった人は除外される。
 * @param items 全体のアイテムリスト
 * @param drawnItems すでに当選したアイテムのリスト
 * @returns 新たに抽選されたアイテムと、更新された当選済みリスト
 */
export function drawRoundRobin(
  items: string[],
  drawnItems: string[]
): { selected: string | null; updatedDrawnItems: string[] } {
  if (items.length === 0) return { selected: null, updatedDrawnItems: [] };

  // まだ当たっていない人を抽出
  const remaining = items.filter((item) => !drawnItems.includes(item));

  // 全員当たった場合はリセットして再度抽選
  if (remaining.length === 0) {
    const selected = drawRandom(items);
    return { selected, updatedDrawnItems: selected ? [selected] : [] };
  }

  const selected = drawRandom(remaining);
  return {
    selected,
    updatedDrawnItems: selected ? [...drawnItems, selected] : drawnItems,
  };
}
