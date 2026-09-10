/* Development-only bootstrap. Packaged by dev.ps1 into an isolated preview profile. */
var sourceScope;
var config;
var running = false;
var reloading = false;
var generation = 0;
var loadedSignature = '';
var menus = new Map();

async function report(error = null) {
  await IOUtils.writeUTF8(
    PathUtils.join(PathUtils.parent(config.dataDir), 'preview-status.json'),
    JSON.stringify({ ready: !error, generation, error: error ? String(error) : null }),
  );
}

async function sourceFiles(directory) {
  const files = [];
  for (const path of await IOUtils.getChildren(directory)) {
    const stat = await IOUtils.stat(path);
    if (stat.type === 'directory') files.push(...(await sourceFiles(path)));
    else files.push({ path, modified: stat.lastModified, size: stat.size });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function reload() {
  if (!running || reloading || Zotero.PaperLens?.busy) return false;
  reloading = true;
  try {
    const files = await sourceFiles(config.sourcePath);
    // Keep the working UI if an intermediate save contains a JavaScript syntax error.
    for (const file of files.filter((file) => file.path.endsWith('.js'))) {
      new Function(await IOUtils.readUTF8(file.path));
    }
    if (!running) return false;
    const viewStates = [...(Zotero.PaperLens?.views || [])].map(([window, view]) => ({
      window,
      page: view.page,
      scope: view.scope(),
      query: view.query.value,
      filtersHidden: view.filterPanel.hidden,
    }));
    sourceScope?.shutdown();
    Services.obs.notifyObservers(null, 'startupcache-invalidate');
    Services.obs.notifyObservers(null, 'chrome-flush-caches');
    sourceScope = {
      Zotero,
      Services,
      Components,
      ChromeUtils,
      IOUtils,
      PathUtils,
      URL,
      setTimeout,
      clearTimeout,
    };
    Services.scriptloader.loadSubScript(config.sourceURI + 'bootstrap.js', sourceScope, 'UTF-8');
    await sourceScope.startup({ rootURI: config.sourceURI });
    for (const state of viewStates) {
      const view = Zotero.PaperLens.views.get(state.window);
      if (!view) continue;
      view.scopeSelect.value = state.scope.collection;
      view.recursive.checked = state.scope.recursive;
      view.query.value = state.query;
      if (view.pages[state.page]) view.selectPage(state.page);
      view.filterPanel.hidden = state.filtersHidden;
      view.filterToggle.setAttribute('aria-expanded', String(!state.filtersHidden));
      view.updateFilterLabel();
    }
    generation += 1;
    loadedSignature = JSON.stringify(files);
    for (const menu of menus.values()) menu.setAttribute('label', '文献透镜开发：重新加载源码');
    await report();
    return true;
  } catch (error) {
    Zotero.logError(error);
    for (const menu of menus.values())
      menu.setAttribute('label', '文献透镜开发：加载失败，点击重试');
    await report(error);
    return false;
  } finally {
    reloading = false;
  }
}

function attachMenu(window) {
  if (menus.has(window)) return;
  const popup = window.document.getElementById('menu_ToolsPopup');
  if (!popup) return;
  const menu = window.document.createXULElement('menuitem');
  menu.setAttribute('label', '文献透镜开发：重新加载源码');
  menu.addEventListener('command', () => reload());
  popup.append(menu);
  menus.set(window, menu);
  window.document.title = '文献透镜 · 开发预览（独立演示文库）';
}

async function seedExamples() {
  const libraryID = Zotero.Libraries.userLibraryID;
  if ((await Zotero.Items.getAll(libraryID, true, false)).length) return;
  const collection = new Zotero.Collection();
  collection.libraryID = libraryID;
  collection.name = '开发预览 · 示例论文';
  await collection.saveTx();
  for (const [index, title] of [
    'Vegetation resilience in China — demo record',
    'Remote sensing of forest recovery — demo record',
    'River basin drought assessment — demo record',
    'Urban vegetation and climate — demo record',
    'Random forest models for ecosystem monitoring — demo record',
    'Vegetation recovery across Asia — demo record',
  ].entries()) {
    const item = new Zotero.Item(index % 2 ? 'conferencePaper' : 'journalArticle');
    item.libraryID = libraryID;
    item.setField('title', title);
    item.setField(
      'abstractNote',
      'Synthetic preview metadata about vegetation, climate and remote sensing. This is not a real publication.',
    );
    item.addTag('开发演示');
    item.addToCollection(collection.id);
    await item.saveTx();
  }
}

async function startup({ rootURI }) {
  await Zotero.initializationPromise;
  const response = await Zotero.HTTP.request('GET', rootURI + 'config.json', {
    responseType: 'text',
  });
  config = JSON.parse(response.responseText);
  if (PathUtils.normalize(Zotero.DataDirectory.dir) !== PathUtils.normalize(config.dataDir)) {
    throw Error('Development loader refused to access a non-preview library');
  }
  running = true;
  await Zotero.Libraries.get(Zotero.Libraries.userLibraryID).waitForDataLoad('item');
  await seedExamples();
  for (const window of Zotero.getMainWindows()) attachMenu(window);
  Zotero.PaperLensDev = {
    reload,
    get generation() {
      return generation;
    },
  };
  await reload();
  if (config.watch) watchSources();
}

async function watchSources() {
  let lastSeen = loadedSignature;
  let attempted = loadedSignature;
  while (running) {
    await Zotero.Promise.delay(1000);
    if (!running) break;
    try {
      const signature = JSON.stringify(await sourceFiles(config.sourcePath));
      if (signature !== attempted && signature === lastSeen && !Zotero.PaperLens?.busy) {
        await reload();
        attempted = signature;
      }
      lastSeen = signature;
    } catch (error) {
      await report(error);
    }
  }
}

function onMainWindowLoad({ window }) {
  attachMenu(window);
  sourceScope?.onMainWindowLoad({ window });
}

function onMainWindowUnload({ window }) {
  sourceScope?.onMainWindowUnload({ window });
  menus.get(window)?.remove();
  menus.delete(window);
}

function shutdown() {
  running = false;
  sourceScope?.shutdown();
  for (const menu of menus.values()) menu.remove();
  menus.clear();
  delete Zotero.PaperLensDev;
}

function install() {}
function uninstall() {}
