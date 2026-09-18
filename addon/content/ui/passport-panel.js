(function (root) {
  'use strict';

  /**
   * Paper Passport: the profile of the paper currently selected in Zotero. Lives inside
   * the search page rather than as a fourth top-level page.
   *
   * It reads as a card by default and only turns into a form after one click on 编辑, so
   * the everyday view carries no inputs, no remove buttons and no maintenance actions. The
   * structure is built once and only text is swapped afterwards, which is what keeps typing
   * in the memory sentence or the keyword boxes uninterrupted by a background refresh.
   */
  root.LensPassportUI = {
    mountPassport() {
      this.passportKey = null;
      this.passportEditing = false;
      this.passportAdding = false;
      this.passport = this.section('文献身份证', true);
      this.passport.classList.add('pl-passport');

      // 论文身份: the title, one bibliographic line, optional status badges, one action.
      const head = this.el('div', undefined, { class: 'pl-passport-head' });
      this.passportTitle = this.el('p', undefined, { class: 'pl-paper-title' });
      this.passportMeta = this.el('p', undefined, { class: 'pl-passport-meta' });
      this.passportIdentity = this.el('span', undefined, { class: 'pl-identity' });
      this.passportBadges = this.el('span', undefined, { class: 'pl-badges' });
      this.passportMeta.append(this.passportIdentity, this.passportBadges);
      this.editButton = this.el('button', '编辑', { type: 'button', class: 'pl-passport-edit' });
      this.editButton.addEventListener('click', () => this.togglePassportEditing());
      head.append(this.passportTitle, this.editButton, this.passportMeta);
      this.passportHint = this.el('p', undefined, { class: 'muted pl-passport-hint' });
      this.passport.append(head, this.passportHint);

      // 记忆句: shown as text, and offered as one input once the passport is being edited.
      const memory = this.passportBlock('记忆句');
      this.memoryView = this.el('p', undefined, { class: 'pl-memory-view' });
      this.memoryEdit = this.el('div', undefined, { class: 'pl-memory-edit' });
      this.memoryInput = this.el('input', undefined, {
        type: 'text',
        class: 'pl-memory-input',
        'aria-label': '记忆句',
      });
      this.locked.push(this.memoryInput);
      this.memoryRestore = this.passportLink('恢复自动生成', async () => {
        this.memoryInput.value = '';
        await this.app.setMemorySentence(this.passportKey, '');
      });
      this.memoryEdit.append(this.memoryInput, this.memoryRestore);
      memory.append(this.memoryView, this.memoryEdit);

      // 研究画像: one label plus chips row per dimension. The English sub-headings are gone:
      // 研究主题 / 研究区域 / 研究对象 / 研究方法 / 数据来源 / 指标变量 already say it, and
      // each chip carries both languages as one term.
      const profile = this.passportBlock('研究画像');
      this.dims = {};
      const dimBox = this.el('div', undefined, { class: 'pl-dims' });
      for (const kind of root.LensCore.categories) {
        const chips = this.el('span', undefined, { class: 'pl-chips' });
        dimBox.append(this.factRow(root.LensCore.labels.zh[kind], chips));
        this.dims[kind] = chips;
      }
      // One shared add area for all six dimensions, folded away until it is asked for.
      this.kwAdd = this.el('div', undefined, { class: 'pl-kw-add' });
      this.addToggle = this.el('button', '添加关键词', { type: 'button', class: 'pl-link-button' });
      this.addToggle.addEventListener('click', () => {
        this.passportAdding = !this.passportAdding;
        this.renderPassport();
      });
      this.addForm = this.el('div', undefined, { class: 'pl-kw-form' });
      this.addKind = this.select(
        this.addForm,
        '类别',
        root.LensCore.categories.map((kind) => [kind, root.LensCore.labels.zh[kind]]),
      );
      this.addZh = this.field(this.addForm, '中文', 'input', { type: 'text' });
      this.addEn = this.field(this.addForm, 'English', 'input', { type: 'text' });
      this.addSubmit = this.button('添加', async () => {
        // Both languages are captured before the write, and the boxes are cleared only once
        // it succeeded, so a rejected pair is never silently lost.
        const word = { zh: this.addZh.value, en: this.addEn.value },
          kind = this.addKind.value;
        if (!word.zh.trim() || !word.en.trim()) {
          this.app.status('请同时填写中文和英文。');
          return;
        }
        await this.app.correctKeyword(this.passportKey, kind, { add: word });
        this.addZh.value = '';
        this.addEn.value = '';
      });
      this.addForm.append(this.addSubmit);
      // One restore for the whole profile instead of one per category: edit mode stays
      // short, and the action only appears when there is something to undo.
      this.restoreAll = this.passportLink('恢复 AI 原始画像', () =>
        this.app.resetKeywordCorrections(this.passportKey),
      );
      this.restoreAll.title = '清除你手动添加或停用的全部关键词，回到 AI 的原始结果';
      this.kwAdd.append(this.addToggle, this.addForm);
      profile.append(dimBox, this.kwAdd, this.restoreAll);

      const findings = this.passportBlock('主要结论');
      this.findingsList = this.el('ol', undefined, { class: 'pl-findings' });
      this.findingsEmpty = this.el('p', '—', { class: 'pl-empty' });
      findings.append(this.findingsList, this.findingsEmpty);

      // 文献管理: the fields only the user decides. AI never writes any of them.
      const manage = this.passportBlock('文献管理');
      this.workflowView = this.el('div', undefined, { class: 'pl-dims' });
      this.readingPill = this.el('span', undefined, { class: 'pl-chips' });
      this.importancePill = this.el('span', undefined, { class: 'pl-chips' });
      this.usePills = this.el('span', undefined, { class: 'pl-chips' });
      this.workflowView.append(
        this.factRow('阅读状态', this.readingPill),
        this.factRow('重要程度', this.importancePill),
        this.factRow('论文用途', this.usePills),
      );
      this.workflowEdit = this.el('div', undefined, { class: 'pl-workflow-edit' });
      const selects = this.el('div', undefined, { class: 'pl-workflow-selects' });
      // Each control snapshots its own value before starting work: starting a run refreshes
      // the status line, which re-renders the fields from the stored record and would
      // otherwise put the previous value back before it is read.
      this.readingSelect = this.select(selects, '阅读状态', root.LensCore.readingStatuses);
      this.readingSelect.onchange = () => {
        const readingStatus = this.readingSelect.value;
        return this.app.run(() => this.app.setWorkflow(this.passportKey, { readingStatus }));
      };
      this.importanceSelect = this.select(selects, '重要程度', root.LensCore.importances);
      this.importanceSelect.onchange = () => {
        const importance = this.importanceSelect.value;
        return this.app.run(() => this.app.setWorkflow(this.passportKey, { importance }));
      };
      this.useBox = this.el('div', undefined, { class: 'pl-uses' });
      this.useChips = [];
      for (const [value, label] of root.LensCore.roles) {
        const b = this.el('button', label, { type: 'button', class: 'pl-use' });
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => {
          // The pressed state is read before the run re-renders the buttons from storage.
          const on = b.getAttribute('aria-pressed') !== 'true',
            roles = this.selectedUses().filter((v) => v !== value);
          if (on) roles.push(value);
          return this.app.run(() => this.app.setWorkflow(this.passportKey, { roles }));
        });
        this.useBox.append(b);
        this.useChips.push([value, b]);
        this.locked.push(b);
      }
      this.workflowEdit.append(
        selects,
        this.el('p', '论文用途', { class: 'pl-dim-label pl-use-title' }),
        this.useBox,
      );
      manage.append(this.workflowView, this.workflowEdit);

      this.passportObserverID = root.Zotero.Notifier.registerObserver(
        { notify: (event) => event === 'select' && this.renderPassport() },
        ['item'],
        'paper-lens-passport',
      );
      this.renderPassport();
    },

    /** One passport section: a small heading over a hairline, never a card inside a card. */
    passportBlock(title) {
      const box = this.el('div', undefined, { class: 'pl-block' });
      box.append(this.el('h4', title, { class: 'pl-block-title' }));
      this.passport.append(box);
      return box;
    },

    /** A low-emphasis action, sized like text rather than like a primary button. */
    passportLink(text, fn) {
      const b = this.button(text, fn);
      b.classList.add('pl-link-button');
      return b;
    },

    /** A label and its value share one row, which is what makes the card scannable. */
    factRow(label, value) {
      const row = this.el('div', undefined, { class: 'pl-dim' });
      row.append(this.el('span', label, { class: 'pl-dim-label' }), value);
      return row;
    },

    pill(text, className = 'pl-pill') {
      return this.el('span', text, { class: className });
    },

    /** The dash that marks an empty field, so a gap never looks like a missing row. */
    empty() {
      return this.el('span', '—', { class: 'pl-empty' });
    },

    optionLabel(options, value) {
      const found = options.find(([v]) => v === value);
      return found ? found[1] : value;
    },

    /**
     * 编辑 opens the controls, 完成 closes them and is also what commits the memory
     * sentence: it is the one field without a save button of its own.
     */
    togglePassportEditing() {
      if (!this.passportEditing) return this.setPassportEditing(true);
      const key = this.passportKey,
        text = this.memoryInput.value,
        current = key
          ? (root.LensCore.workflow(this.app.record(key)).memorySentenceOverride ?? '')
          : '';
      this.setPassportEditing(false);
      if (key && text !== current) return this.app.run(() => this.app.setMemorySentence(key, text));
    },

    setPassportEditing(on) {
      this.passportEditing = on;
      // Leaving edit mode closes the keyword form along with it.
      this.passportAdding = false;
      this.renderPassport();
    },

    /** The paper to describe: the reader's paper if a reader tab is up, else the selection. */
    passportItem() {
      const Z = root.Zotero;
      let item = this.win.ZoteroPane?.getSelectedItems?.()[0];
      const reader = Z.Reader.getByTabID(this.win.Zotero_Tabs.selectedID);
      if (reader) item = Z.Items.get(reader.itemID);
      if (item?.parentID) item = Z.Items.get(item.parentID);
      return item ?? null;
    },

    selectedUses() {
      return this.useChips
        .filter(([, b]) => b.getAttribute('aria-pressed') === 'true')
        .map(([value]) => value);
    },

    chip(word, kind, manual) {
      const e = this.el('span', undefined, {
        class: 'pl-chip' + (manual ? ' pl-chip-manual' : ''),
      });
      e.append(this.el('span', word.zh, { class: 'pl-chip-zh' }));
      if (root.LensCore.fold(word.en) !== root.LensCore.fold(word.zh))
        e.append(this.el('span', word.en, { class: 'pl-chip-en' }));
      // Removing a term belongs to edit mode only; the everyday card carries no controls.
      if (!this.passportEditing) return e;
      const remove = this.el('button', '×', { type: 'button', class: 'pl-chip-remove' });
      remove.title = manual
        ? '移除这个手动添加的关键词'
        : '不使用这个 AI 关键词；AI 重新生成后也不会再出现';
      remove.setAttribute('aria-label', `移除 ${word.zh}`);
      remove.addEventListener('click', () =>
        this.app.run(() => this.app.correctKeyword(this.passportKey, kind, { remove: word })),
      );
      e.append(remove);
      return e;
    },

    renderPassport() {
      if (!this.passport) return;
      const C = root.LensCore,
        item = this.passportItem(),
        record = item ? this.app.record(item.key) : null,
        first = this.passportKey !== (record?.key ?? null);
      if (first) {
        // Another paper always opens as a card, never mid-edit on the previous one.
        this.passportEditing = false;
        this.passportAdding = false;
      }
      this.passportKey = record?.key ?? null;
      this.passportTitle.textContent =
        record?.metadata?.title || item?.getField?.('title') || '请在主列表选择一篇论文。';

      const editing = this.passportEditing && !!record,
        manual = record ? C.manualSet(record.manual) : null,
        corrected =
          !!manual &&
          C.categories.some((k) => manual.additions[k].length > 0 || manual.removals[k].length > 0);
      this.memoryView.hidden = editing;
      this.memoryEdit.hidden = !editing;
      this.kwAdd.hidden = !editing;
      this.addForm.hidden = !this.passportAdding;
      this.workflowView.hidden = editing;
      this.workflowEdit.hidden = !editing;
      this.restoreAll.hidden = !editing || !corrected;
      this.editButton.hidden = !record;
      this.editButton.textContent = editing ? '完成' : '编辑';
      this.editButton.title = editing
        ? '收起编辑控件，回到信息卡片'
        : '修改记忆句、研究画像与文献管理字段';
      this.addToggle.setAttribute('aria-expanded', String(this.passportAdding));

      if (!record) {
        this.passportHint.textContent = item
          ? '这篇论文尚未建立本地索引，请到「文库」读取文献信息。'
          : '在主列表点选一篇论文，或打开它的阅读器。';
        this.passportHint.hidden = false;
        this.passportIdentity.textContent = '';
        this.passportBadges.replaceChildren();
        this.passportMeta.hidden = true;
        this.memoryView.textContent = '—';
        this.memoryInput.value = '';
        this.memoryInput.placeholder = '手动填写记忆句';
        this.findingsList.hidden = true;
        this.findingsEmpty.hidden = false;
        this.readingPill.replaceChildren();
        this.importancePill.replaceChildren();
        this.usePills.replaceChildren(this.empty());
        this.renderKeywords(null);
        return;
      }

      const stale = this.app.stale(record.key),
        legacy = record.analysis?.status === 'legacy-partial',
        hints = [];
      if (stale) hints.push('文献信息已变化，建议重新生成画像。');
      if (legacy) hints.push('这是从旧版本迁移的关键词，只有区域、对象、方法三类。');
      if (record.analysis?.status === 'none') hints.push('尚未生成画像。');
      this.passportHint.textContent = hints.join(' ');
      this.passportHint.hidden = !hints.length;

      const metadata = record.metadata ?? {},
        workflow = C.workflow(record),
        parts = [C.author(metadata), C.year(metadata), C.journal(metadata)].filter(Boolean),
        badges = [];
      if (workflow.readingStatus !== 'unread')
        badges.push(
          this.pill(this.optionLabel(C.readingStatuses, workflow.readingStatus), 'pl-badge'),
        );
      if (workflow.importance !== 'normal')
        badges.push(this.pill(this.optionLabel(C.importances, workflow.importance), 'pl-badge'));
      this.passportIdentity.textContent = parts.join(' · ');
      this.passportBadges.replaceChildren(...badges);
      this.passportMeta.hidden = !parts.length && !badges.length;

      const auto = C.autoMemorySentence(record),
        sentence = C.memorySentence(record);
      this.memoryView.textContent = sentence || '—';
      // The automatic sentence stays reachable as the placeholder, so edit mode needs no
      // second paragraph explaining where the sentence comes from.
      this.memoryInput.placeholder = auto || '手动填写记忆句';
      if (first || this.doc.activeElement !== this.memoryInput)
        this.memoryInput.value = workflow.memorySentenceOverride ?? '';

      this.readingSelect.value = workflow.readingStatus;
      this.importanceSelect.value = workflow.importance;
      for (const [value, b] of this.useChips)
        b.setAttribute('aria-pressed', String(workflow.roles.includes(value)));
      this.readingPill.replaceChildren(
        this.pill(this.optionLabel(C.readingStatuses, workflow.readingStatus)),
      );
      this.importancePill.replaceChildren(
        this.pill(this.optionLabel(C.importances, workflow.importance)),
      );
      this.usePills.replaceChildren(
        ...(workflow.roles.length
          ? workflow.roles.map((v) =>
              this.pill(this.optionLabel(C.roles, v), 'pl-chip pl-chip-view'),
            )
          : [this.empty()]),
      );

      const findings = record.analysis?.findings ?? [];
      this.findingsList.hidden = !findings.length;
      this.findingsEmpty.hidden = !!findings.length;
      this.findingsList.replaceChildren(
        ...findings.map((f) => {
          const line = this.el('li', undefined, { class: 'pl-finding' });
          line.append(this.el('span', f.zh, { class: 'pl-finding-zh' }));
          // A conclusion whose two languages read the same is shown once.
          if (root.LensCore.fold(f.en) !== root.LensCore.fold(f.zh))
            line.append(this.el('span', f.en, { class: 'pl-finding-en' }));
          return line;
        }),
      );
      this.renderKeywords(record);
    },

    renderKeywords(record) {
      const C = root.LensCore,
        effective = record ? C.effective(record) : null,
        manual = record ? C.manualSet(record.manual) : null;
      for (const kind of C.categories) {
        const words = effective?.[kind] ?? [];
        this.dims[kind].replaceChildren(
          ...(words.length
            ? words.map((word) =>
                this.chip(
                  word,
                  kind,
                  manual.additions[kind].some((p) => C.samePair(p, word)) &&
                    !(record?.analysis?.keywords?.[kind] ?? []).some((p) => C.samePair(p, word)),
                ),
              )
            : [this.empty()]),
        );
      }
    },
  };
})(this);
