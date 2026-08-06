export function buildFtsQuery(terms: string[]) {
  return terms
    .map((term) => term.normalize("NFKC").trim().toLocaleLowerCase())
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
    .join(" OR ");
}
