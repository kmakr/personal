// Shared by the local and public dashboards. Dates are civil YYYY-MM-DD strings,
// so they are read at noon UTC and shown in UTC to keep the same calendar day.
export const count = (value) => (value == null ? '—' : Math.round(value).toLocaleString('en-GB'));
export const duration = (value) =>
  value == null ? '—' : `${Math.floor(Math.round(value) / 60)}h ${Math.round(value) % 60}m`;
export const dayDate = (value, options) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' });
export const shortDate = (value, long = false) =>
  dayDate(value, { day: 'numeric', month: 'short', ...(long ? { year: 'numeric' } : {}) });
export const weekday = (value) => dayDate(value, { weekday: 'short' });
