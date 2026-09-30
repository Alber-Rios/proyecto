export function getAdultBirthDateLimit(today = new Date()): string {
  const year = today.getFullYear() - 18;
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isAtLeast18(birthDate: string, today = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const [year, month, day] = birthDate.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return false;
  return birthDate <= getAdultBirthDateLimit(today);
}
