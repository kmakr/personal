// Weeks from the first one holding a shared record. Earlier weeks would be empty.
export function seasonWeeks(weeks, firstDate) {
  if (!Array.isArray(weeks) || !firstDate) return [];
  return weeks.filter((week) => week.end >= firstDate);
}
