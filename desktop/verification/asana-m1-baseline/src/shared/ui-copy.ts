/** Presentation-only boundary: never apply to fetched task fields or histories. */
export function interfaceCopy(value: string): string {
  return value.replace(/\bPES Focus\b/gi, 'PES').replace(/\btugas\b/gi, word => word === word.toUpperCase() ? 'TASKS' : word[0] === word[0].toUpperCase() ? 'Tasks' : 'tasks');
}
