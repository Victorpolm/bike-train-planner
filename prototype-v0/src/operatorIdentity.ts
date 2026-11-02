import registry from "./operator-identities.json" with { type: "json" };

/** Identity only: parent-company membership must not leak to sibling businesses. */
export function operatorIdentity(value?: string | null, day = registry.checked) {
  const key = value?.normalize("NFKC").toUpperCase().replace(/\s+/g, " ").trim() ?? "";
  const row = (registry.identities as Record<string, string[]>)[key];
  if (!row || day < row[3] || day > row[4]) return null;
  return { businessNumber: row[0], sboid: row[1], abbreviation: row[2], validFrom: row[3], validThrough: row[4], businessTypes: row[5] };
}
