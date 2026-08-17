function contextFromIndex(order, index) {
  if (order === 0) return "*";
  return index
    .toString(2)
    .padStart(order, "0")
    .replaceAll("0", "d")
    .replaceAll("1", "f");
}

export function decodePopulationPrior(base64, maxContext) {
  const binary = globalThis.atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const expectedValues = 2 * (2 ** (maxContext + 1) - 1);
  if (bytes.byteLength !== expectedValues * 4) {
    throw new Error(
      `Population prior has ${bytes.byteLength / 4} counts; expected ${expectedValues}`,
    );
  }

  let offset = 0;
  const orders = [];
  for (let order = 0; order <= maxContext; order += 1) {
    const table = Object.create(null);
    for (let index = 0; index < 2 ** order; index += 1) {
      const f = view.getUint32(4 * offset++, true);
      const d = view.getUint32(4 * offset++, true);
      if (f !== 0 || d !== 0) table[contextFromIndex(order, index)] = { f, d };
    }
    orders.push(Object.freeze(table));
  }
  return Object.freeze({ version: 1, maxContext, orders: Object.freeze(orders) });
}
