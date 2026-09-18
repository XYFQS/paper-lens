(function (root) {
  'use strict';
  const Z = root.Zotero,
    C = root.LensCore,
    S = root.LensStore,
    PREFIX = 'extensions.zotero.paperLens.';
  // Only the file system is injected into the store, so migration and serialisation
  // stay testable in Node without Zotero.
  const io = {
    exists: (path) => root.IOUtils.exists(path),
    readUTF8: (path) => root.IOUtils.readUTF8(path),
    writeUTF8: (path, text, options) => root.IOUtils.writeUTF8(path, text, options),
    makeDirectory: (path) => root.IOUtils.makeDirectory(path, { ignoreExisting: true }),
  };
  class App {
    constructor(uri) {
      this.uri = uri;
      this.views = new Map();
      this.data = S.empty();
      this.busy = false;
      this.stopped = false;
      this.migrated = false;
      this.message = '';
      this.pending = false;
      this.timer = null;
      this.path = root.PathUtils.join(Z.DataDirectory.dir, 'paper-lens', 'index.json');
    }
    get(k, d) {
      return Z.Prefs.get(PREFIX + k, true) ?? d;
    }
    set(k, v) {
      Z.Prefs.set(PREFIX + k, v, true);
    }
    status(text) {
      this.message = text;
      for (const v of this.views.values()) v.render();
    }
    secret(value) {
      const sdr = root.Components.classes['@mozilla.org/security/sdr;1'].getService(
        root.Components.interfaces.nsISecretDecoderRing,
      );
      if (value !== undefined) {
        this.set('secret', value ? sdr.encryptString(value) : '');
        return;
      }
      const encrypted = this.get('secret', '');
      return encrypted ? sdr.decryptString(encrypted) : '';
    }
    async save() {
      await S.save(this.path, this.data, io);
    }
    /**
     * Read the index and upgrade a v1 file. Nothing is assigned until the read has
     * succeeded, so a corrupt file leaves the in-memory index exactly as it was.
     */
    async loadIndex() {
      const { data, migrated } = await S.load(this.path, io);
      this.data = data;
      this.migrated = migrated;
      for (const r of Object.values(this.data.records)) r.searchText = C.textIndex(r);
      return { migrated };
    }
    async start() {
      await Z.Libraries.get(Z.Libraries.userLibraryID).waitForDataLoad('item');
      try {
        await this.loadIndex();
      } catch (e) {
        this.cacheError = true;
        // Keep a copy of whatever was there so rebuilding the cache cannot destroy it.
        try {
          await S.quarantine(this.path, io);
        } catch (_) {}
        this.status('缓存无法读取，点击“重建缓存”重新生成。');
      }
      for (const win of Z.getMainWindows()) this.attach(win);
      this.observer = Z.Notifier.registerObserver(
        {
          notify: () => {
            if (this.busy || this.get('auto', false)) {
              this.pending = true;
              this.schedule();
            } else this.status('文库已变化。到“文库”点击“读取 / 更新文献”，即可更新本地信息。');
          },
        },
        ['item', 'collection', 'collection-item'],
        'paper-lens',
      );
      if (this.get('auto', false)) {
        this.pending = true;
        this.schedule();
      }
      // A library upgraded from an older version still carries Chinese/English tag
      // names. Rewrite them once, and only ever the tags this plugin owns.
      if (this.get('native', false) && this.staleTags()) {
        await this.run(async () => {
          await this.syncTags();
          this.status('原生标签已更新为英文规范标签。');
        });
      }
    }
    attach(win) {
      if (this.views.has(win) || !win.document.getElementById('zotero-context-pane')) return;
      const v = new root.LensView(this, win);
      this.views.set(win, v);
      v.mount();
    }
    detach(win) {
      this.views.get(win)?.destroy();
      this.views.delete(win);
    }
    stop() {
      this.stopped = true;
      this.cancel();
      root.clearTimeout(this.timer);
      if (this.observer) Z.Notifier.unregisterObserver(this.observer);
      for (const w of [...this.views.keys()]) this.detach(w);
    }
    schedule() {
      root.clearTimeout(this.timer);
      if (this.stopped || !this.get('auto', false)) return;
      this.timer = root.setTimeout(() => {
        if (this.busy) return;
        this.pending = false;
        this.run(() => this.update());
      }, 1200);
    }
    async run(fn) {
      if (this.busy) return;
      this.busy = true;
      this.status(this.message);
      try {
        await fn();
      } catch (e) {
        this.status(e.message || '操作失败');
      } finally {
        this.busy = false;
        this.token = null;
        this.status(this.message);
        if (this.pending) this.schedule();
      }
    }
    cancel() {
      if (this.token) {
        this.token.cancelled = true;
        this.token.abort?.();
        this.status('正在取消；已完成的关键词保留。');
      }
    }
    async scope(options = {}) {
      const lib = Z.Libraries.userLibraryID;
      await Z.Libraries.get(lib).waitForDataLoad('item');
      let items;
      if (options.collection) {
        const c = Z.Collections.get(Number(options.collection));
        if (!c || c.deleted || c.libraryID !== lib) throw Error('请选择个人文库中有效的分类。');
        const cols = [c, ...(options.recursive ? Z.Collections.getByParent(c.id, true) : [])];
        items = cols.flatMap((c) => c.getChildItems(false) || []);
      } else items = await Z.Items.getAll(lib, true, false);
      return [
        ...new Map(
          items
            .filter((i) => !i.deleted && i.libraryID === lib && i.isRegularItem())
            .map((i) => [i.key, i]),
        ).values(),
      ];
    }
    async read(item) {
      await item.loadAllData();
      const old = this.data.records[item.key];
      return C.metadata(item.toJSON(), old?.ownedTags ?? []);
    }
    async update(options = {}, force = false) {
      if (this.cacheError && !force) throw Error('请先点击“重建缓存”。');
      this.status('正在读取元数据…');
      const items = await this.scope(options);
      let changed = 0;
      for (const item of items) {
        const metadata = await this.read(item),
          fingerprint = JSON.stringify(metadata),
          fullMetadata = { ...metadata, key: item.key, dateModified: item.dateModified },
          old = this.data.records[item.key];
        if (!old) {
          const record = S.shape({
            id: item.id,
            key: item.key,
            metadata: fullMetadata,
            fingerprint,
          });
          record.searchText = C.textIndex(record);
          this.data.records[item.key] = record;
          changed++;
          continue;
        }
        // Changed metadata keeps the existing profile, the user's workflow fields and
        // the ownership receipts. Only the fingerprint moves, which marks the profile
        // stale so the next AI run refreshes it instead of discarding it now.
        if (old.fingerprint !== fingerprint) changed++;
        old.id = item.id;
        old.metadata = fullMetadata;
        old.fingerprint = fingerprint;
        old.searchText = C.textIndex(old);
      }
      const alive = new Set(
        (await Z.Items.getAll(Z.Libraries.userLibraryID, true, false))
          .filter((i) => i.isRegularItem())
          .map((i) => i.key),
      );
      for (const key of Object.keys(this.data.records))
        if (!alive.has(key)) delete this.data.records[key];
      this.cacheError = false;
      await this.save();
      if (this.get('native', false)) await this.syncTags();
      this.status(
        `元数据已更新：范围内 ${items.length} 篇，新增或变化 ${changed} 篇。缓存共 ${Object.keys(this.data.records).length} 篇。`,
      );
      return items;
    }
    async request(records, token, correction) {
      const endpoint = C.endpoint(this.get('url', 'https://api.deepseek.com')),
        key = this.secret(),
        model = this.get('model', 'deepseek-v4-flash');
      if (!key) throw Error('请先保存 API Key。');
      const body = {
        model,
        stream: false,
        max_tokens: 8000,
        messages: [
          { role: 'system', content: C.prompt },
          {
            role: 'user',
            // aiInput allowlists bibliographic fields. Attachments, note bodies and
            // local paths are never sent.
            content: JSON.stringify({
              items: records.map((r) => C.aiInput(r)),
              ...(correction ? { correction } : {}),
            }),
          },
        ],
      };
      if (new root.URL(endpoint).hostname === 'api.deepseek.com')
        body.thinking = { type: 'disabled' };
      for (let retry = 0; retry < 3; retry++) {
        if (token.cancelled || this.stopped) throw Error('已取消。');
        let response;
        try {
          response = await Z.HTTP.request('POST', endpoint, {
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
            timeout: 180000,
            successCodes: false,
            followRedirects: false,
            logBodyLength: 0,
            requestObserver: (xhr) => {
              token.abort = () => xhr.abort();
            },
          });
        } catch (_) {
          throw Error(token.cancelled ? '已取消。' : 'API 连接失败或超时。');
        }
        token.abort = null;
        if (token.cancelled || this.stopped) throw Error('已取消。');
        if ([429, 500, 502, 503, 504].includes(response.status) && retry < 2) {
          await Z.Promise.delay(1000 * (retry + 1));
          continue;
        }
        if (response.status < 200 || response.status >= 300)
          throw Error(`API HTTP ${response.status}；请检查密钥、地址、模型及余额。`);
        let payload;
        try {
          payload = JSON.parse(response.responseText);
        } catch (_) {
          throw Error('API 响应不是 JSON。');
        }
        const choice = payload.choices?.[0];
        if (!choice || (choice.finish_reason && choice.finish_reason !== 'stop'))
          throw Error('模型回复被截断或拒绝，请更换模型或重试。');
        return choice.message?.content;
      }
    }
    async analyze(options = {}, force = false) {
      if (!this.secret()) throw Error('请先保存 API Key。');
      const items = await this.update(options),
        todo = items
          .map((i) => this.data.records[i.key])
          .filter((r) => r && (force || S.needsAnalysis(r)));
      const token = { cancelled: false };
      this.token = token;
      let done = 0;
      for (let offset = 0; offset < todo.length; ) {
        const batch = [];
        let size = 0;
        while (offset < todo.length && batch.length < 5) {
          const r = todo[offset],
            length = JSON.stringify(r.metadata).length;
          if (batch.length && size + length > 45000) break;
          if (length > 90000)
            throw Error(`条目“${r.metadata.title ?? r.key}”元数据过长，请检查异常字段。`);
          batch.push(r);
          size += length;
          offset++;
        }
        this.status(`AI 研究画像：${done}/${todo.length} 篇 · 每批最多 5 篇`);
        let result, correction;
        for (let attempt = 0; attempt < 3; attempt++) {
          const raw = await this.request(batch, token, correction);
          try {
            result = C.validate(C.parse(raw), batch);
            break;
          } catch (e) {
            if (attempt === 2)
              throw Error(
                `本批结果两次纠正后仍无效：${e.message} 已完成 ${done} 篇，可再次生成以继续。`,
              );
            correction = e.message;
            this.status(`正在纠正模型格式（${attempt + 1}/2）…`);
          }
        }
        if (token.cancelled) throw Error('已取消。');
        let stale = 0;
        for (const entry of result) {
          const r = this.data.records[entry.key],
            item = await Z.Items.getByLibraryAndKeyAsync(Z.Libraries.userLibraryID, entry.key);
          if (!item || item.deleted || JSON.stringify(await this.read(item)) !== r.fingerprint) {
            stale++;
            continue;
          }
          // Replace the machine profile only. workflow and manual are the user's and
          // are never written here.
          r.analysis = {
            status: 'complete',
            keywords: entry.keywords,
            findings: entry.findings,
            aiModel: this.get('model', 'deepseek-v4-flash'),
            aiAt: new Date().toISOString(),
            sourceFingerprint: r.fingerprint,
          };
          r.searchText = C.textIndex(r);
          done++;
        }
        await this.save();
        if (this.get('native', false)) await this.syncTags();
        if (stale) throw Error('分析期间部分条目已变化；已跳过变化条目，请更新后继续生成。');
      }
      this.status(`已完成 ${done} 篇研究画像；已是最新的条目已跳过。`);
    }
    record(key) {
      return this.data.records[key] ?? null;
    }
    stale(key) {
      const record = this.data.records[key];
      return record ? S.needsAnalysis(record) : false;
    }
    stats() {
      const records = Object.values(this.data.records);
      return {
        total: records.length,
        analyzed: records.filter((r) => r.analysis?.status === 'complete').length,
        legacy: records.filter((r) => r.analysis?.status === 'legacy-partial').length,
        stale: records.filter((r) => r.analysis && S.needsAnalysis(r)).length,
      };
    }
    /** Every write the UI makes goes through here, so the index is never touched directly. */
    async edit(key, mutate) {
      const record = this.data.records[key];
      if (!record) throw Error('该条目尚未建立本地索引。');
      mutate(record);
      record.updatedAt = new Date().toISOString();
      record.searchText = C.textIndex(record);
      await this.save();
      if (this.get('native', false)) await this.syncTags();
      this.status('已保存。');
      return record;
    }
    setWorkflow(key, patch) {
      return this.edit(key, (r) => {
        r.workflow = C.workflow({ workflow: { ...r.workflow, ...patch } });
      });
    }
    /** An empty text restores the automatic sentence instead of storing a blank one. */
    setMemorySentence(key, text) {
      return this.edit(key, (r) => {
        r.workflow = {
          ...C.workflow(r),
          memorySentenceOverride: String(text ?? '').trim() || null,
        };
      });
    }
    correctKeyword(key, kind, change) {
      return this.edit(key, (r) => {
        r.manual = C.correct(r.manual, kind, change);
      });
    }
    resetKeywordCorrections(key, kind) {
      return this.edit(key, (r) => {
        r.manual = C.resetCorrections(r.manual, kind);
      });
    }
    staleTags() {
      return Object.values(this.data.records).some((r) => {
        const wanted = C.tagNames(r);
        return (r.ownedTags ?? []).some((t) => !wanted.includes(t));
      });
    }
    /**
     * One canonical English tag per keyword, e.g. R::China. Both the old Chinese and
     * English names and the older PaperLens/ scheme are removed here, but only for
     * tags this plugin recorded as its own: a tag the user created by hand is never
     * touched, even when its name matches.
     */
    async syncTags(remove = false) {
      for (const r of Object.values(this.data.records)) {
        const item = await Z.Items.getByLibraryAndKeyAsync(Z.Libraries.userLibraryID, r.key);
        if (!item || item.deleted) continue;
        await item.loadAllData();
        const wanted = remove ? [] : C.tagNames(r),
          existing = new Set(item.getTags().map((t) => t.tag)),
          old = r.ownedTags ?? [];
        const added = wanted.filter((t) => !existing.has(t)),
          deleted = old.filter((t) => !wanted.includes(t) && existing.has(t));
        if (!added.length && !deleted.length) continue;
        // Write ownership first. A crash before item.save can then be retried without losing ownership.
        r.ownedTags = [...new Set([...old, ...added])];
        await this.save();
        for (const t of deleted) item.removeTag(t);
        for (const t of added) item.addTag(t, 1);
        await item.saveTx();
        r.ownedTags = r.ownedTags.filter((t) => wanted.includes(t));
        await this.save();
      }
    }
    async search(options, query, rules, mode, window) {
      if (this.cacheError) throw Error('缓存无法读取，请重建缓存。');
      const items = await this.scope(options),
        available = items.map((i) => this.data.records[i.key]).filter(Boolean);
      const matches = available.filter((r) => C.matches(r, query, rules, mode));
      if (!available.length && items.length)
        throw Error('此范围尚未建立元数据索引，请先更新元数据。');
      const lib = Z.Libraries.userLibraryID;
      const search = new Z.Search();
      search.libraryID = lib;
      search.name = '文献透镜 · 当前搜索结果';
      if (matches.length) {
        search.addCondition('joinMode', 'any');
        for (const r of matches) search.addCondition('key', 'is', r.key);
      } else {
        search.addCondition('key', 'is', 'ZZZZZZZZ');
        search.addCondition('key', 'isNot', 'ZZZZZZZZ');
      }
      window.Zotero_Tabs.select('zotero-pane');
      const pane = window.ZoteroPane;
      pane.document?.getElementById('zotero-tb-search')?.setAttribute('value', '');
      const quick = window.document.getElementById('zotero-tb-search');
      if (quick) quick.value = '';
      pane.tagSelector?.clearTagSelection();
      await pane.collectionsView.selectLibrary(lib);
      // Internal key conditions are supported in memory but deliberately excluded from saved searches.
      const row = new Z.CollectionTreeRow(pane.collectionsView, 'search', search);
      this.searchSerial = (this.searchSerial || 0) + 1;
      Object.defineProperty(row, 'id', { value: 'paper-lens-' + this.searchSerial });
      Z.CollectionTreeCache.clear();
      await pane.itemsView.changeCollectionTreeRow(row);
      this.status(
        `找到 ${matches.length} 篇，已显示在 Zotero 主列表。${items.length > available.length ? ` ${items.length - available.length} 篇尚未索引。` : ''}`,
      );
      return matches;
    }
  }
  root.PaperLensApp = App;
})(this);
