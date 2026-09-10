(function (root) {
  'use strict';

  root.LensWorkspaceUI = {
    mountWorkspace() {
      const scope = this.el('section', undefined, { class: 'pl-scope', 'aria-label': '文献范围' });
      this.scopeSelect = this.select(scope, '当前文献范围', [['', '整个个人文库']]);
      this.recursive = this.field(scope, '包含子分类', 'input', { type: 'checkbox' });
      this.recursive.parentElement.className = 'pl-check';
      const refresh = this.button('刷新列表', () => this.collections());
      refresh.className = 'pl-text-button';
      scope.append(refresh);
      scope.title = '读取、生成关键词和搜索共用此范围';
      this.body.append(scope);

      this.overview = this.el('p', undefined, { class: 'pl-overview' });
      this.body.append(this.overview);
      const nav = this.el('nav', undefined, {
        class: 'pl-workspace-nav',
        'aria-label': '功能导航',
      });
      this.pages = {};
      this.pageButtons = {};
      for (const [id, label] of [
        ['search', '找文献'],
        ['prepare', '准备文库'],
        ['settings', '设置'],
      ]) {
        const button = this.el('button', label, {
          type: 'button',
          'aria-controls': `pl-page-${id}`,
        });
        button.addEventListener('click', () => this.selectPage(id));
        nav.append(button);
        this.pageButtons[id] = button;
        this.pages[id] = this.el('div', undefined, { id: `pl-page-${id}`, class: 'pl-page' });
      }
      this.body.append(nav);

      const guide = this.el('aside', undefined, {
        class: 'pl-next-step',
        'aria-label': '使用提示',
      });
      this.guide = guide;
      this.nextText = this.el('p');
      this.nextButton = this.el('button', '', { type: 'button', class: 'pl-text-button' });
      this.nextButton.addEventListener('click', () => {
        this.selectPage(this.nextDestination);
        const section = this[this.nextSection];
        if (this.nextDestination !== 'search' && section) section.open = true;
      });
      guide.append(this.nextText, this.nextButton);
      this.body.append(guide);
      this.status = this.el('p', undefined, {
        class: 'pl-status',
        role: 'status',
        'aria-live': 'polite',
      });
      this.body.append(this.status, ...Object.values(this.pages));
    },

    selectPage(id) {
      if (this.page !== id) this.body.scrollTop = 0;
      this.page = id;
      for (const [key, page] of Object.entries(this.pages)) {
        page.hidden = key !== id;
        this.pageButtons[key].setAttribute('aria-pressed', String(key === id));
      }
      this.renderWorkspace();
    },

    renderWorkspace() {
      if (!this.overview) return;
      const records = Object.values(this.app.data.records);
      const complete = records.filter((record) => record.labels).length;
      const configured = Boolean(this.app.get('secret', ''));
      const ready =
        configured && !this.app.cacheError && records.length > 0 && complete === records.length;
      if (ready && !this.app.get('onboardingComplete', false)) {
        this.app.set('onboardingComplete', true);
      }
      this.guide.hidden = this.app.get('onboardingComplete', false);
      let state, label, description;
      if (!configured) {
        state = 'disconnected';
        label = '未连接';
        description = '尚未保存 API 配置。点击连接模型；已有索引仍可进行本地搜索。';
        this.readinessPage = 'settings';
        this.readinessSection = 'apiSection';
      } else if (!ready) {
        state = 'pending';
        label = this.app.cacheError ? '待修复' : '待生成';
        description = this.app.cacheError
          ? '本地索引异常。点击打开维护工具。'
          : !records.length
            ? '先读取文献信息，再生成研究关键词。'
            : `还有 ${records.length - complete} 篇未生成关键词，点击继续准备文库。`;
        this.readinessPage = this.app.cacheError ? 'settings' : 'prepare';
        this.readinessSection = this.app.cacheError
          ? 'maintenanceSection'
          : records.length
            ? 'aiSection'
            : 'indexSection';
      } else {
        state = 'ready';
        label = '已就绪';
        description = '本地已收录文献的关键词已生成，可以开始检索。点击进入搜索。';
        this.readinessPage = 'search';
        this.readinessSection = 'finder';
      }
      this.readiness.dataset.state = state;
      this.readinessText.textContent = label;
      this.readiness.title = description;
      this.readiness.setAttribute('aria-label', `${label}：${description}`);
      this.overview.textContent = `本地已收录 ${records.length} 篇 · 已有研究关键词 ${complete} 篇`;
      if (this.app.cacheError) {
        this.nextText.textContent = '索引异常，请在维护工具中重建缓存。';
        this.nextDestination = 'settings';
        this.nextSection = 'maintenanceSection';
        this.nextButton.textContent = '打开设置';
      } else if (!records.length) {
        this.nextText.textContent = '先读取文献信息，即可搜索。无需 API。';
        this.nextDestination = 'prepare';
        this.nextSection = 'indexSection';
        this.nextButton.textContent = '开始准备文库';
      } else if (!this.app.get('secret', '') && complete < records.length) {
        this.nextText.textContent = '已可搜索。连接模型后，可生成研究关键词。';
        this.nextDestination = 'settings';
        this.nextSection = 'apiSection';
        this.nextButton.textContent = '连接 AI 模型';
      } else if (complete < records.length) {
        this.nextText.textContent = `还有 ${records.length - complete} 篇待生成关键词。`;
        this.nextDestination = 'prepare';
        this.nextSection = 'aiSection';
        this.nextButton.textContent = '生成研究关键词';
      } else {
        this.nextText.textContent = '文库已准备好。输入关键词找文献，或添加条件进行组合筛选。';
        this.nextDestination = 'search';
        this.nextButton.textContent = '开始搜索';
      }
      this.nextButton.hidden = this.page === this.nextDestination;
    },
  };
})(this);
