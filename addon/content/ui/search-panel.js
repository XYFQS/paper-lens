(function (root) {
  'use strict';

  /** Search form behavior, mixed into LensView. All matching stays in the application layer. */
  root.LensSearchUI = {
    mountSearch() {
      this.finder = this.section('检索文献', true);
      const finder = this.finder;
      this.subheading(finder, '全局搜索', '', 'pl-global-title');
      this.query = this.field(finder, '搜索内容', 'input', {
        type: 'search',
        placeholder: '例如：中国 遥感（空格分隔，同时匹配记忆句与结论）',
      });
      const filterHeading = this.el('div', undefined, { class: 'pl-filter-heading' });
      this.subheading(
        filterHeading,
        '条件搜索',
        '按条目类型、六类研究关键词、年份、期刊或阅读进度筛选。',
        'pl-condition-title',
      );
      this.filterPanel = this.el('div', undefined, { id: 'pl-filters' });
      finder.append(filterHeading, this.filterPanel);
      this.addCondition = this.button('添加条件', () => this.addRule());
      this.removeCondition = this.button('移除此条件', () => this.removeRule());
      this.removeCondition.title = '移除最后添加的条件';
      const actions = this.el('div', undefined, { class: 'pl-rule-actions' });
      actions.append(this.addCondition, this.removeCondition);
      this.filterPanel.append(actions);
      this.mode = this.select(this.filterPanel, '条件关系', [
        ['all', '全部满足'],
        ['any', '任一满足'],
      ]);
      this.rules = this.el('div');
      this.filterPanel.append(this.rules);
      this.updateSearchControls();

      const search = this.button('搜索文献', () =>
        this.app.search(
          this.scope(),
          this.query.value,
          this.ruleValues(),
          this.mode.value,
          this.win,
        ),
      );
      search.className = 'primary pl-search-submit';
      finder.append(search);
      finder.append(this.el('p', '结果显示在 Zotero 主列表。', { class: 'muted' }));
      this.query.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          search.click();
        }
      });
    },

    addRule() {
      const box = this.el('div', undefined, { class: 'pl-rule' });
      const field = this.select(box, '字段', [
        ['itemType', '条目类型'],
        ['topic', '研究主题'],
        ['region', '研究区域'],
        ['object', '研究对象'],
        ['method', '研究方法'],
        ['dataset', '数据来源'],
        ['variable', '指标变量'],
        ['year', '年份'],
        ['journal', '期刊'],
        ['readingStatus', '阅读状态'],
        ['importance', '重要程度'],
        ['role', '在论文中的用途'],
      ]);
      const op = this.select(box, '判断', [
        ['has', '包含 / 是'],
        ['not', '不包含 / 不是'],
      ]);
      const valueBox = this.el('div');
      box.append(valueBox);
      let value;
      const titles = { year: '年份（例如 2024）', journal: '期刊名' };
      const update = () => {
        valueBox.replaceChildren();
        const name = field.value;
        if (name === 'itemType')
          value = this.select(valueBox, '值', [
            ['', '不限'],
            ...root.Zotero.ItemTypes.getTypes()
              .filter((type) => !['note', 'attachment', 'annotation'].includes(type.name))
              .map((type) => [type.name, root.Zotero.ItemTypes.getLocalizedString(type.id)]),
          ]);
        else if (name === 'readingStatus')
          value = this.select(valueBox, '值', root.LensCore.readingStatuses);
        else if (name === 'importance')
          value = this.select(valueBox, '值', root.LensCore.importances);
        else if (name === 'role') value = this.select(valueBox, '值', root.LensCore.roles);
        else value = this.field(valueBox, titles[name] ?? '关键词（支持中英）');
      };
      field.onchange = update;
      update();
      const entry = { box, read: () => ({ field: field.value, op: op.value, value: value.value }) };
      this.rows.push(entry);
      this.rules.append(box);
      this.updateSearchControls();
    },

    removeRule() {
      const entry = this.rows.pop();
      if (!entry) return;
      entry.box.remove();
      this.updateSearchControls();
    },

    updateSearchControls() {
      this.mode.parentElement.hidden = this.rows.length < 2;
      this.removeCondition.disabled = this.app.busy || this.rows.length === 0;
    },

    ruleValues() {
      return this.rows.map((row) => row.read());
    },
  };
})(this);
