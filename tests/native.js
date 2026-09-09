var runNative = async function () {
  if (PathUtils.normalize(Zotero.DataDirectory.dir) !== PathUtils.normalize(expected))
    throw Error('Refuse non-test library');
  const checks = [],
    assert = (x, m) => {
      if (!x) throw Error(m);
      checks.push(m);
    };
  const Z = Zotero,
    app = Z.PaperLens,
    lib = Z.Libraries.userLibraryID;
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
    const item = new Z.Item(i % 2 ? 'conferencePaper' : 'journalArticle');
    item.libraryID = lib;
    item.setField('title', 'Vegetation study ' + i);
    item.setField('abstractNote', 'Satellite measurements of vegetation in China.');
    item.setField('extra', 'Arbitrary metadata');
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
  assert(await IOUtils.exists(app.path), 'metadata persisted to local disk');
  app.secret('synthetic-key');
  app.set('url', 'http://127.0.0.1:18767/repair');
  app.set('model', 'synthetic');
  await app.analyze();
  assert(
    Object.values(app.data.records).every(
      (r) => r.labels?.en.region[0] === 'China' && r.labels?.zh.region[0] === '中国',
    ),
    'AI paired bilingual keywords with invalid-key correction',
  );
  assert(!('summary' in app.data.records[items[0].key]), 'no summary stored');
  assert(
    items.every((i) => i.getTags().length === 1),
    'plugin-only mode leaves original tags untouched',
  );
  const preexisting = 'PaperLens/研究区域: 中国';
  items[0].addTag(preexisting);
  await items[0].saveTx();
  app.set('native', true);
  await app.syncTags();
  assert(
    items[1].getTags().some((t) => t.tag === preexisting),
    'native Chinese tags written',
  );
  assert(
    items[1].getTags().some((t) => t.tag === 'PaperLens/Study region: China'),
    'native English tags written',
  );
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
  let win;
  for (let i = 0; i < 80; i++) {
    win = Z.getMainWindow();
    if (win?.ZoteroPane?.collectionsView) break;
    await Z.Promise.delay(200);
  }
  app.attach(win);
  assert(!!win.document.getElementById('paper-lens-sidebar'), 'new sidebar mounted');
  const view = app.views.get(win);
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
  assert(
    view.finder.localName === 'details' && view.finder.open,
    'search module is collapsible and initially open',
  );
  assert(
    view.finder.querySelector('.pl-global-title').textContent === '全局搜索',
    'global search has prominent heading',
  );
  assert(
    view.doc.querySelector('.pl-brand-icon').src.endsWith('/content/icons/paper-lens.png'),
    'custom icon used in header',
  );
  const actions = view.rules.querySelector('.pl-rule-actions');
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
  view.panel.style.width = view.panel.style.minWidth = view.panel.style.maxWidth = '';
  const click = async (button) => {
    button.click();
    while (app.busy) await Z.Promise.delay(10);
  };
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
  let matches = await app.search(
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
  const item = items[1];
  item.setField('title', 'Changed evidence');
  await item.saveTx();
  await app.update();
  assert(!app.data.records[item.key].labels, 'changed metadata invalidates AI evidence');
  await app.analyze();
  assert(!!app.data.records[item.key].labels, 'missing keywords can be resumed');
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
