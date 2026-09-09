(function (root) {
  'use strict';

  /** Search form behavior, mixed into LensView. All matching stays in the application layer. */
  root.LensSearchUI = {
    mountSearch() {
      this.finder = this.section('检索文献', true);
      const finder = this.finder;
      this.subheading(finder, '检索范围', '索引、AI 分析与搜索共用此范围。');
      this.scopeSelect = this.select(finder, '文献范围', [['', '整个个人文库']]);
      const refresh = this.button('刷新分类列表', () => this.collections());
      refresh.className = 'pl-quiet';
      finder.append(refresh);
      this.recursive = this.field(finder, '包含子分类', 'input', { type: 'checkbox' });
      this.recursive.parentElement.className = 'pl-check';

      this.subheading(
        finder,
        '全局搜索',
        '搜索所选范围的全部元数据与中英双语关键词。',
        'pl-global-title',
      );
      this.query = this.field(finder, '搜索元数据与双语关键词', 'input', {
        type: 'search',
        placeholder: '例如：中国 植被 / China vegetation',
      });
      this.subheading(finder, '条件筛选', '按条目类型、研究区域、研究对象或研究方法缩小范围。');
      this.mode = this.select(finder, '条件关系', [
        ['all', '满足全部条件（AND）'],
        ['any', '满足任一条件（OR）'],
      ]);
      this.rules = this.el('div');
      finder.append(this.rules);
      this.emptyAdd = this.button('添加条件', () => this.addRule());
      finder.append(this.emptyAdd);
      this.addRule();

      const search = this.button('在主列表显示结果', () =>
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
        ['region', '研究区域'],
        ['subject', '研究对象'],
        ['method', '研究方法'],
      ]);
      const op = this.select(box, '判断', [
        ['has', '包含 / 是'],
        ['not', '不包含 / 不是'],
      ]);
      const valueBox = this.el('div');
      box.append(valueBox);
      let value;
      const update = () => {
        valueBox.replaceChildren();
        value =
          field.value === 'itemType'
            ? this.select(valueBox, '值', [
                ['', '不限'],
                ...root.Zotero.ItemTypes.getTypes()
                  .filter((type) => !['note', 'attachment', 'annotation'].includes(type.name))
                  .map((type) => [type.name, root.Zotero.ItemTypes.getLocalizedString(type.id)]),
              ])
            : this.field(valueBox, '关键词（支持中英）');
      };
      field.onchange = update;
      update();
      const entry = { box, read: () => ({ field: field.value, op: op.value, value: value.value }) };
      this.rows.push(entry);
      const add = this.button('添加条件', () => this.addRule());
      const remove = this.button('移除此条件', () => {
        this.rows = this.rows.filter((row) => row !== entry);
        box.remove();
        this.emptyAdd.hidden = this.rows.length > 0;
      });
      const actions = this.el('div', undefined, { class: 'pl-rule-actions' });
      actions.append(add, remove);
      box.append(actions);
      this.rules.append(box);
      this.emptyAdd.hidden = true;
    },

    ruleValues() {
      return this.rows.map((row) => row.read());
    },
  };
})(this);
