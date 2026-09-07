// Turns a response_window label into a concrete deadline.
// Assumption (documented in README): same_day = next calendar day 17:00;
// this_week = end of the current week (Friday 17:00, rolling to next Friday
// on weekends); background = 21 days out. Leadership can treat these as
// defaults — every signal still shows its computed deadline for review/edit.
export function computeDeadline(responseWindow, fromDate = new Date()) {
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
