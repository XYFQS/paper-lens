const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  C = require('../addon/content/core'),
  S = require('../addon/content/store');
const keywords = {
  topic: [{ zh: '植被恢复力', en: 'Vegetation resilience' }],
  region: [{ zh: '中国', en: 'China' }],
  object: [{ zh: '植被', en: 'Vegetation' }],
  method: [{ zh: '随机森林', en: 'Random Forest' }],
  dataset: [{ zh: 'MODIS', en: 'MODIS' }],
  variable: [{ zh: '归一化植被指数', en: 'NDVI' }],
};
const findings = [{ zh: '植被恢复力在研究期内下降', en: 'Vegetation resilience declined' }];
const record = {
  key: 'ABCD1234',
  fingerprint: 'fp1',
  metadata: {
    itemType: 'journalArticle',
    title: 'Vegetation resilience',
    abstractNote: 'A study of China.',
    creators: [{ firstName: 'Ming', lastName: 'Li', creatorType: 'author' }],
    date: '2024-05-01',
    journalAbbreviation: 'NCC',
    DOI: '10.1/test',
  },
  analysis: {
    status: 'complete',
    keywords,
    findings,
    aiModel: 'synthetic',
    aiAt: '2024-01-01T00:00:00.000Z',
    sourceFingerprint: 'fp1',
  },
  workflow: {
    readingStatus: 'read',
    importance: 'core',
    roles: ['discussion'],
    memorySentenceOverride: null,
  },
  manual: { additions: C.emptyKeywords(), removals: C.emptyKeywords() },
};
const found = (r, kind) => C.effective(r)[kind].map((p) => p.en);

test('all bibliographic metadata and paired keywords are searchable in both languages', () => {
  for (const q of ['Ming', '10.1/test', '中国', 'vegetation resilience', '2024', 'ndvi'])
    assert(C.matches(record, q, []));
  assert(!C.matches(record, 'missing', []));
});

test('every searchable dimension has its own condition field', () => {
  for (const [field, value] of [
    ['itemType', 'journalArticle'],
    ['topic', 'Vegetation resilience'],
    ['region', '中国'],
    ['object', 'Vegetation'],
    ['method', 'random forest'],
    ['dataset', 'MODIS'],
    ['variable', 'ndvi'],
    ['year', '2024'],
    ['journal', 'NCC'],
    ['readingStatus', 'read'],
    ['importance', 'core'],
    ['role', 'discussion'],
  ])
    assert(C.matches(record, '', [{ field, value, op: 'has' }]), `${field} should match ${value}`);
  assert(!C.matches(record, '', [{ field: 'method', value: 'XGBoost', op: 'has' }]));
});

test('findings and the memory sentence are searchable but never replace metadata', () => {
  assert(C.matches(record, 'declined', []));
  assert(C.matches(record, 'Li 2024', []));
  assert(C.matches(record, 'NCC', []));
});

test('text box AND combines with rule group; rules allow AND and OR', () => {
  const rules = [
    { field: 'itemType', value: 'conferencePaper', op: 'has' },
    { field: 'region', value: '中国', op: 'has' },
  ];
  assert(!C.matches(record, 'vegetation', rules, 'all'));
  assert(C.matches(record, 'vegetation', rules, 'any'));
  assert(!C.matches(record, 'missing', rules, 'any'));
});

test('negative conditions and missing analysis are explicit', () => {
  assert(C.matches(record, '', [{ field: 'region', value: 'Europe', op: 'not' }]));
  const bare = { ...record, analysis: { ...record.analysis, keywords: null } };
  assert(!C.matches(bare, '', [{ field: 'region', value: '中国', op: 'has' }]));
  assert(C.matches(bare, '', [{ field: 'region', value: '中国', op: 'not' }]));
});

test('six categories validate with paired Chinese and English entries', () => {
  const result = C.validate({ items: [{ key: record.key, keywords, findings }] }, [record]);
  assert.deepEqual(result[0].keywords.dataset, [{ zh: 'MODIS', en: 'MODIS' }]);
  assert.equal(result[0].findings.length, 1);
  assert.throws(() => C.validate({ items: [{ key: record.key, keywords, findings: [] }] }, []));
});

