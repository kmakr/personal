export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function demoData(end, days) {
  const values = [
    6840, 9210, 7420, 10480, 5820, 11460, 8432, 7280, 9870, 10340, 6450, 9120, 7680, 8642,
  ];
  return {
    mode: 'demo',
    warnings: [],
    source: 'Sample data',
    days: Array.from({ length: days }, (_, i) => {
      const d = new Date(`${end}T12:00:00`);
      d.setDate(d.getDate() - (days - 1 - i));
      const date = localDate(d),
        n = 14 - days + i;
      const mins = [418, 445, 398, 472, 421, 450, 462, 428, 440, 410, 457, 432, 465, 452][n];
      const start = new Date(`${date}T00:00:00+08:00`);
      start.setMinutes(start.getMinutes() - 50);
      let cursor = start.getTime();
      const sequence = [
        ['LIGHT', 25],
        ['DEEP', 43],
        ['LIGHT', 39],
        ['REM', 24],
        ['AWAKE', 9],
        ['LIGHT', 46],
        ['DEEP', 34],
        ['LIGHT', 44],
        ['REM', 38],
        ['AWAKE', 8],
        ['LIGHT', 55],
        ['DEEP', 15],
        ['REM', 42],
        ['LIGHT', 47],
      ];
      const ratio = mins / 452;
      const stages = sequence.map(([type, m]) => {
        const startTime = new Date(cursor).toISOString();
        cursor += Math.round(m * ratio) * 60000;
        return { type, startTime, endTime: new Date(cursor).toISOString() };
      });
      return {
        date,
        steps: values[n],
        zoneMinutes: [22, 38, 31, 46, 18, 54, 36, 28, 42, 51, 20, 35, 41, 38][n],
        restingHeartRate: [61, 59, 60, 58, 62, 59, 58, 61, 60, 59, 62, 60, 59, 58][n],
        hrv: [42, 46, 44, 49, 40, 47, 52, 43, 48, 46, 41, 47, 50, 51][n],
        oxygen: 97 + (n % 3) * 0.4,
        respiratoryRate: 14 + (n % 4) * 0.3,
        sleepMinutes: mins,
        sleep: {
          interval: {
            startTime: start.toISOString(),
            endTime: new Date(cursor).toISOString(),
            startUtcOffset: '28800s',
            endUtcOffset: '28800s',
          },
          stages,
          summary: {
            minutesAsleep: String(mins),
            stagesSummary: ['DEEP', 'LIGHT', 'REM', 'AWAKE'].map((type) => ({
              type,
              minutes: String(
                stages
                  .filter((s) => s.type === type)
                  .reduce(
                    (a, s) => a + (Date.parse(s.endTime) - Date.parse(s.startTime)) / 60000,
                    0,
                  ),
              ),
            })),
          },
          metadata: { main: true },
        },
      };
    }),
  };
}
