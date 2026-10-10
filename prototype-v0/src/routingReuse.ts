/** One last result, with an exact mutation-sensitive key; no cross-search/global result cache. */
export class RoutingReuse<T> {
  private identities = new WeakMap<object, number>();
  private nextId = 0;
  private previous?: { key: string; value: T };
  key(inputs: readonly unknown[]): string | undefined {
    const seen = new Set<object>();
    const visit = (value: unknown): string => {
      if (value === null) return "null;";
      if (typeof value === "string") return `s${value.length}:${value}`;
      if (typeof value === "number") return `n${Object.is(value, -0) ? "-0" : String(value)};`;
      if (typeof value === "boolean") return value ? "b1;" : "b0;";
      if (value === undefined) return "u;";
      if (typeof value !== "object") throw new Error("Unsupported routing input");
      let id = this.identities.get(value);
      if (id === undefined) { id = ++this.nextId; this.identities.set(value, id); }
      if (seen.has(value)) return `r${id};`;
      seen.add(value);
      const prefix = `o${id}:`;
      const prototype = Object.getPrototypeOf(value);
      const names = Object.getOwnPropertyNames(value);
      if (Object.getOwnPropertySymbols(value).length) throw new Error("Unsupported routing input");
      if (prototype === Date.prototype && !names.length) return prefix + visit(+value);
      if (prototype === Map.prototype && !names.length) return prefix + "map[" + [...value as Map<unknown, unknown>].map(([k, v]) => visit(k) + visit(v)).join("") + "]";
      if (prototype === Set.prototype && !names.length) return prefix + "set[" + [...value as Set<unknown>].map(visit).join("") + "]";
      if (prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype)
        throw new Error("Unsupported routing input");
      return prefix + (Array.isArray(value) ? "array{" : "object{") + names.map(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!("value" in descriptor)) throw new Error("Unsupported routing accessor");
        return visit(key) + visit(descriptor.value);
      }).join("") + "}";
    };
    try { return inputs.map(visit).join(""); } catch { return undefined; }
  }
  get(key: string | undefined): T | undefined { return key !== undefined && this.previous?.key === key ? this.previous.value : undefined; }
  set(key: string | undefined, value: T) { this.previous = key === undefined ? undefined : { key, value }; }
}
