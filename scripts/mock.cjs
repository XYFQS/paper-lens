const http = require('node:http');
http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      try {
        const input = JSON.parse(JSON.parse(raw).messages[1].content);
        const data = {
          items: input.items.map((r) => ({
            key: r.key,
            zh: { region: ['中国'], subject: ['植被'], method: ['遥感'] },
            en: { region: ['China'], subject: ['Vegetation'], method: ['Remote sensing'] },
          })),
        };
        if (req.url.startsWith('/repair') && !input.correction && data.items.length)
          data.items[0].key = 'WRONG';
        const send = () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }],
            }),
          );
        };
        if (req.url.startsWith('/slow')) setTimeout(send, 4000);
        else send();
      } catch (_) {
        res.writeHead(400);
        res.end('{}');
      }
    });
  })
  .listen(18767, '127.0.0.1', () => console.log('Mock API ready'));
