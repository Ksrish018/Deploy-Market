// Ported from server/src/deadlines.js.
export function computeDeadline(responseWindow: string, fromDate: Date = new Date()): string {
  const d = new Date(fromDate);
  if (responseWindow === 'same_day') {
    d.setDate(d.getDate() + 1);
    d.setHours(17, 0, 0, 0);
  } else if (responseWindow === 'this_week') {
    const day = d.getDay(); // 0 = Sun .. 6 = Sat
    const daysUntilFriday = (5 - day + 7) % 7;
    d.setDate(d.getDate() + daysUntilFriday);
    d.setHours(17, 0, 0, 0);
  } else {
    d.setDate(d.getDate() + 21);
    d.setHours(17, 0, 0, 0);
  }
  return d.toISOString();
}
