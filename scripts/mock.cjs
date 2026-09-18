const http = require('node:http');
// The exact field set buildAIMetadata is allowed to send. Anything else is a bug, and
// the mock answers 400 so the native test fails instead of quietly accepting it.
const allowed = [
  'key',
  'itemType',
  'title',
  'abstractNote',
  'publicationTitle',
  'proceedingsTitle',
  'bookTitle',
  'journalAbbreviation',
  'date',
  'creators',
  'tags',
  'DOI',
  'language',
  'extra',
];
const keywords = {
  topic: [{ zh: '植被恢复力', en: 'Vegetation resilience' }],
  region: [{ zh: '中国', en: 'China' }],
  object: [{ zh: '植被', en: 'Vegetation' }],
  method: [{ zh: '遥感', en: 'Remote sensing' }],
  dataset: [{ zh: 'MODIS', en: 'MODIS' }],
  variable: [{ zh: '归一化植被指数', en: 'NDVI' }],
};
const findings = [{ zh: '研究区植被发生变化', en: 'Vegetation changed in the study area' }];
let last = null;
http
  .createServer((req, res) => {
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url.startsWith('/last')) return json(200, last ?? {});
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      try {
        const input = JSON.parse(JSON.parse(raw).messages[1].content);
        last = input;
        const extra = [...new Set(input.items.flatMap((i) => Object.keys(i)))].filter(
          (k) => !allowed.includes(k),
        );
        if (extra.length) return json(400, { error: 'forbidden fields', extra });
        const items = input.items.map((r) => ({
          key: r.key,
          keywords: structuredClone(keywords),
          findings: structuredClone(findings),
        }));
        // Deliberate faults answered only on the first attempt, so a correction round
        // has to fix them. Used to exercise the unknown-key and duplicate-term rules.
        if (!input.correction && items.length) {
          if (req.url.startsWith('/repair')) items[0].key = 'WRONG';
          if (req.url.startsWith('/dupe'))
            items[0].keywords.topic = [
              { zh: '植被恢复力', en: 'Vegetation resilience' },
              { zh: '植被恢复力', en: 'Vegetation Resilience' },
            ];
        }
        const body = {
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ items }) } }],
        };
        if (req.url.startsWith('/slow')) setTimeout(() => json(200, body), 4000);
        else json(200, body);
      } catch (_) {
        json(400, {});
      }
    });
  })
  .listen(18767, '127.0.0.1', () => console.log('Mock API ready'));
