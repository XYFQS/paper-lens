const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  C = require('../addon/content/core');
const labels = {
  zh: { region: ['中国'], subject: ['植被'], method: ['遥感'] },
  en: { region: ['China'], subject: ['Vegetation'], method: ['Remote sensing'] },
};
const r = {
  key: 'ABCD1234',
  metadata: {
    itemType: 'journalArticle',
    title: 'Vegetation resilience',
    creators: [{ firstName: 'Ming', lastName: 'Li' }],
    date: '2024',
    DOI: '10.1/test',
  },
  labels,
};
test('all bibliographic metadata and bilingual keywords are searchable', () => {
  for (const q of ['Ming', '10.1/test', '中国', 'remote sensing', '2024'])
    assert(C.matches(r, q, []));
  assert(!C.matches(r, 'missing', []));
});
test('text box AND combines with rule group; rules allow AND and OR', () => {
  const rules = [
    { field: 'itemType', value: 'conferencePaper', op: 'has' },
    { field: 'region', value: '中国', op: 'has' },
  ];
  assert(!C.matches(r, 'vegetation', rules, 'all'));
  assert(C.matches(r, 'vegetation', rules, 'any'));
  assert(!C.matches(r, 'missing', rules, 'any'));
});
test('negative conditions and missing labels are explicit', () => {
  assert(C.matches(r, '', [{ field: 'region', value: 'Europe', op: 'not' }]));
  assert(!C.matches({ ...r, labels: null }, '', [{ field: 'region', value: '中国', op: 'has' }]));
  assert(C.matches({ ...r, labels: null }, '', [{ field: 'region', value: '中国', op: 'not' }]));
});
test('bilingual output validated, max five words and parallel lists', () => {
  assert.equal(
    C.validate({ items: [{ key: r.key, ...labels }] }, [r])[0].labels.en.method[0],
    'Remote sensing',
  );
  for (const mutate of [
    (x) => (x.items[0].key = 'UNKNOWN'),
    (x) => x.items.push(x.items[0]),
    (x) => x.items[0].zh.region.push('北京'),
    (x) => (x.items[0].en.method = Array(6).fill('x')),
    (x) => (x.items[0].en.subject = null),
  ]) {
    const x = { items: [{ key: r.key, ...structuredClone(labels) }] };
    mutate(x);
    assert.throws(() => C.validate(x, [r]));
  }
  assert.throws(() => C.validate({ items: [] }, [r]));
});
test('no speculative tags: empty matching lists are accepted', () => {
  const empty = Object.fromEntries(
    ['zh', 'en'].map((l) => [l, { region: [], subject: [], method: [] }]),
  );
  assert.equal(C.validate({ items: [{ key: r.key, ...empty }] }, [r]).length, 1);
});
test('metadata excludes note body, attachment path and self-added labels but retains all other fields', () => {
  const x = C.metadata(
    {
      title: 'A',
      extra: 'custom',
      DOI: 'x',
      tags: [{ tag: 'User' }, { tag: 'Owned' }],
      note: 'secret text',
      path: 'private',
      collections: ['ABC'],
      version: 2,
    },
    ['Owned'],
  );
  assert.equal(x.extra, 'custom');
  assert.equal(x.tags.length, 1);
  assert(!('note' in x));
  assert(!('path' in x));
  assert.deepEqual(x.collections, ['ABC']);
});
test('endpoint handles full paths safely', () => {
  assert.equal(C.endpoint('https://host/v1/'), 'https://host/v1/chat/completions');
  assert.equal(
    C.endpoint('http://127.0.0.1:12/chat/completions'),
    'http://127.0.0.1:12/chat/completions',
  );
  for (const u of ['http://remote/', 'file:///a', 'https://key@host/'])
    assert.throws(() => C.endpoint(u));
});
test('JSON code fences accepted; prose rejected', () => {
  assert.deepEqual(C.parse('```json\n{"items":[]}\n```'), { items: [] });
  assert.throws(() => C.parse('Here: {}'));
});
