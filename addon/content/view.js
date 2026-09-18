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
      this.mountPassport();
      this.sectionHost = this.pages.library;
      this.mountMetadata();
      this.sectionHost = this.pages.settings;
      this.mountAPI();
      this.mountLibrarySettings();
      this.sectionHost = null;
      this.selectPage(Object.keys(this.app.data.records).length ? 'search' : 'library');
      this.menu = this.doc.createXULElement('menuitem');
      this.menu.setAttribute('label', '文献透镜：显示 / 隐藏');
      this.menu.addEventListener('command', () => this.toggle());
      this.doc.getElementById('menu_ToolsPopup').append(this.menu);
      this.navigation = new root.LensSidebarToggle(this);
      this.watchTabs();
      this.collections();
      this.render();
    }
    subheading(parent, title, description, className = '') {
      parent.append(this.el('h3', title, { class: className }));
      if (description)
        parent.append(this.el('p', description, { class: 'muted pl-section-description' }));
    }
    applyVisibility() {
      // Paper Lens is shown or hidden only by its own rail button. Zotero's native item pane
      // and context pane are separate panels with their own collapse buttons, and collapsing
      // either of them must leave this pane exactly as the user left it.
      const hidden = this.userHidden;
      this.panel.hidden = hidden;
      this.split.hidden = hidden;
      this.navigation?.update();
    }
    watchTabs() {
      // Zotero_Tabs.select() is the only signal for a library/reader switch. Coming back to the
      // library has to put the passport on the library's own selection again, and the item tree
      // may only have been created by then.
      this.tabObserverID = Z.Notifier.registerObserver(this, ['tab']);
      this.applyVisibility();
    }
    notify(event) {
      if (event !== 'select') return;
      this.bindItemSelection();
      this.renderPassport();
    }
    toggle() {
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
    render() {
      if (!this.status) return;
      this.status.textContent = this.app.message;
      this.locked = this.locked.filter((e) => e.isConnected);
      for (const e of this.locked) e.disabled = this.app.busy;
      this.updateSearchControls();
      this.renderAPI();
      this.renderWorkspace();
      // Cheap and idempotent: the item tree does not exist yet when the pane is first mounted,
      // so the binding is retried here until it lands.
      this.bindItemSelection();
      this.renderPassport();
      this.status.hidden = !this.app.message;
      this.cancel.hidden = !this.app.token;
    }
    destroy() {
      this.unbindItemSelection();
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
    root.LensPassportUI,
    root.LensAPIUI,
  );
  root.LensView = View;
})(this);
