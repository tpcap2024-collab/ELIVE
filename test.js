fetch('http://127.0.0.1:3000/api/trucks?url=' + encodeURIComponent('https://script.google.com/macros/s/AKfycbwV9sfFxE-9lN4A08EKGq55_RlBjlVcvK6Bdeddj8GT0-6huxxnz8oyT7zunl69PK3qJA/exec'))
  .then(res => res.json())
  .then(console.log).catch(console.error);