test('keyword and finding limits are enforced', () => {
  const clone = () => structuredClone({ key: record.key, keywords, findings });
  for (const mutate of [
    (x) => (x.keywords.method = Array(6).fill({ zh: '甲', en: 'A' })),
    (x) => (x.findings = Array(4).fill({ zh: '甲', en: 'A' })),
  ]) {
    const x = clone();
    mutate(x);
    assert.throws(() => C.validate({ items: [x] }, [record]));
  }
  const full = clone();
  full.keywords.method = Array(5)
    .fill(0)
    .map((_, i) => ({ zh: `甲${i}`, en: `A${i}` }));
  assert.equal(C.validate({ items: [full] }, [record])[0].keywords.method.length, 5);
});

test('a half pair, a repeat or an unknown key is rejected', () => {
  for (const mutate of [
    (x) => (x.keywords.topic = [{ zh: '植被恢复力' }]),
    (x) => (x.keywords.topic = [{ zh: '  ', en: 'X' }]),
    (x) =>
      (x.keywords.topic = [
        { zh: '甲', en: 'A' },
        { zh: '甲', en: 'A' },
      ]),
    (x) =>
      (x.keywords.topic = [
        { zh: '甲', en: 'A' },
        { zh: '乙', en: 'a' },
      ]),
    (x) => delete x.keywords.variable,
    (x) => (x.key = 'UNKNOWN'),
  ]) {
    const x = structuredClone({ key: record.key, keywords, findings });
    mutate(x);
    assert.throws(() => C.validate({ items: [x] }, [record]));
  }
});

test('pair de-duplication is case and spacing insensitive and keeps source order', () => {
  const list = C.unique([
    { zh: '随机森林', en: 'Random Forest' },
    { zh: ' 随机森林 ', en: 'random forest' },
    { zh: 'XGBoost', en: 'XGBoost' },
  ]);
  assert.deepEqual(list, [
    { zh: '随机森林', en: 'Random Forest' },
    { zh: 'XGBoost', en: 'XGBoost' },
  ]);
});

test('no speculative tags: empty lists are accepted without padding', () => {
  const empty = C.emptyKeywords();
  const result = C.validate({ items: [{ key: record.key, keywords: empty, findings: [] }] }, [
    record,
  ]);
  assert.deepEqual(result[0].keywords, empty);
});

test('manual additions and removals produce effective keywords', () => {
  const edited = structuredClone(record);
  edited.manual.removals.method = [{ zh: '随机森林', en: 'Random Forest' }];
  edited.manual.additions.method = [{ zh: '极端梯度提升', en: 'XGBoost' }];
  edited.manual.additions.topic = [{ zh: '干旱遗留', en: 'Drought legacy' }];
  assert.deepEqual(found(edited, 'method'), ['XGBoost']);
  assert.deepEqual(found(edited, 'topic'), ['Vegetation resilience', 'Drought legacy']);
  assert.equal(C.effective(edited).dataset.length, 1, 'untouched categories are unchanged');
});

test('a manual correction survives a fresh AI result', () => {
  const edited = structuredClone(record);
  edited.manual.removals.method = [{ zh: '随机森林', en: 'Random Forest' }];
  edited.manual.additions.variable = [{ zh: '蒸散发', en: 'ET' }];
  assert.deepEqual(found(edited, 'variable'), ['NDVI', 'ET']);
  assert.deepEqual(found(edited, 'method'), []);
});

test('manual corrections never mutate what the AI returned', () => {
  const edited = structuredClone(record);
  edited.manual.removals.region = [{ zh: '中国', en: 'China' }];
  assert.deepEqual(found(edited, 'region'), []);
  assert.equal(edited.analysis.keywords.region.length, 1);
});

test('a hand-added term is dropped when removed, not recorded as a rejection', () => {
  const added = C.correct(C.manualSet(null), 'method', {
    add: { zh: '极端梯度提升', en: 'XGBoost' },
  });
  assert.equal(added.additions.method.length, 1);
  const dropped = C.correct(added, 'method', { remove: { zh: '极端梯度提升', en: 'XGBoost' } });
  assert.deepEqual(dropped.additions.method, []);
  assert.deepEqual(dropped.removals.method, [], 'the model may still return XGBoost later');
});

test('re-adding a rejected term clears the rejection', () => {
  const rejected = C.correct(C.manualSet(null), 'region', { remove: { zh: '中国', en: 'China' } });
  assert.equal(rejected.removals.region.length, 1);
  const back = C.correct(rejected, 'region', { add: { zh: '中国', en: 'China' } });
  assert.deepEqual(back.removals.region, []);
  assert.equal(back.additions.region.length, 1);
  // An edit always carries both languages, but matching identifies a term when
  // either side agrees, so a chip removes exactly the entry the model returned.
  assert(C.samePair({ zh: '中国', en: 'China' }, { zh: '中国大陆', en: 'China' }));
  assert(!C.samePair({ zh: '中国', en: 'China' }, { zh: '美国', en: 'USA' }));
  assert.deepEqual(
    C.correct(back, 'region', { remove: { zh: '中国', en: 'China' } }).additions.region,
    [],
  );
});

