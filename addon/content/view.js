(function (root) {
  'use strict';
  const Z = root.Zotero,
    NS = 'http://www.w3.org/1999/xhtml';
  class View {
    constructor(app, win) {
      this.app = app;
      this.win = win;
      this.doc = win.document;
      this.rows = [];
      this.locked = [];
      this.userHidden = false;
    }
    el(tag, text, attrs = {}) {
      const e = this.doc.createElementNS(NS, tag);
      if (text !== undefined) e.textContent = text;
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      return e;
    }
    button(text, fn) {
      const b = this.el('button', text, { type: 'button' });
      b.addEventListener('click', () => this.app.run(fn));
      this.locked.push(b);
      return b;
    }
    field(parent, title, tag = 'input', attrs = {}) {
      const l = this.el('label', title),
        e = this.el(tag, undefined, attrs);
      l.append(e);
      parent.append(l);
      this.locked.push(e);
      return e;
    }
    select(parent, title, options) {
      const e = this.field(parent, title, 'select');
      this.options(e, options);
      return e;
    }
    options(e, opts) {
      e.replaceChildren(...opts.map(([value, label]) => this.el('option', label, { value })));
    }
    row(...els) {
      const e = this.el('div', undefined, { class: 'pl-row' });
      e.append(...els);
      return e;
    }
    section(title, open = false) {
      const d = this.el('details');
      d.open = open;
      d.append(this.el('summary', title));
      (this.sectionHost || this.body).append(d);
      return d;
    }
    mount() {
      this.style = this.el('link', undefined, {
        rel: 'stylesheet',
        href:
          this.app.uri +
          'content/style.css' +
          (this.app.uri.startsWith('file:') ? `?dev=${Date.now()}` : ''),
      });
      this.doc.documentElement.append(this.style);
      this.panel = this.doc.createXULElement('vbox');
      this.panel.id = 'paper-lens-sidebar';
      this.panel.setAttribute('class', 'pl-panel');
      this.split = this.doc.createXULElement('splitter');
      this.split.setAttribute('resizebefore', 'closest');
      this.split.setAttribute('resizeafter', 'closest');
      this.body = this.el('div', undefined, { class: 'pl-body' });
      this.panel.append(this.body);
      this.doc.getElementById('zotero-context-pane').parentElement.append(this.split, this.panel);
      const heading = this.el('div', undefined, { class: 'pl-heading' });
      heading.append(
        this.el('img', undefined, {
          class: 'pl-brand-icon',
          src: this.app.uri + 'content/icons/paper-lens.png',
          alt: '',
        }),
        this.el('h2', '文献透镜'),
      );
      const header = this.el('header', undefined, { class: 'pl-header' });
      this.readiness = this.el('button', undefined, { type: 'button', class: 'pl-readiness' });
      this.readiness.append(
        this.el('span', undefined, { class: 'pl-readiness-dot', 'aria-hidden': 'true' }),
      );
      this.readinessText = this.el('span');
      this.readiness.append(this.readinessText);
      this.readiness.addEventListener('click', () => {
        this.selectPage(this.readinessPage);
        const section = this[this.readinessSection];
        if (section) section.open = true;
      });
      header.append(heading, this.readiness);
      this.body.append(header);
      if (this.app.uri.startsWith('file:')) {
        this.body.append(this.el('p', '开发预览 · 独立演示文库', { class: 'pl-dev-note' }));
      }
      this.mountWorkspace();
      this.sectionHost = this.pages.search;
      this.mountSearch();
      this.mountPreview();
      this.sectionHost = this.pages.prepare;
      this.mountMetadata();
      this.sectionHost = this.pages.settings;
      this.mountAPI();
      this.mountLibrarySettings();
      this.sectionHost = null;
      this.selectPage(Object.keys(this.app.data.records).length ? 'search' : 'prepare');
      this.menu = this.doc.createXULElement('menuitem');
      this.menu.setAttribute('label', '文献透镜：显示 / 隐藏');
      this.menu.addEventListener('command', () => this.toggle());
      this.doc.getElementById('menu_ToolsPopup').append(this.menu);
      this.keywords.append(
        this.el('p', '请在主列表选择一篇论文。', {
          class: 'muted',
        }),
      );
      this.navigation = new root.LensSidebarToggle(this);
      this.watchPanes();
      this.collections();
      this.render();
    }
    mountPreview() {
      const preview = this.section('所选论文的研究关键词');
      this.lang = this.select(preview, '显示语言', [
        ['zh', '中文'],
        ['en', 'English'],
      ]);
      this.lang.value = this.app.get('language', 'zh');
      this.lang.onchange = () => {
        this.app.set('language', this.lang.value);
        this.preview();
      };
      preview.append(this.button('查看所选论文', () => this.preview()));
      this.keywords = this.el('div', undefined, { class: 'pl-keywords', 'aria-live': 'polite' });
      preview.append(this.keywords);
    }
    subheading(parent, title, description, className = '') {
      parent.append(this.el('h3', title, { class: className }));
      if (description)
        parent.append(this.el('p', description, { class: 'muted pl-section-description' }));
    }
    // Zotero marks a collapsed pane with collapsed="true" and removes the attribute to expand,
    // so presence alone never means collapsed.
    itemPaneCollapsed() {
      return this.itemPane?.getAttribute('collapsed') === 'true';
    }
    // Library tabs drive #zotero-item-pane. Reader and note tabs drive the context pane
    // instead, and that one stays collapsed="true" the whole time a library tab is selected,
    // so it is only a usable signal while a non-library tab is showing.
    usesContextPane() {
      return this.win.Zotero_Tabs?.selectedType !== 'library';
    }
    activePaneCollapsed() {
      return this.usesContextPane()
        ? !!this.win.ZoteroContextPane?.collapsed
        : this.itemPaneCollapsed();
    }
    applyVisibility() {
      const hidden = this.userHidden || this.activePaneCollapsed();
      this.panel.hidden = hidden;
      this.split.hidden = hidden;
      this.navigation?.update();
    }
    watchPanes() {
      this.itemPane = this.doc.getElementById('zotero-item-pane');
      this.paneObserver = new this.win.MutationObserver(() => this.applyVisibility());
      // Collapsing the context pane updates its splitters, not the pane box on its own.
      for (const [node, attributeFilter] of [
        [this.itemPane, ['collapsed']],
        [this.doc.getElementById('zotero-context-pane'), ['collapsed']],
        [this.doc.getElementById('zotero-context-splitter'), ['state', 'hidden']],
        [this.doc.getElementById('zotero-context-splitter-stacked'), ['state', 'hidden']],
      ]) {
        if (node) this.paneObserver.observe(node, { attributes: true, attributeFilter });
      }
      // Zotero_Tabs.select() is the only signal for a library/reader switch.
      this.tabObserverID = Z.Notifier.registerObserver(this, ['tab']);
      this.applyVisibility();
    }
    notify(event) {
      if (event === 'select') this.applyVisibility();
    }
    expandActivePane() {
      if (this.usesContextPane()) {
        if (this.win.ZoteroContextPane) this.win.ZoteroContextPane.collapsed = false;
      } else if (this.itemPane) {
        this.itemPane.collapsed = false;
      }
    }
    toggle() {
      // Match Zotero's own pane buttons: clicking while collapsed expands the pane.
      if (this.activePaneCollapsed()) {
        this.userHidden = false;
        this.expandActivePane();
        this.applyVisibility();
        return;
      }
      this.userHidden = !this.userHidden;
      this.applyVisibility();
    }
    scope() {
      return { collection: this.scopeSelect.value, recursive: this.recursive.checked };
    }
    collections() {
      const old = this.scopeSelect.value,
        cols = Z.Collections.getByLibrary(Z.Libraries.userLibraryID, true);
      this.options(this.scopeSelect, [
        ['', '整个个人文库'],
        ...cols.map((c) => {
          const names = [c.name];
          let parent = c.parentID;
          while (parent) {
            const p = Z.Collections.get(parent);
            if (!p) break;
            names.unshift(p.name);
            parent = p.parentID;
          }
          return [String(c.id), names.join(' / ')];
        }),
      ]);
      if (cols.some((c) => String(c.id) === old)) this.scopeSelect.value = old;
    }
    preview() {
      let item = this.win.ZoteroPane.getSelectedItems()[0];
      const reader = Z.Reader.getByTabID(this.win.Zotero_Tabs.selectedID);
      if (reader) item = Z.Items.get(reader.itemID);
      if (item?.parentID) item = Z.Items.get(item.parentID);
      const record = item && this.app.data.records[item.key];
      this.keywords.replaceChildren();
      this.keywords.append(
        this.el('p', record?.metadata.title || '请在主列表选择一篇论文。', {
          class: 'pl-paper-title',
        }),
      );
      const labels = { region: '研究区域', subject: '研究对象', method: '研究方法' };
      if (!record?.labels) {
        this.keywords.append(this.el('p', '暂无有效 AI 关键词，请先生成。'));
        return;
      }
      for (const k of root.LensCore.categories) {
        this.keywords.append(this.el('h3', labels[k]));
        const words = record.labels[this.lang.value][k];
        if (!words.length) {
          this.keywords.append(this.el('p', '无足够信息', { class: 'muted' }));
          continue;
        }
        const list = this.el('ul', undefined, { class: 'pl-keyword-list' });
        list.append(...words.map((w) => this.el('li', w)));
        this.keywords.append(list);
      }
    }
    render() {
      if (!this.status) return;
      this.status.textContent = this.app.message;
      this.locked = this.locked.filter((e) => e.isConnected);
      for (const e of this.locked) e.disabled = this.app.busy;
      this.updateSearchControls();
      this.renderAPI();
      this.renderWorkspace();
      this.status.hidden = !this.app.message;
      this.cancel.hidden = !this.app.token;
    }
    destroy() {
      this.paneObserver?.disconnect();
      if (this.tabObserverID) Z.Notifier.unregisterObserver(this.tabObserverID);
      this.navigation?.destroy();
      this.panel?.remove();
      this.split?.remove();
      this.menu?.remove();
      this.style?.remove();
    }
  }
  Object.assign(
    View.prototype,
    root.LensWorkspaceUI,
    root.LensLibraryUI,
    root.LensSearchUI,
    root.LensAPIUI,
  );
  root.LensView = View;
})(this);
