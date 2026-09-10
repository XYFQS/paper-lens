var lens;
async function startup({ rootURI }) {
  await Zotero.initializationPromise;
  const scope = {
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
  for (const file of [
    'core',
    'app',
    'ui/sidebar-toggle',
    'ui/workspace',
    'ui/library-panel',
    'ui/search-panel',
    'ui/api-panel',
    'view',
  ])
    Services.scriptloader.loadSubScript(rootURI + 'content/' + file + '.js', scope, 'UTF-8');
  lens = new scope.PaperLensApp(rootURI);
  Zotero.PaperLens = lens;
  await lens.start();
}
function onMainWindowLoad({ window }) {
  lens?.attach(window);
}
function onMainWindowUnload({ window }) {
  lens?.detach(window);
}
function shutdown() {
  lens?.stop();
  delete Zotero.PaperLens;
  lens = null;
}
function install() {}
function uninstall() {}