test('restoring one category clears only that category', () => {
  let manual = C.correct(C.manualSet(null), 'method', {
    remove: { zh: '遥感', en: 'Remote sensing' },
  });
  manual = C.correct(manual, 'region', { add: { zh: '中国', en: 'China' } });
  const restored = C.resetCorrections(manual, 'method');
  assert.deepEqual(restored.removals.method, []);
  assert.equal(restored.additions.region.length, 1);
  assert.deepEqual(C.resetCorrections(manual).additions.region, []);
});

test('an unknown category or a half pair is rejected before it reaches the index', () => {
  for (const change of [{ add: { zh: '甲', en: 'A' } }, { remove: { zh: '甲', en: 'A' } }]) {
    assert.throws(() => C.correct(null, 'subject', change));
    assert.throws(() => C.resetCorrections(null, 'subject'));
  }
  assert.throws(() => C.correct(null, 'topic', { add: { zh: '甲' } }));
  assert.throws(() => C.correct(null, 'topic', { remove: { en: 'A' } }));
  assert.deepEqual(C.correct(null, 'topic', {}), C.manualSet(null));
});

test('the memory sentence is assembled from metadata only and omits what is missing', () => {
  assert.equal(
    C.memorySentence(record),
    'Li 2024 | NCC | China | Random Forest | Vegetation resilience declined',
  );
  const bare = { ...record, metadata: { title: 'Untitled' }, analysis: { keywords: null } };
  assert.equal(C.memorySentence(bare), '');
  assert.equal(
    C.memorySentence({ ...record, metadata: { ...record.metadata, date: 'n.d.' } }),
    'Li | NCC | China | Random Forest | Vegetation resilience declined',
  );
});

test('the venue is read from whichever field the item type uses', () => {
  const venue = (metadata) =>
    C.journal({ ...record.metadata, journalAbbreviation: undefined, ...metadata });
  assert.equal(venue({ publicationTitle: 'Nature' }), 'Nature');
  assert.equal(venue({ proceedingsTitle: 'IGARSS' }), 'IGARSS');
  assert.equal(venue({ bookTitle: 'Remote Sensing Handbook' }), 'Remote Sensing Handbook');
  assert.equal(
    venue({ journalAbbreviation: 'NCC', publicationTitle: 'Nature Climate Change' }),
    'NCC',
    'the abbreviation wins when the item carries one',
  );
  assert.equal(venue({ publicationTitle: '', proceedingsTitle: 'IGARSS' }), 'IGARSS');
  assert.equal(C.journal({}), '');
  // Whatever the field, the value is on the wire for the model and searchable.
  assert(
    C.matches(
      { ...record, metadata: { ...record.metadata, proceedingsTitle: 'IGARSS' } },
      'igarss',
      [],
    ),
  );
  assert(C.aiFields.includes('proceedingsTitle') && C.aiFields.includes('bookTitle'));
});

test('the year is taken from the bibliographic date and never invented', () => {
  assert.equal(C.year({ date: '2022-05-01' }), '2022');
  assert.equal(C.year({ date: '2022' }), '2022');
  assert.equal(C.year({ date: 'Spring 1999' }), '1999');
  assert.equal(C.year({}), '');
  assert.equal(C.year({ date: 'n.d.' }), '');
});

test('a user memory sentence overrides the automatic one and is not flattened', () => {
  const override = {
    ...record,
    workflow: { ...record.workflow, memorySentenceOverride: '我的记忆' },
  };
  assert.equal(C.memorySentence(override), '我的记忆');
  assert(C.matches(override, '我的记忆', []));
});

test('native tags use one canonical English prefix per category', () => {
  assert.deepEqual(C.tagNames(record), [
    'T::Vegetation resilience',
    'R::China',
    'O::Vegetation',
    'M::Random Forest',
    'D::MODIS',
    'V::NDVI',
  ]);
});

test('native tags follow manual corrections, not the raw AI output', () => {
  const edited = structuredClone(record);
  edited.manual.additions.method = [{ zh: '极端梯度提升', en: 'XGBoost' }];
  edited.manual.removals.variable = [{ zh: '归一化植被指数', en: 'NDVI' }];
  const tags = C.tagNames(edited);
  assert(tags.includes('M::XGBoost'));
  assert(!tags.includes('V::NDVI'));
});

