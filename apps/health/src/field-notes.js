// A few plain sentences about the seven-day garden, written like notes from a walk.
const count = (value) => Math.round(value).toLocaleString('en-GB');
const about = (value) => (Math.round(value / 100) * 100).toLocaleString('en-GB');
const day = (value) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
const NUMBERS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];
const most = (rows, key) => rows.reduce((a, row) => (!a || row[key] > a[key] ? row : a), null);

// rows: the garden's days, oldest first. resting: the moth's day.
// breathWeek: the newest week with a public breathing rate, if any.
export function fieldNotes(rows, resting, breathWeek) {
  const notes = [];
  const stepDays = rows.filter((row) => row.steps != null);
  const minuteDays = rows.filter((row) => row.zoneMinutes != null);
  if (stepDays.length) {
    const total = stepDays.reduce((sum, row) => sum + row.steps, 0);
    const recorded =
      stepDays.length === rows.length
        ? `${NUMBERS[rows.length] || rows.length} ${rows.length === 1 ? 'plant' : 'plants'}`
        : `${stepDays.length} of ${rows.length} days recorded`;
    notes.push(
      stepDays.length > 1
        ? `${recorded}, ${count(total)} steps between them: about ${about(total / stepDays.length)} a day.`
        : `${recorded}, ${count(total)} steps.`,
    );
  }
  if (stepDays.length > 1) {
    const tallest = most(stepDays, 'steps');
    notes.push(`The tallest grew on ${day(tallest.date)}, at ${count(tallest.steps)} steps.`);
  }
  if (minuteDays.length > 1) {
    const total = minuteDays.reduce((sum, row) => sum + row.zoneMinutes, 0);
    const windiest = most(minuteDays, 'zoneMinutes');
    notes.push(
      `${count(total)} active minutes in all. The wind blew hardest on ${day(windiest.date)}, with ${count(windiest.zoneMinutes)}.`,
    );
  }
  if (resting && [resting.steps, resting.zoneMinutes].some((value) => value != null)) {
    const values = [
      resting.steps != null && `${count(resting.steps)} steps`,
      resting.zoneMinutes != null && `${count(resting.zoneMinutes)} active minutes`,
    ].filter(Boolean);
    let line = `The moth rests on ${day(resting.date)}, the newest day: ${values.join(' and ')}.`;
    if (breathWeek)
      line += ` It breathes ${breathWeek.breathingRate} times a minute, my average for the week of ${day(breathWeek.start)}.`;
    notes.push(line);
  }
  return notes;
}
