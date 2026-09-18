var runNative = async function () {
  if (PathUtils.normalize(Zotero.DataDirectory.dir) !== PathUtils.normalize(expected))
    throw Error('Refuse non-test library');
  const checks = [],
    assert = (x, m) => {
      if (!x) throw Error(m);
      checks.push(m);
    };
  // The pure modules are loaded from the repository so the native run and the Node
  // suite exercise exactly the same logic.
  const pure = {};
  for (const file of ['core', 'store'])
    Services.scriptloader.loadSubScript(`${lensBase}addon/content/${file}.js`, pure, 'UTF-8');
  const C = pure.LensCore,
    S = pure.LensStore,
    Z = Zotero,
    app = Z.PaperLens,
    lib = Z.Libraries.userLibraryID,
    keywordOf = (key, kind) => C.effective(app.data.records[key])[kind];
  const a = new Z.Collection();
  a.libraryID = lib;
  a.name = 'Parent';
  await a.saveTx();
  const b = new Z.Collection();
  b.libraryID = lib;
  b.parentID = a.id;
  b.name = 'Child';
  await b.saveTx();
  const items = [];
  for (let i = 0; i < 6; i++) {
    const conference = i % 2 === 1,
      item = new Z.Item(conference ? 'conferencePaper' : 'journalArticle');
    item.libraryID = lib;
    item.setField('title', 'Vegetation study ' + i);
    item.setField('abstractNote', 'Satellite measurements of vegetation in China.');
    item.setField('extra', 'Arbitrary metadata');
    item.setField('date', '2024-01-01');
    // The venue lives in a different field per item type, and Zotero rejects a field
    // that is not valid for the type.
    item.setField(conference ? 'proceedingsTitle' : 'publicationTitle', 'Test Journal');
    item.setCreators([{ firstName: 'Ming', lastName: 'Li', creatorType: 'author' }]);
    item.addTag('human-tag');
    item.addToCollection(i < 3 ? a.id : b.id);
    await item.saveTx();
    items.push(item);
  }
  await app.update({ collection: a.id });
  assert(
    Object.keys(app.data.records).length === 3,
    'index selected collection without descendants',
  );
  await app.update({ collection: a.id, recursive: true });
  assert(Object.keys(app.data.records).length === 6, 'recursive index includes children');
  assert(
    app.data.records[items[0].key].metadata.extra === 'Arbitrary metadata',
    'extra and creators cached',
  );
  assert(
    app.data.version === 2 && app.data.records[items[0].key].analysis.status === 'none',
    'a fresh index is written in the version 2 shape',
  );
  assert(
    !('labels' in app.data.records[items[0].key]) &&
      typeof app.data.records[items[0].key].workflow === 'object' &&
      typeof app.data.records[items[0].key].manual === 'object',
    'analysis, workflow and manual are separated per record',
  );
  assert(
    Object.values(app.data.records).every(
      (r) => C.year(r.metadata) === '2024' && C.journal(r.metadata) === 'Test Journal',
    ),
    'year and venue are cached for every item type, so conditions can match them',
  );
  assert(await IOUtils.exists(app.path), 'metadata persisted to local disk');
  assert(!app.get('onboardingComplete', false), 'guide stays available before profile preparation');
  app.secret('synthetic-key');
  app.set('url', 'http://127.0.0.1:18767/repair');
  app.set('model', 'synthetic');
  await app.analyze();
  const first = app.data.records[items[0].key];
  assert(
    Object.values(app.data.records).every(
      (r) =>
        r.analysis.status === 'complete' &&
        r.analysis.keywords.region[0]?.en === 'China' &&
        r.analysis.keywords.region[0]?.zh === '中国' &&
        r.analysis.keywords.topic[0]?.en === 'Vegetation resilience' &&
        r.analysis.keywords.object[0]?.en === 'Vegetation' &&
        r.analysis.keywords.method[0]?.en === 'Remote sensing' &&
        r.analysis.keywords.dataset[0]?.en === 'MODIS' &&
        r.analysis.keywords.variable[0]?.en === 'NDVI',
    ),
    'six paired keyword categories stored with invalid-key correction',
  );
  assert(
    Object.values(app.data.records).every(
      (r) =>
        r.analysis.findings.length === 1 &&
        r.analysis.findings[0].zh &&
        r.analysis.sourceFingerprint === r.fingerprint,
    ),
    'findings stored and the analysed revision recorded',
  );
  assert(
    Object.keys(first.analysis.keywords).length === 6 &&
      C.categories.every((k) => Array.isArray(first.analysis.keywords[k])),
    'the profile carries exactly the six categories',
  );
  assert(!('summary' in first), 'no summary stored');
  assert(!app.stale(items[0].key), 'a freshly analysed record is not stale');
  assert(
    C.workflow(first).readingStatus === 'unread' &&
      C.workflow(first).importance === 'normal' &&
      C.workflow(first).roles.length === 0 &&
      C.workflow(first).memorySentenceOverride === null,
    'the AI never sets reading status, importance, roles or the memory sentence',
  );
  assert(
    C.categories.every(
      (k) => first.manual.additions[k].length === 0 && first.manual.removals[k].length === 0,
    ),
    'the AI never writes a manual correction',
  );
  // Read the request the mock actually received, so the allowlist is checked on the wire.
  const sent = await Z.HTTP.request('GET', 'http://127.0.0.1:18767/last', { successCodes: false }),
    payload = JSON.parse(sent.responseText);
  assert(
    payload.items.length > 0 &&
      payload.items.every((i) =>
        Object.keys(i).every((k) =>
          [
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
          ].includes(k),
        ),
      ),
    'only allowlisted bibliographic fields are sent to the API',
  );
  assert(
    payload.items.every(
      (i) =>
        !('path' in i) &&
        !('note' in i) &&
        !('collections' in i) &&
        !('dateModified' in i) &&
        !('version' in i),
    ),
    'attachments, note bodies, collections and local paths never leave the plugin',
  );
  assert(
    items.every((i) => i.getTags().length === 1),
    'plugin-only mode leaves original tags untouched',
  );
  const persisted = JSON.parse(await IOUtils.readUTF8(app.path));
  assert(
    persisted.version === 2 && !('searchText' in persisted.records[items[0].key]),
    'the persisted index is version 2 and never stores derived search text',
  );
  assert(
    !('labels' in persisted.records[items[0].key]),
    'the version 1 labels field is gone after analysis',
  );
  // A duplicate term is a malformed answer: it must be rejected and corrected, not deduped away.
  app.set('url', 'http://127.0.0.1:18767/dupe');
  await app.analyze({}, true);
  assert(
    app.data.records[items[0].key].analysis.keywords.topic.length === 1,
    'a duplicated keyword is sent back for correction instead of silently merged',
  );
  app.set('url', 'http://127.0.0.1:18767/repair');
  // Manual keyword correction: the delta is stored, the AI result is left alone.
  const key0 = items[0].key,
    regionPair = app.data.records[key0].analysis.keywords.region[0];
  await app.correctKeyword(key0, 'region', { remove: regionPair });
  assert(
    keywordOf(key0, 'region').length === 0 &&
      app.data.records[key0].analysis.keywords.region.length === 1,
    'a rejected AI keyword stops being effective while the AI result is preserved',
  );
  assert(
    !C.autoMemorySentence(app.data.records[key0]).includes('China'),
    'the automatic memory sentence follows the corrected keywords',
  );
  await app.correctKeyword(key0, 'region', { add: { zh: '黄土高原', en: 'Loess Plateau' } });
  assert(
    keywordOf(key0, 'region')
      .map((p) => p.en)
      .join() === 'Loess Plateau',
    'a hand-added keyword becomes effective',
  );
  await app.analyze({}, true);
  assert(
    keywordOf(key0, 'region')
      .map((p) => p.en)
      .join() === 'Loess Plateau',
    'a manual correction survives a full AI re-run',
  );
  await app.resetKeywordCorrections(key0, 'region');
  assert(
    keywordOf(key0, 'region')
      .map((p) => p.en)
      .join() === 'China',
    'restoring a category brings the AI keywords back',
  );
  // Workflow fields are the user's alone.
  await app.setWorkflow(key0, {
    readingStatus: 'mastered',
    importance: 'core',
    roles: ['discussion', 'data'],
  });
  assert(
    C.workflow(app.data.records[key0]).readingStatus === 'mastered' &&
      C.workflow(app.data.records[key0]).importance === 'core' &&
      C.workflow(app.data.records[key0]).roles.join() === 'discussion,data',
    'reading status, importance and roles are stored per record',
  );
  await app.setWorkflow(key0, { readingStatus: 'bogus', importance: 'bogus', roles: ['nope'] });
  assert(
    C.workflow(app.data.records[key0]).readingStatus === 'unread' &&
      C.workflow(app.data.records[key0]).importance === 'normal' &&
      C.workflow(app.data.records[key0]).roles.length === 0,
    'an unknown workflow value falls back to a safe default',
  );
  await app.setWorkflow(key0, {
    readingStatus: 'mastered',
    importance: 'core',
    roles: ['discussion', 'data'],
  });
  // Memory sentence.
  const automatic =
    'Li 2024 | Test Journal | China | Remote sensing | Vegetation changed in the study area';
  assert(
    C.memorySentence(app.data.records[key0]) === automatic,
    'the memory sentence is assembled from metadata, region, method and the first finding',
  );
  await app.setMemorySentence(key0, '我的记忆句');
  assert(C.memorySentence(app.data.records[key0]) === '我的记忆句', 'a user memory sentence wins');
  let win;
  for (let i = 0; i < 80; i++) {
    win = Z.getMainWindow();
    if (win?.ZoteroPane?.collectionsView) break;
    await Z.Promise.delay(200);
  }
  let matches = await app.search({}, '我的记忆句', [], 'all', win);
  assert(matches.length === 1, 'a custom memory sentence is searchable');
  await app.setMemorySentence(key0, '');
  assert(
    C.memorySentence(app.data.records[key0]) === automatic,
    'an empty sentence restores the automatic one',
  );
  // Conditions for every dimension.
  for (const [field, value, count] of [
    ['topic', '植被恢复力', 6],
    ['region', '中国', 6],
    ['object', 'Vegetation', 6],
    ['method', 'remote sensing', 6],
    ['dataset', 'MODIS', 6],
    ['variable', 'ndvi', 6],
    ['year', '2024', 6],
    ['journal', 'Test Journal', 6],
    ['readingStatus', 'mastered', 1],
    ['importance', 'core', 1],
    ['role', 'discussion', 1],
    ['role', 'review', 0],
  ]) {
    matches = await app.search({}, '', [{ field, op: 'has', value }], 'all', win);
    assert(
      matches.length === count,
      `condition search on ${field} = ${value} matches ${count}, got ${matches.length}`,
    );
  }
  matches = await app.search(
    {},
    'Ming',
    [
      { field: 'itemType', op: 'has', value: 'journalArticle' },
      { field: 'region', op: 'has', value: '中国' },
    ],
    'all',
    win,
  );
  assert(matches.length === 3, 'combined native item type and bilingual keyword search');
  assert(
    win.ZoteroPane.itemsView.getSortedItems(true).length === 3,
    'matching records displayed in native main list',
  );
  matches = await app.search({ collection: a.id }, '', [], 'all', win);
  assert(matches.length === 3, 'search collection scope excludes children by default');
  matches = await app.search({ collection: a.id, recursive: true }, '', [], 'all', win);
  assert(matches.length === 6, 'search recursive scope includes children');
  matches = await app.search({}, 'no-such-token', [], 'all', win);
  assert(
    !matches.length && win.ZoteroPane.itemsView.getSortedItems(true).length === 0,
    'zero matches clears native list',
  );
  // Native tags: one canonical English name per keyword, and only ever our own tags.
  const preexisting = 'R::China';
  items[0].addTag(preexisting);
  await items[0].saveTx();
  const legacy = 'PaperLens/研究区域: 中国';
  items[1].addTag(legacy);
  await items[1].saveTx();
  app.data.records[items[1].key].ownedTags = [legacy];
  items[2].addTag(legacy);
  await items[2].saveTx();
  app.set('native', true);
  assert(app.staleTags(), 'a version 1 tag name is detected as stale');
  await app.syncTags();
  const tagNames = items[1].getTags().map((t) => t.tag);
  for (const name of [
    'T::Vegetation resilience',
    'R::China',
    'O::Vegetation',
    'M::Remote sensing',
    'D::MODIS',
    'V::NDVI',
  ])
    assert(tagNames.includes(name), `native canonical tag written: ${name}`);
  assert(!tagNames.includes(legacy), 'owned version 1 tag replaced, not left behind');
  // A tag is Chinese if it contains a CJK codepoint. Compared numerically so the
  // check cannot be fooled by the file's own encoding.
  const hasCJK = (text) =>
    [...text].some((c) => c.codePointAt(0) > 0x2e80 && c.codePointAt(0) < 0xa000);
  assert(
    tagNames.filter((t) => /^[TROMDV]::/.test(t)).length === 6,
    'every native tag uses one canonical category prefix',
  );
  assert(!tagNames.some(hasCJK), 'no Chinese tag name is written');
  assert(
    items[1].getTags().find((t) => t.tag === 'D::MODIS').type === 1,
    'plugin tags are written as automatic tags',
  );
  assert(
    items[2].getTags().some((t) => t.tag === legacy),
    'unowned legacy-looking manual tag retained',
  );
  assert(
    items[0].getTags().filter((t) => t.tag === preexisting).length === 1 &&
      !app.data.records[items[0].key].ownedTags.includes(preexisting),
    'a preexisting identical user tag is adopted, not duplicated or claimed',
  );
  assert(!app.staleTags(), 'no stale tag names remain after syncing');
  app.set('native', false);
  await app.syncTags(true);
  assert(
    items[0].getTags().some((t) => t.tag === preexisting),
    'preexisting identical native tag retained',
  );
  assert(
    items[1].getTags().length === 1 && items[1].getTags()[0].tag === 'human-tag',
    'owned tags removed; human tags retained',
  );
  // Detaching and attaching again rebuilds the whole panel, including the observers,
  // so the sidebar must come back with its own landing page.
  app.detach(win);
  assert(
    !win.document.getElementById('paper-lens-sidebar'),
    'detaching removes the sidebar from the window',
  );
  app.attach(win);
  assert(!!win.document.getElementById('paper-lens-sidebar'), 'new sidebar mounted');
  const view = app.views.get(win);
  assert(view.page === 'search', 'a library that already has records opens on the search page');
  assert(
    view.guide.hidden && app.get('onboardingComplete', false),
    'completed preparation permanently dismisses green guide',
  );
  assert(
    view.readiness.dataset.state === 'ready' && view.readinessText.textContent === '已就绪',
    'ready library has green header indicator',
  );
  app.secret('');
  view.renderWorkspace();
  assert(
    view.readiness.dataset.state === 'disconnected' && view.guide.hidden,
    'missing API shows red indicator without restoring guide',
  );
  app.secret('synthetic-key');
  const savedStatus = app.data.records[items[1].key].analysis.status;
  app.data.records[items[1].key].analysis.status = 'none';
  view.renderWorkspace();
  assert(
    view.readiness.dataset.state === 'pending' && view.guide.hidden,
    'missing profiles show yellow indicator without restoring guide',
  );
  app.data.records[items[1].key].analysis.status = 'legacy-partial';
  view.renderWorkspace();
  assert(
    view.readinessText.textContent === '待生成' &&
      view.overview.textContent.includes('旧版关键词 1 篇'),
    'a migrated profile keeps the library pending and is reported as a legacy count',
  );
  app.data.records[items[1].key].analysis.status = savedStatus;
  const savedFingerprint = app.data.records[items[1].key].fingerprint;
  app.data.records[items[1].key].fingerprint = 'changed-outside';
  view.renderWorkspace();
  assert(
    view.readinessText.textContent === '待更新' &&
      view.readiness.dataset.state === 'pending' &&
      view.guide.hidden,
    'a stale profile asks for a refresh without restoring the guide',
  );
  app.data.records[items[1].key].fingerprint = savedFingerprint;
  view.renderWorkspace();
  view.selectPage('library');
  assert(
    view.page === 'library' &&
      view.pages.library.contains(view.indexSection) &&
      view.pages.library.contains(view.aiSection),
    'indexing and profile generation live on the library page',
  );
  assert(
    view.pages.settings.contains(view.apiSection) && view.pages.search.contains(view.finder),
    'settings and search keep their own pages',
  );
  view.readiness.click();
  assert(view.page === 'search', 'ready header indicator opens search');
  assert(!view.filterPanel.hidden, 'condition controls are visible immediately');
  view.collections();
  view.scopeSelect.value = String(a.id);
  view.selectPage('search');
  assert(
    view.scope().collection === String(a.id),
    'selected scope is shared across workspace pages',
  );
  view.scopeSelect.value = '';
  assert(
    !view.finder.querySelector('.pl-filter-toggle'),
    'filters have no expand or collapse button',
  );
  assert(
    view.rows.length === 0 && view.rules.children.length === 0 && view.removeCondition.disabled,
    'empty filters have no default condition and disable removal',
  );
  const click = async (button) => {
    view.render();
    button.click();
    while (app.busy) await Z.Promise.delay(10);
    view.render();
  };
  await click(view.removeCondition);
  assert(
    view.rows.length === 0 && view.ruleValues().length === 0 && view.removeCondition.disabled,
    'render and disabled removal keep empty search unconstrained',
  );
  await click(view.addCondition);
  assert(
    view.rows.length === 1 && view.mode.parentElement.hidden && !view.removeCondition.disabled,
    'explicit add creates one condition and hides unnecessary relationship selector',
  );
  const firstRule = view.rows[0],
    ruleSelects = [...firstRule.box.querySelectorAll('select')];
  assert(
    [...ruleSelects[0].options].map((o) => o.value).join() ===
      'itemType,topic,region,object,method,dataset,variable,year,journal,readingStatus,importance,role',
    'the condition field offers every keyword dimension',
  );
  ruleSelects[0].value = 'readingStatus';
  ruleSelects[0].onchange();
  assert(
    [...firstRule.box.querySelectorAll('select')[2].options].map((o) => o.value).join() ===
      'unread,skimmed,read,mastered',
    'the reading status condition offers the four fixed states',
  );
  ruleSelects[0].value = 'importance';
  ruleSelects[0].onchange();
  assert(
    [...firstRule.box.querySelectorAll('select')[2].options].map((o) => o.value).join() ===
      'normal,important,core',
    'the importance condition offers the three fixed levels',
  );
  ruleSelects[0].value = 'role';
  ruleSelects[0].onchange();
  assert(
    [...firstRule.box.querySelectorAll('select')[2].options].map((o) => o.value).join() ===
      'introduction,methods,results,discussion,data,studyArea,review',
    'the role condition offers the fixed role list',
  );
  ruleSelects[0].value = 'region';
  ruleSelects[0].onchange();
  await click(view.addCondition);
  assert(
    view.rows.length === 2 && !view.mode.parentElement.hidden,
    'relationship selector appears for multiple conditions',
  );
  await click(view.removeCondition);
  assert(
    view.rows.length === 1 && view.rows[0] === firstRule,
    'remove deletes the last added condition',
  );
  await click(view.removeCondition);
  assert(
    view.rows.length === 0 && view.removeCondition.disabled && view.mode.parentElement.hidden,
    'removing all conditions restores empty add state',
  );
  await click(view.addCondition);
  assert(view.navigation.entries.length === 2, 'toggle available in both library and reader rails');
  const nav = view.navigation.entries[0].button;
  nav.click();
  assert(
    view.panel.hidden && nav.getAttribute('aria-pressed') === 'false',
    'native rail button hides sidebar',
  );
  nav.click();
  assert(
    !view.panel.hidden && nav.getAttribute('aria-pressed') === 'true',
    'native rail button reopens sidebar',
  );
  // The plugin pane and Zotero's native panes are independent panels. Collapsing a native
  // pane must never take the plugin pane with it, in either direction.
  const itemPane = view.doc.getElementById('zotero-item-pane');
  itemPane.setAttribute('collapsed', 'true');
  await Z.Promise.delay(0);
  assert(
    itemPane.getAttribute('collapsed') === 'true' && !view.panel.hidden,
    'collapsing native item pane keeps plugin sidebar visible',
  );
  nav.click();
  assert(
    view.panel.hidden && itemPane.getAttribute('collapsed') === 'true',
    'rail button hides only the plugin sidebar while the native pane stays collapsed',
  );
  nav.click();
  assert(
    !view.panel.hidden && itemPane.getAttribute('collapsed') === 'true',
    'rail button reopens only the plugin sidebar and never expands the native pane',
  );
  itemPane.removeAttribute('collapsed');
  await Z.Promise.delay(0);
  assert(
    !view.panel.hidden,
    'expanding native item pane leaves the plugin sidebar as the user left it',
  );
  win.ZoteroContextPane.collapsed = true;
  await Z.Promise.delay(0);
  assert(
    win.ZoteroContextPane.collapsed && !view.panel.hidden,
    'collapsing reader context pane keeps plugin sidebar visible',
  );
  nav.click();
  assert(
    view.panel.hidden && win.ZoteroContextPane.collapsed,
    'rail button hides only the plugin sidebar while the context pane stays collapsed',
  );
  nav.click();
  assert(
    !view.panel.hidden && win.ZoteroContextPane.collapsed,
    'rail button never expands the collapsed context pane',
  );
  win.ZoteroContextPane.collapsed = false;
  await Z.Promise.delay(0);
  assert(
    view.finder.localName === 'details' && view.finder.open,
    'search module is collapsible and initially open',
  );
  assert(
    view.finder.querySelector('.pl-global-title').textContent === '全局搜索' &&
      view.finder.querySelector('.pl-condition-title').textContent === '条件搜索' &&
      !view.filterPanel.contains(view.finder.querySelector('.pl-condition-title')),
    'global and conditional search have persistent headings',
  );
  assert(
    view.doc.querySelector('.pl-brand-icon').src.endsWith('/content/icons/paper-lens.png'),
    'custom icon used in header',
  );
  const actions = view.filterPanel.querySelector('.pl-rule-actions');
  assert(
    actions.children.length === 2 && actions.children[0].textContent === '添加条件',
    'add and remove actions share one row',
  );
  for (const width of [280, 380, 600]) {
    view.panel.style.width = view.panel.style.minWidth = view.panel.style.maxWidth = `${width}px`;
    const [addRect, removeRect] = [...actions.children].map((button) =>
      button.getBoundingClientRect(),
    );
    assert(
      Math.abs(addRect.width - removeRect.width) < 1 &&
        Math.abs(addRect.height - removeRect.height) < 1 &&
        Math.abs(addRect.top - removeRect.top) < 1 &&
        view.body.scrollWidth <= view.body.clientWidth + 1,
      `equal inline condition buttons without overflow at ${width}px`,
    );
  }
  // Paper Passport inside the search page.
  assert(
    Object.keys(view.pages).join() === 'search,library,settings' &&
      view.pageButtons.library.textContent === '文库' &&
      !('prepare' in view.pages),
    'exactly three top-level pages, with the library page renamed',
  );
  assert(
    view.pages.search.contains(view.passport) && !view.pages.library.contains(view.passport),
    'the paper passport lives inside the search page, not as a fourth page',
  );
  // The previous search emptied the main list, so show the results again before picking one.
  await app.search({}, '', [], 'all', win);
  win.ZoteroPane.selectItem(items[0].id);
  for (let i = 0; i < 40 && win.ZoteroPane.getSelectedItems()[0]?.key !== key0; i++)
    await Z.Promise.delay(50);
  view.renderPassport();
  assert(view.passportKey === key0, 'the passport follows the selected paper');
  const shown = (e) => !e.hidden && e.getClientRects().length > 0,
    controls = () => [...view.passport.querySelectorAll('input, select, button')].filter(shown),
    chips = (kind) => [...view.dims[kind].querySelectorAll('.pl-chip')],
    chipText = (kind) =>
      chips(kind)
        .map((c) => c.textContent)
        .join(),
    use = (name) => view.useChips.find(([value]) => value === name)[1];
  assert(
    view.passportTitle.textContent === 'Vegetation study 0' && view.passportHint.hidden,
    'the passport shows the selected paper and hides hints when nothing is wrong',
  );
  assert(
    view.passportIdentity.textContent === 'Li · 2024 · Test Journal' &&
      [...view.passportBadges.children].map((b) => b.textContent).join() === '已掌握,核心',
    'one bibliographic identity line, with badges only for values that are set',
  );
  assert(
    [...view.passport.querySelectorAll('.pl-dim > .pl-dim-label')]
      .map((e) => e.textContent)
      .join() ===
      '研究主题,研究区域,研究对象,研究方法,数据来源,指标变量,阅读状态,重要程度,论文用途',
    'the six dimensions and the managed fields are labelled once, in Chinese only',
  );
  assert(
    controls().length === 1 && controls()[0] === view.editButton,
    'the untouched card carries exactly one control: 编辑',
  );
  assert(
    !shown(view.memoryInput) &&
      !shown(view.addForm) &&
      !shown(view.workflowEdit) &&
      shown(view.memoryView) &&
      shown(view.workflowView),
    'no memory input, no keyword form and no selector is rendered until 编辑 is pressed',
  );
  assert(
    C.categories.every((k) => chips(k).length === 1) &&
      chipText('region').includes('中国') &&
      chipText('region').includes('China') &&
      !view.passport.querySelector('.pl-chip-remove'),
    'one chip per dimension holding both languages, and no remove button in view mode',
  );
  assert(
    view.memoryView.textContent === automatic &&
      view.memoryInput.value === '' &&
      view.memoryInput.placeholder === automatic,
    'the card shows the memory sentence as text, with no input and no help line',
  );
  assert(
    !view.passport.textContent.includes('作者 年份 | 期刊') &&
      !view.passport.textContent.includes('无足够信息'),
    'the card carries no explanatory help text and no empty-state filler',
  );
  const savedFP0 = app.data.records[key0].fingerprint,
    savedStatus0 = app.data.records[key0].analysis.status;
  app.data.records[key0].fingerprint = 'changed-again';
  view.renderPassport();
  assert(
    !view.passportHint.hidden && view.passportHint.textContent.includes('重新生成'),
    'the passport warns that the profile is out of date',
  );
  app.data.records[key0].fingerprint = savedFP0;
  app.data.records[key0].analysis.status = 'legacy-partial';
  view.renderPassport();
  assert(
    view.passportHint.textContent.includes('旧版本'),
    'the passport flags keywords carried over from an older version',
  );
  app.data.records[key0].analysis.status = savedStatus0;
  view.renderPassport();
  assert(view.passportHint.hidden, 'the passport clears its hints once nothing is wrong');
  // The first click on 编辑 is what turns the card into a form.
  await click(view.editButton);
  assert(
    view.editButton.textContent === '完成' &&
      shown(view.memoryInput) &&
      shown(view.workflowEdit) &&
      !shown(view.memoryView) &&
      !shown(view.workflowView),
    '编辑 opens the controls and offers 完成 to close them again',
  );
  assert(
    !shown(view.addForm) && shown(view.addToggle) && view.restoreAll.hidden,
    'the one keyword form stays folded, and restore is hidden while nothing is corrected',
  );
  assert(
    controls().includes(view.memoryInput) &&
      controls().includes(view.readingSelect) &&
      controls().includes(view.importanceSelect) &&
      controls().includes(use('discussion')) &&
      !controls().includes(view.addKind),
    'edit mode opens the memory input, both selectors and the uses, but not the keyword form',
  );
  assert(
    chips('region')[0].querySelector('.pl-chip-remove') !== null &&
      use('discussion').getAttribute('aria-pressed') === 'true',
    'chips gain their remove button and the uses show which of them are selected',
  );
  // A render while the box has focus must not reload it: that guard is what keeps a
  // background refresh from eating a sentence mid-typing.
  view.memoryInput.focus();
  view.memoryInput.value = '正在输入';
  view.render();
  assert(
    view.memoryInput.value === '正在输入' && view.memoryView.textContent === automatic,
    'a background refresh never overwrites the memory box while it is being typed in',
  );
  // 完成 is what saves the memory sentence: it has no save button of its own.
  view.memoryInput.value = '我的记忆句';
  view.editButton.click();
  while (app.busy) await Z.Promise.delay(10);
  view.render();
  assert(
    C.workflow(app.data.records[key0]).memorySentenceOverride === '我的记忆句' &&
      view.memoryView.textContent === '我的记忆句' &&
      view.editButton.textContent === '编辑',
    '完成 saves the memory sentence and returns to the card',
  );
  await click(view.editButton);
  await click(view.memoryRestore);
  assert(
    C.workflow(app.data.records[key0]).memorySentenceOverride === null &&
      view.memoryView.textContent === automatic,
    '恢复自动生成 clears the rewrite and the card shows the automatic sentence again',
  );
  view.readingSelect.value = 'read';
  view.readingSelect.onchange();
  while (app.busy) await Z.Promise.delay(10);
  assert(
    C.workflow(app.data.records[key0]).readingStatus === 'read' &&
      view.readingSelect.value === 'read',
    'reading status is set from the passport and stays on the chosen value',
  );
  view.importanceSelect.value = 'important';
  view.importanceSelect.onchange();
  while (app.busy) await Z.Promise.delay(10);
  assert(
    C.workflow(app.data.records[key0]).importance === 'important' &&
      view.importanceSelect.value === 'important',
    'importance is set from the passport and stays on the chosen value',
  );
  await click(use('review'));
  assert(
    C.workflow(app.data.records[key0]).roles.join() === 'discussion,data,review' &&
      use('review').getAttribute('aria-pressed') === 'true',
    'a use chip is selected by one press and stays pressed',
  );
  await click(use('discussion'));
  assert(
    C.workflow(app.data.records[key0]).roles.join() === 'data,review' &&
      use('discussion').getAttribute('aria-pressed') === 'false',
    'the same use chip is deselected by a second press',
  );
  view.renderPassport();
  assert(
    view.memoryInput.value === '' && view.memoryInput.placeholder === automatic,
    'a background refresh leaves the memory box alone while it is idle',
  );
  await click(view.addToggle);
  assert(
    shown(view.addForm) &&
      [...view.addKind.options].map((o) => o.value).join() === C.categories.join(),
    'one shared keyword form serves all six dimensions',
  );
  view.addKind.value = 'region';
  view.addZh.value = '黄土高原';
  view.addEn.value = 'Loess Plateau';
  await click(view.addSubmit);
  assert(
    chips('region').length === 2 &&
      chipText('region').includes('黄土高原') &&
      chips('region')[1].classList.contains('pl-chip-manual') &&
      view.addZh.value === '' &&
      view.addEn.value === '',
    'a hand-added keyword is shown as a manual chip and the form is cleared',
  );
  await click(view.addSubmit);
  assert(chips('region').length === 2, 'an empty add is refused');
  view.addZh.value = '只有中文';
  await click(view.addSubmit);
  assert(
    chips('region').length === 2 && app.message.includes('同时填写'),
    'a half pair is refused in the interface',
  );
  view.addZh.value = '';
  assert(view.restoreAll.hidden === false, 'the single restore appears once the profile is edited');
  await click(view.restoreAll);
  assert(
    chips('region').length === 1 &&
      chipText('region').includes('China') &&
      view.restoreAll.hidden === true,
    'restoring clears the manual corrections and hides the action again',
  );
  await click(chips('topic')[0].querySelector('.pl-chip-remove'));
  assert(
    chips('topic').length === 0 &&
      view.dims.topic.querySelector('.pl-empty') !== null &&
      view.restoreAll.hidden === false,
    'removing a chip leaves the dimension explicitly empty',
  );
  assert(
    app.data.records[key0].analysis.keywords.topic.length === 1,
    'removing a chip does not touch the stored AI result',
  );
  await click(view.restoreAll);
  assert(chips('topic').length === 1, 'the single restore brings the AI profile back');
  // A manual correction and a workflow field must survive an AI re-run.
  await app.analyze({}, true);
  view.renderPassport();
  assert(
    chips('topic').length === 1 &&
      C.workflow(app.data.records[key0]).roles.join() === 'data,review' &&
      C.workflow(app.data.records[key0]).readingStatus === 'read',
    'a re-run refreshes keywords without discarding the user workflow',
  );
  const fitsPanel = (extra) =>
    [280, 380, 600].every((width) => {
      view.panel.style.width = view.panel.style.minWidth = view.panel.style.maxWidth = `${width}px`;
      view.renderPassport();
      const right = view.body.getBoundingClientRect().right,
        inside = (e) => e.getBoundingClientRect().right <= right + 1;
      return (
        view.body.scrollWidth <= view.body.clientWidth + 1 &&
        C.categories.every((k) => chips(k).every(inside)) &&
        extra.every(inside)
      );
    });
  assert(
    fitsPanel([view.memoryView, view.findingsList, view.workflowView]),
    'the card stays inside the panel at 280, 380 and 600px without horizontal scroll',
  );
  await click(view.editButton);
  await click(view.addToggle);
  assert(
    fitsPanel([view.memoryEdit, view.addForm, view.workflowEdit, view.findingsList]),
    'the edit controls stack and stay inside the panel at 280, 380 and 600px',
  );
  await click(view.editButton);
  // The passport follows the main list on a plain selection change: no reader, no double click,
  // no manual refresh. The previous ['item'] Notifier observer could never have fired, because
  // Zotero only ever triggers a 'select' event for tabs, never for items.
  const pick = async (item) => {
    win.ZoteroPane.selectItem(item.id);
    for (let i = 0; i < 40 && view.passportKey !== item.key; i++) await Z.Promise.delay(50);
  };
  await pick(items[1]);
  assert(
    view.passportKey === items[1].key && view.passportTitle.textContent === 'Vegetation study 1',
    'a single main-list selection change moves the passport to that paper',
  );
  await pick(items[0]);
  assert(
    view.passportKey === items[0].key && view.passportTitle.textContent === 'Vegetation study 0',
    'selecting the previous paper moves the passport back without opening a reader',
  );
  const boundListeners = () => view.selectionView?._events?.select?.listeners,
    stacked = boundListeners()?.size ?? 0;
  view.bindItemSelection();
  view.bindItemSelection();
  assert(
    boundListeners()?.has(view.selectionListener) === true &&
      (boundListeners()?.size ?? 0) === stacked,
    'binding the selection listener again never stacks a second one',
  );
  view.passportKey = null;
  view.notify('select');
  assert(
    view.passportKey === items[0].key,
    'coming back to the library re-reads its own selection',
  );
  // Both languages of a finding belong in the text column. Auto-placement used to drop the
  // English line into the 1.3em number column, wrapping it a letter or two per line.
  const finding = view.findingsList.querySelector('.pl-finding'),
    findingZh = finding?.querySelector('.pl-finding-zh'),
    findingEn = finding?.querySelector('.pl-finding-en'),
    computed = (e) => view.win.getComputedStyle(e);
  assert(!!findingZh && !!findingEn, 'a finding renders both languages for the layout check');
  assert(
    computed(findingZh).gridColumnStart === '2' && computed(findingEn).gridColumnStart === '2',
    'both finding languages are placed in the text column',
  );
  for (const width of [280, 380, 600]) {
    view.panel.style.width = view.panel.style.minWidth = view.panel.style.maxWidth = `${width}px`;
    const number = parseFloat(computed(finding).gridTemplateColumns.split(' ')[0]),
      zhRect = findingZh.getBoundingClientRect(),
      enRect = findingEn.getBoundingClientRect();
    assert(
      Math.abs(enRect.left - zhRect.left) < 1 &&
        enRect.width > number * 2 &&
        computed(findingEn).wordBreak === 'normal',
      `the English finding keeps the full text width at ${width}px`,
    );
    assert(
      view.body.scrollWidth <= view.body.clientWidth + 1,
      `findings cause no horizontal overflow at ${width}px`,
    );
  }
  view.panel.style.width = view.panel.style.minWidth = view.panel.style.maxWidth = '';
  view.selectPage('settings');
  // A stored key locks the fields, so unlocking is what the first click does.
  await click(view.apiSave);
  assert(view.apiEditing && view.key.value === '', 'the edit action unlocks the saved API fields');
  view.url.value = app.get('url');
  view.model.value = 'synthetic';
  view.key.value = 'replacement-synthetic-key';
  await click(view.apiSave);
  assert(
    !view.apiEditing && view.key.readOnly && view.url.readOnly && view.model.readOnly,
    'saved API fields are locked',
  );
  assert(
    view.apiSave.textContent === '修改 API' && view.key.value === '••••••••',
    'saved key replaced with fixed dummy mask',
  );
  app.status('Trigger render');
  assert(view.key.readOnly, 'render does not unlock saved API');
  await click(view.apiSave);
  assert(
    view.apiEditing && !view.key.readOnly && view.key.value === '',
    'edit action unlocks fields and clears dummy mask',
  );
  view.model.value = 'synthetic-edited';
  await click(view.apiSave);
  assert(
    app.secret() === 'replacement-synthetic-key' && app.get('model') === 'synthetic-edited',
    'saving model with blank key preserves existing secret',
  );
  await click(view.apiSave);
  view.model.value = 'unsaved-model';
  await click(view.apiCancel);
  assert(
    view.model.value === 'synthetic-edited' && !view.apiEditing,
    'cancel restores saved model and locks fields',
  );
  view.selectPage('search');
  // Metadata changes keep the profile but mark it stale.
  const item = items[1];
  item.setField('title', 'Changed evidence');
  await item.saveTx();
  await app.update();
  assert(
    app.stale(item.key) && app.data.records[item.key].analysis.keywords.region.length === 1,
    'changed metadata marks the profile stale without discarding it',
  );
  assert(
    app.data.records[item.key].metadata.title === 'Changed evidence',
    'changed metadata is re-read',
  );
  await app.analyze();
  assert(!app.stale(item.key), 'a stale profile is refreshed and up to date again');
  app.set('auto', true);
  items[2].setField('title', 'Auto refreshed');
  await items[2].saveTx();
  for (let n = 0; n < 40; n++) {
    await Z.Promise.delay(200);
    if (app.data.records[items[2].key].metadata.title === 'Auto refreshed') break;
  }
  assert(
    app.data.records[items[2].key].metadata.title === 'Auto refreshed',
    'automatic metadata update works',
  );
  app.set('auto', false);
  app.set('url', 'http://127.0.0.1:18767/slow');
  const job = app.analyze({}, true);
  await Z.Promise.delay(400);
  app.cancel();
  let cancelled = false;
  try {
    await job;
  } catch (e) {
    cancelled = e.message.includes('取消');
  }
  assert(cancelled, 'in-flight AI request cancellation');
  app.token = null;
  const reloaded = JSON.parse(await IOUtils.readUTF8(app.path));
  assert(Object.keys(reloaded.records).length === 6, 'persistent cache reload retains metadata');
  assert(
    (await Z.Items.getAll(lib, true, false)).filter((i) => i.isRegularItem()).length === 6,
    'all original papers retained',
  );
  assert(
    Z.Collections.getByLibrary(lib, true).length === 2,
    'no literature collections created or removed',
  );
  // Version 1 to version 2 migration, on a real file, with a real backup.
  const goodIndex = await IOUtils.readUTF8(app.path),
    backup = PathUtils.join(PathUtils.parent(app.path), S.BACKUP),
    v1Index = JSON.stringify({
      version: 1,
      records: {
        OLDKEY01: {
          id: 1,
          key: 'OLDKEY01',
          fingerprint: 'fp-old',
          metadata: { title: 'Legacy paper', date: '2019' },
          labels: {
            zh: { region: ['中国'], subject: ['植被'], method: ['遥感'] },
            en: { region: ['China'], subject: ['Vegetation'], method: ['Remote sensing'] },
          },
          ownedTags: ['研究区域：中国', 'Study region: China'],
          updatedAt: '2019-01-01T00:00:00.000Z',
        },
      },
    });
  await IOUtils.writeUTF8(app.path, v1Index);
  const { migrated } = await app.loadIndex();
  assert(migrated, 'a version 1 index is migrated when it is loaded');
  const old = app.data.records.OLDKEY01;
  assert(
    old.analysis.status === 'legacy-partial' &&
      old.analysis.keywords.region[0].en === 'China' &&
      old.analysis.keywords.object[0].en === 'Vegetation' &&
      old.analysis.keywords.method[0].en === 'Remote sensing',
    'version 1 labels migrate by pair, with subject becoming object',
  );
  assert(
    ['topic', 'dataset', 'variable'].every((k) => old.analysis.keywords[k].length === 0),
    'categories the old format never had start empty rather than guessed',
  );
  assert(
    old.analysis.findings.length === 0 &&
      old.analysis.aiModel === null &&
      old.analysis.sourceFingerprint === 'fp-old',
    'the old format had no findings and no model, so the migrated record has neither',
  );
  assert(
    C.workflow(old).readingStatus === 'unread' &&
      C.workflow(old).memorySentenceOverride === null &&
      C.categories.every((k) => old.manual.additions[k].length === 0),
    'migrated records get default workflow and no manual corrections',
  );
  assert(
    old.ownedTags.length === 2 &&
      old.metadata.title === 'Legacy paper' &&
      old.fingerprint === 'fp-old',
    'migration preserves owned tag receipts, metadata and the fingerprint',
  );
  assert(
    (await IOUtils.exists(backup)) && (await IOUtils.readUTF8(backup)) === v1Index,
    'the version 1 index is backed up before the migration is written',
  );
  assert(
    (await IOUtils.readUTF8(app.path)) === v1Index,
    'loading does not rewrite the version 1 file',
  );
  await app.save();
  const saved = JSON.parse(await IOUtils.readUTF8(app.path));
  assert(
    saved.version === 2 && saved.records.OLDKEY01.analysis.keywords.object[0].en === 'Vegetation',
    'the migrated index is persisted as version 2',
  );
  assert(!('searchText' in saved.records.OLDKEY01), 'derived search text is not persisted');
  // A corrupt index must never be replaced by an empty database.
  await IOUtils.writeUTF8(app.path, '{not json');
  const keep = Object.keys(app.data.records).length;
  let refused = false;
  try {
    await app.loadIndex();
  } catch (_) {
    refused = true;
  }
  assert(
    refused && Object.keys(app.data.records).length === keep,
    'an unreadable index throws and leaves the loaded index untouched',
  );
  assert(
    (await IOUtils.readUTF8(app.path)) === '{not json',
    'an unreadable index is left on disk instead of being replaced by an empty one',
  );
  await IOUtils.writeUTF8(app.path, goodIndex);
  await app.loadIndex();
  assert(
    Object.keys(app.data.records).length === 6 &&
      app.data.records[items[0].key].analysis.status === 'complete',
    'the real index reloads unchanged after the migration checks',
  );
  app.secret('');
  app.set('url', 'https://api.deepseek.com');
  app.set('model', 'deepseek-v4-flash');
  app.status('独立测试完成');
  win.document.title = 'Paper Lens — ISOLATED TEST';
  await IOUtils.writeUTF8(
    output,
    JSON.stringify({ success: true, version: Z.version, checks }, null, 2),
  );
};