test('workflow fields fall back to safe defaults and reject unknown values', () => {
  assert.deepEqual(C.workflow({}), S.workflowDefaults());
  assert.deepEqual(
    C.workflow({ workflow: { readingStatus: 'bogus', importance: 'bogus', roles: ['nope'] } }),
    {
      readingStatus: 'unread',
      importance: 'normal',
      roles: [],
      memorySentenceOverride: null,
    },
  );
  assert.equal(C.workflow({ workflow: { roles: ['discussion', 'nope'] } }).roles.length, 1);
});

test('the AI payload carries only paper-describing fields', () => {
  const payload = C.aiInput({
    key: 'ABCD1234',
    metadata: {
      title: 'A',
      abstractNote: 'B',
      extra: 'custom',
      DOI: 'x',
      collections: ['ABC'],
      tags: [{ tag: 'User' }],
      note: 'secret text',
      path: 'private',
      attachmentContent: 'full text',
      version: 2,
    },
  });
  assert.deepEqual(Object.keys(payload).sort(), [
    'DOI',
    'abstractNote',
    'extra',
    'key',
    'tags',
    'title',
  ]);
  assert.deepEqual(payload.tags, ['User']);
  for (const banned of ['note', 'path', 'attachmentContent', 'collections'])
    assert(!(banned in payload));
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

const v1Record = {
  id: 1,
  key: 'OLDKEY01',
  fingerprint: 'fp-old',
  metadata: { itemType: 'journalArticle', title: 'Old paper', date: '2019' },
  labels: {
    zh: { region: ['中国', '黄土高原'], subject: ['植被'], method: ['遥感'] },
    en: { region: ['China', 'Loess Plateau'], subject: ['Vegetation'], method: ['Remote sensing'] },
  },
  aiModel: 'deepseek-v4-flash',
  aiAt: '2024-01-01T00:00:00.000Z',
  ownedTags: ['研究区域：中国', 'Study region: China'],
  updatedAt: '2024-01-01T00:00:00.000Z',
};

test('migrating a v1 index produces a v2 index', () => {
  const { data, migrated } = S.migrate({ version: 1, records: { OLDKEY01: v1Record } });
  assert(migrated);
  assert.equal(data.version, 2);
  assert.equal(S.migrate(data).migrated, false, 'v2 input is left alone');
  assert.equal(S.migrate({ version: 1, records: {} }).data.records.OLDKEY01, undefined);
});

test('v1 labels migrate by pair: subject becomes object, new categories start empty', () => {
  const { data } = S.migrate({ version: 1, records: { OLDKEY01: v1Record } }),
    migrated = data.records.OLDKEY01;
  assert.deepEqual(migrated.analysis.keywords.region, [
    { zh: '中国', en: 'China' },
    { zh: '黄土高原', en: 'Loess Plateau' },
  ]);
  assert.deepEqual(migrated.analysis.keywords.object, [{ zh: '植被', en: 'Vegetation' }]);
  assert.deepEqual(migrated.analysis.keywords.method, [{ zh: '遥感', en: 'Remote sensing' }]);
  for (const kind of ['topic', 'dataset', 'variable'])
    assert.deepEqual(migrated.analysis.keywords[kind], []);
});

test('a migrated v1 record is legacy-partial and still needs analysis', () => {
  const { data } = S.migrate({ version: 1, records: { OLDKEY01: v1Record } }),
    migrated = data.records.OLDKEY01;
  assert.equal(migrated.analysis.status, 'legacy-partial');
  assert(S.needsAnalysis(migrated));
  assert.deepEqual(migrated.analysis.findings, []);
  assert.equal(
    migrated.analysis.sourceFingerprint,
    'fp-old',
    'the partial profile still names the revision it was made from',
  );
});

test('migration preserves metadata, ownership receipts and workflow defaults', () => {
  const { data } = S.migrate({ version: 1, records: { OLDKEY01: v1Record } }),
    migrated = data.records.OLDKEY01;
  assert.equal(migrated.metadata.title, 'Old paper');
  assert.equal(migrated.fingerprint, 'fp-old');
  assert.deepEqual(migrated.ownedTags, v1Record.ownedTags);
  assert.deepEqual(migrated.workflow, S.workflowDefaults());
  assert.deepEqual(migrated.manual.additions, C.emptyKeywords());
});

test('an unanalysed v1 record becomes none, not legacy-partial', () => {
  const { data } = S.migrate({
    version: 1,
    records: { OLDKEY01: { ...v1Record, labels: null } },
  });
  assert.equal(data.records.OLDKEY01.analysis.status, 'none');
  assert(S.needsAnalysis(data.records.OLDKEY01));
});

test('a complete v2 record is left alone and is not marked for analysis', () => {
  const { data } = S.migrate({ version: 2, records: { ABCD1234: record } });
  assert(!S.needsAnalysis(data.records.ABCD1234));
  assert.deepEqual(data.records.ABCD1234.analysis.keywords.topic, keywords.topic);
  assert.equal(data.records.ABCD1234.workflow.importance, 'core');
});

test('metadata changes mark a record stale while keeping its analysis and workflow', () => {
  const changed = { ...record, fingerprint: 'fp2' };
  assert(S.needsAnalysis(changed));
  assert.deepEqual(changed.analysis.keywords.topic, keywords.topic);
  assert.deepEqual(C.workflow(changed).roles, ['discussion']);
  assert.equal(C.memorySentence(changed), C.memorySentence(record));
});

test('an unsupported index is rejected rather than silently replaced', () => {
  for (const bad of [null, [], {}, { version: 3, records: {} }, { version: 1 }])
    assert.throws(() => S.migrate(bad));
});

test('the persisted index is compact and never stores a derived search text', () => {
  const data = S.migrate({ version: 1, records: { OLDKEY01: v1Record } }).data;
  data.records.OLDKEY01.searchText = 'derived';
  const parsed = JSON.parse(S.serialize(data));
  assert.equal(parsed.version, 2);
  assert(!('searchText' in parsed.records.OLDKEY01));
});

const fakeIo = (files = {}) => ({
  files,
  async exists(p) {
    return p in this.files;
  },
  async readUTF8(p) {
    return this.files[p];
  },
  async writeUTF8(p, value) {
    this.files[p] = value;
  },
  async makeDirectory() {},
});

test('loading a v1 index writes a backup before anything else', async () => {
  const path = 'data/paper-lens/index.json',
    raw = JSON.stringify({ version: 1, records: { OLDKEY01: v1Record } }),
    io = fakeIo({ [path]: raw });
  const { data, migrated } = await S.load(path, io);
  assert(migrated);
  assert.equal(data.version, 2);
  assert.equal(io.files['data/paper-lens/index-v1-backup.json'], raw);
  assert.equal(io.files[path], raw, 'the v1 index is not rewritten by load');
});

test('an existing backup is never overwritten by a later load', async () => {
  const path = 'index.json',
    io = fakeIo({
      [path]: JSON.stringify({ version: 1, records: {} }),
      'index-v1-backup.json': 'original',
    });
  await S.load(path, io);
  assert.equal(io.files['index-v1-backup.json'], 'original');
});

test('a corrupt index throws instead of returning an empty database', async () => {
  const io = fakeIo({ 'index.json': '{not json' });
  await assert.rejects(() => S.load('index.json', io), /索引格式不支持/);
  assert.equal(io.files['index.json'], '{not json');
});

test('an unreadable index is copied aside before the user rebuilds the cache', async () => {
  const path = 'data/paper-lens/index.json',
    io = fakeIo({ [path]: '{not json' });
  await assert.rejects(() => S.load(path, io), /索引格式不支持/);
  await S.quarantine(path, io);
  assert.equal(io.files['data/paper-lens/index-corrupt-backup.json'], '{not json');
  assert.equal(io.files[path], '{not json', 'the unreadable file itself stays in place');
  // A later rebuild never overwrites the first rescue copy.
  io.files[path] = 'newer, still broken';
  await S.quarantine(path, io);
  assert.equal(io.files['data/paper-lens/index-corrupt-backup.json'], '{not json');
});

test('a missing index starts empty without a backup file', async () => {
  const io = fakeIo();
  const { data, migrated } = await S.load('index.json', io);
  assert(!migrated);
  assert.deepEqual(data, S.empty());
  assert.deepEqual(Object.keys(io.files), []);
});

test('saving writes through a temporary path and round-trips', async () => {
  const path = 'index.json',
    io = fakeIo();
  let tmp = null;
  io.writeUTF8 = async (p, value, options) => {
    tmp = options?.tmpPath;
    io.files[p] = value;
  };
  const { data } = S.migrate({ version: 1, records: { OLDKEY01: v1Record } });
  await S.save(path, data, io);
  assert.equal(tmp, 'index.json.tmp');
  const reloaded = S.migrate(JSON.parse(io.files[path]));
  assert.deepEqual(reloaded.data.records.OLDKEY01.workflow, S.workflowDefaults());
});
