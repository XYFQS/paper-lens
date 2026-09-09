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
      this.body.append(d);
      return d;
    }
    mount() {
      this.style = this.el('link', undefined, {
        rel: 'stylesheet',
        href: this.app.uri + 'content/style.css',
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
      header.append(heading);
      this.body.append(
        header,
        this.el('p', '从文献中梳理线索，让研究脉络清晰生长。', { class: 'muted pl-intro' }),
      );
      this.status = this.el('p', undefined, {
        class: 'pl-status',
        role: 'status',
        'aria-live': 'polite',
      });
      this.body.append(this.status);
      this.mountSearch();
      this.mountMetadata();
      this.mountPreview();
      this.mountAPI();
      this.menu = this.doc.createXULElement('menuitem');
      this.menu.setAttribute('label', '文献透镜：显示 / 隐藏');
      this.menu.addEventListener('command', () => this.toggle());
      this.doc.getElementById('menu_ToolsPopup').append(this.menu);
      this.keywords.append(
        this.el('p', '在主列表选择论文后，点击“读取所选论文”查看关键词。', { class: 'muted' }),
      );
      this.navigation = new root.LensSidebarToggle(this);
      this.collections();
      this.render();
    }
    mountMetadata() {
      const index = this.section('元数据与 AI 关键词', true);
      this.subheading(index, '元数据索引', '将条目信息保存在本地，方便快速检索。');
      this.auto = this.select(index, '元数据更新', [
        ['manual', '手动更新'],
        ['auto', '自动更新整个个人文库'],
      ]);
      this.auto.value = this.app.get('auto', false) ? 'auto' : 'manual';
      this.auto.onchange = () => {
        this.app.set('auto', this.auto.value === 'auto');
        this.app.pending = true;
        this.app.schedule();
        this.app.status('元数据更新选项已保存。AI 分析始终手动启动。');
      };
      index.append(
        this.row(
          this.button('更新元数据', () => this.app.update(this.scope())),
          this.button('重建缓存', () => this.app.update({}, true)),
        ),
      );
      this.subheading(index, '双语关键词', '提取研究区域、研究对象与研究方法，不读取 PDF 全文。');
      index.append(
        this.row(
          this.button('生成缺失关键词', () => this.app.analyze(this.scope())),
          this.button('重新生成此范围', () => this.app.analyze(this.scope(), true)),
        ),
      );
      this.cancel = this.el('button', '取消 AI');
      this.cancel.onclick = () => this.app.cancel();
      index.append(this.cancel);
      index.append(
        this.el(
          'p',
          '生成会发送此范围的条目元数据给所设 API；不读取 PDF。每批完成即保存，再次生成会继续处理缺失条目。',
          { class: 'muted' },
        ),
      );
      this.subheading(index, '标签保存', '选择仅在插件中保存，或同步到 Zotero 原生标签。');
      this.native = this.select(index, '关键词保存方式', [
        ['private', '仅插件本地缓存'],
        ['native', '缓存 + Zotero 原生双语标签'],
      ]);
      this.native.value = this.app.get('native', false) ? 'native' : 'private';
      index.append(
        this.button('应用保存方式', async () => {
          const enabled = this.native.value === 'native';
          this.app.set('native', enabled);
          await this.app.syncTags(!enabled);
          this.app.status(
            enabled
              ? '双语标签已写入原生标签。'
              : '关键词保留在插件中；仅移除本插件曾添加的原生标签。',
          );
        }),
      );
    }
    mountPreview() {
      const preview = this.section('查看所选论文的关键词');
      this.lang = this.select(preview, '显示语言', [
        ['zh', '中文'],
        ['en', 'English'],
      ]);
      this.lang.value = this.app.get('language', 'zh');
      this.lang.onchange = () => {
        this.app.set('language', this.lang.value);
        this.preview();
      };
      preview.append(this.button('读取所选论文', () => this.preview()));
      this.keywords = this.el('div', undefined, { class: 'pl-keywords', 'aria-live': 'polite' });
      preview.append(this.keywords);
    }
    subheading(parent, title, description, className = '') {
      parent.append(
        this.el('h3', title, { class: className }),
        this.el('p', description, { class: 'muted pl-section-description' }),
      );
    }
    toggle() {
      this.panel.hidden = !this.panel.hidden;
      this.split.hidden = this.panel.hidden;
      this.navigation?.update();
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
      this.renderAPI();
      this.cancel.hidden = !this.app.token;
    }
    destroy() {
      this.navigation?.destroy();
      this.panel?.remove();
      this.split?.remove();
      this.menu?.remove();
      this.style?.remove();
    }
  }
  Object.assign(View.prototype, root.LensSearchUI, root.LensAPIUI);
  root.LensView = View;
})(this);
