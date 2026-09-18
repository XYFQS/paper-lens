(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.LensCore;
  const SCHEMA = 2;
  const BACKUP = 'index-v1-backup.json';
  const CORRUPT = 'index-corrupt-backup.json';

  function empty() {
    return { version: SCHEMA, records: {} };
  }
  function workflowDefaults() {
    return {
      readingStatus: 'unread',
      importance: 'normal',
      roles: [],
      memorySentenceOverride: null,
    };
  }
  function manualDefaults() {
    return { additions: C.emptyKeywords(), removals: C.emptyKeywords() };
  }
  function shapeKeywords(raw) {
    const out = C.emptyKeywords();
    if (!raw || typeof raw !== 'object') return out;
    for (const kind of C.categories) {
      if (!Array.isArray(raw[kind])) continue;
      try {
        out[kind] = C.unique(raw[kind]);
      } catch (_) {
        out[kind] = [];
      }
    }
    return out;
  }
  /**
   * v1 stored parallel Chinese and English arrays under labels.zh / labels.en.
   * Rebuild them as one paired list per category: region stays region, subject
   * becomes object, method stays method, and the three new categories start empty.
   */
  function legacyKeywords(labels) {
    const out = C.emptyKeywords();
    if (!labels || typeof labels !== 'object') return out;
    for (const [from, to] of Object.entries(C.legacyCategory)) {
      const zh = Array.isArray(labels.zh?.[from]) ? labels.zh[from] : [],
        en = Array.isArray(labels.en?.[from]) ? labels.en[from] : [],
        pairs = zh.map((z, i) => ({ zh: z, en: en[i] })).filter((p) => p.zh && p.en);
      if (pairs.length) out[to] = C.unique(pairs);
    }
    return out;
  }
  function fromV1(record) {
    const analyzed = Boolean(record.labels) && typeof record.labels === 'object',
      keywords = legacyKeywords(record.labels);
    return {
      id: record.id,
      key: record.key,
      metadata: record.metadata,
      fingerprint: record.fingerprint,
      analysis: {
        status: analyzed ? 'legacy-partial' : 'none',
        keywords,
        findings: [],
        aiModel: record.aiModel ?? null,
        aiAt: record.aiAt ?? null,
        sourceFingerprint: analyzed ? record.fingerprint : null,
      },
      workflow: workflowDefaults(),
      manual: manualDefaults(),
      ownedTags: Array.isArray(record.ownedTags) ? [...record.ownedTags] : [],
      updatedAt: record.updatedAt ?? new Date().toISOString(),
    };
  }
  // Repairing stored data is lenient: a duplicate or a stray entry is dropped,
  // never fatal. Only a fresh model response is held to the strict rules.
  const repair = (fn, fallback) => {
    try {
      return fn();
    } catch (_) {
      return fallback;
    }
  };
  const repairFindings = (raw) =>
    !Array.isArray(raw)
      ? []
      : repair(
          () => C.findingList(raw),
          repair(() => C.unique(raw.slice(0, 3), 300), []),
        );
  /** Fill in anything a record is missing without discarding what it already has. */
  function shape(record) {
    if (!record || typeof record !== 'object') return null;
    if (!record.analysis && !record.workflow && !record.manual) return fromV1(record);
    const analysis = record.analysis ?? {};
    return {
      id: record.id,
      key: record.key,
      metadata: record.metadata,
      fingerprint: record.fingerprint,
      analysis: {
        status: analysis.status ?? 'none',
        keywords: shapeKeywords(analysis.keywords),
        findings: repairFindings(analysis.findings),
        aiModel: analysis.aiModel ?? null,
        aiAt: analysis.aiAt ?? null,
        sourceFingerprint: analysis.sourceFingerprint ?? null,
      },
      workflow: C.workflow(record),
      manual: C.manualSet(record.manual),
      ownedTags: Array.isArray(record.ownedTags) ? [...record.ownedTags] : [],
      updatedAt: record.updatedAt ?? new Date().toISOString(),
    };
  }
  /** A record is up to date only when the AI saw the metadata the record carries now. */
  function needsAnalysis(record) {
    const analysis = record?.analysis;
    if (!analysis || analysis.status !== 'complete') return true;
    return analysis.sourceFingerprint !== record.fingerprint;
  }
  function migrate(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw Error('索引格式不支持');
    if (parsed.records === null || typeof parsed.records !== 'object')
      throw Error('索引格式不支持');
    if (parsed.version !== 1 && parsed.version !== SCHEMA) throw Error('索引格式不支持');
    const migrated = parsed.version === 1,
      records = {};
    for (const [key, record] of Object.entries(parsed.records)) {
      const shaped = shape(record);
      if (shaped) records[key] = shaped;
    }
    if (!migrated && Object.keys(records).length !== Object.keys(parsed.records).length)
      throw Error('索引格式不支持');
    return { data: { version: SCHEMA, records }, migrated };
  }
  // searchText is rebuilt at load time and must never be persisted.
  function serialize(data) {
    const records = {};
    for (const [key, record] of Object.entries(data.records ?? {})) {
      const { searchText, ...rest } = record;
      records[key] = rest;
    }
    return JSON.stringify({ version: SCHEMA, records });
  }
  const backupPath = (path, name = BACKUP) => String(path).replace(/[^\\/]+$/, name);
  /**
   * Read the index, upgrading a v1 file in memory. The v1 file on disk is copied
   * to a backup before anything is written, and a failure here throws before any
   * write, so an unreadable index is never replaced by an empty one.
   */
  async function load(path, io) {
    if (!(await io.exists(path))) return { data: empty(), migrated: false };
    const raw = await io.readUTF8(path);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      throw Error('索引格式不支持');
    }
    const result = migrate(parsed);
    if (result.migrated) await keep(path, io, BACKUP, raw);
    return result;
  }
  /** Copy the index aside under name, without ever overwriting an earlier copy. */
  async function keep(path, io, name, raw) {
    const target = backupPath(path, name);
    if (await io.exists(target)) return null;
    await io.writeUTF8(target, raw ?? (await io.readUTF8(path)));
    return target;
  }
  /**
   * Called when the index could not be read. Copying it aside means the user can
   * rebuild the cache without destroying whatever was in the old file.
   */
  const quarantine = (path, io) => keep(path, io, CORRUPT);
  async function save(path, data, io) {
    await io.makeDirectory(path.replace(/[^\\/]+$/, '').replace(/[\\/]$/, ''));
    // IOUtils writes to tmpPath and renames, so a crash never truncates the index.
    await io.writeUTF8(path, serialize(data), { tmpPath: path + '.tmp' });
  }
  const api = {
    SCHEMA,
    BACKUP,
    CORRUPT,
    empty,
    workflowDefaults,
    manualDefaults,
    shapeKeywords,
    legacyKeywords,
    shape,
    needsAnalysis,
    migrate,
    serialize,
    backupPath,
    quarantine,
    load,
    save,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.LensStore = api;
})(this);
