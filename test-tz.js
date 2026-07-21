const d = new Date("1899-12-30T00:57:56.000Z");
console.log(d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }));
