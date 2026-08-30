export function resolveUniqueDiceFormulaName(
  requestedName: string,
  existingNames: readonly string[],
): string {
  const baseName = requestedName.trim();
  const occupied = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase('it')));

  if (!occupied.has(baseName.toLocaleLowerCase('it'))) return baseName;

  let suffix = 1;
  while (occupied.has(`${baseName} (${suffix})`.toLocaleLowerCase('it'))) {
    suffix += 1;
  }
  return `${baseName} (${suffix})`;
}
