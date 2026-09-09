const fs = require('node:fs'),
  path = require('node:path'),
  url = require('node:url');
const base = path.resolve(__dirname, '..'),
  folder = path.join(base, '.test', String(Date.now()));
for (const p of ['profile/extensions', 'data', 'runner'])
  fs.mkdirSync(path.join(folder, p), { recursive: true });
const info = {
  profile: path.join(folder, 'profile'),
  data: path.join(folder, 'data'),
  runner: path.join(folder, 'runner'),
  output: path.join(folder, 'result.json'),
};
const preferences = {
  'extensions.zotero.dataDir': info.data,
  'extensions.zotero.useDataDir': true,
  'extensions.zotero.firstRun.skipFirefoxProfileAccessCheck': true,
  'extensions.zotero.firstRun2': false,
  'extensions.zotero.sync.autoSync': false,
  'extensions.autoDisableScopes': 0,
  'extensions.enabledScopes': 15,
  'extensions.update.enabled': false,
};
fs.writeFileSync(
  path.join(info.profile, 'user.js'),
  Object.entries(preferences)
    .map(([k, v]) => `user_pref(${JSON.stringify(k)},${JSON.stringify(v)});`)
    .join('\n'),
);
fs.copyFileSync(
  path.join(base, 'dist/paper-lens-1.0.0.xpi'),
  path.join(info.profile, 'extensions/paper-lens@local.zotero.xpi'),
);
fs.writeFileSync(
  path.join(info.runner, 'manifest.json'),
  JSON.stringify({
    manifest_version: 2,
    name: 'Paper Lens test runner',
    version: '1.0',
    applications: {
      zotero: {
        id: 'paper-lens-test@local.zotero',
        update_url: 'https://example.invalid/test.json',
        strict_min_version: '9.0.6',
        strict_max_version: '9.0.*',
      },
    },
  }),
);
fs.writeFileSync(
  path.join(info.runner, 'bootstrap.js'),
  `function startup() {
  Zotero.Promise.delay(1000).then(async () => {
    const output = ${JSON.stringify(info.output)};
    try {
      await Zotero.initializationPromise;
      const scope = {
        Zotero, IOUtils, PathUtils,
        expected: ${JSON.stringify(info.data)},
        output,
      };
      Services.scriptloader.loadSubScript(
        ${JSON.stringify(url.pathToFileURL(path.join(base, 'tests/native.js')).href)},
        scope,
        'UTF-8',
      );
      await scope.runNative();
    } catch (error) {
      await IOUtils.writeUTF8(output, JSON.stringify({
        success: false,
        error: String(error),
        stack: error.stack,
      }));
    }
  });
}

function shutdown() {}
function install() {}
function uninstall() {}
`,
);
fs.writeFileSync(path.join(base, '.test/latest.json'), JSON.stringify(info, null, 2));
console.log(JSON.stringify(info));
