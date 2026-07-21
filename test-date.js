const d = new Date("2026-07-20T17:00:00.000Z");
console.log(d.toISOString().split('T')[0]);
// Wait, 17:00:00 UTC is next day 00:00:00 in Thailand... but let's see.
console.log(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }));
