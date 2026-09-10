(function (root) {
  'use strict';

  root.LensLibraryUI = {
    mountMetadata() {
      this.indexSection = this.section('1 · 读取文献信息', true);
      this.indexSection.append(this.el('p', '读取条目信息，不读取 PDF 全文。', { class: 'muted' }));
      const update = this.button('读取 / 更新文献', () => this.app.update(this.scope()));
      update.className = 'pl-library-action pl-action-sand';
      this.indexSection.append(update);

      this.aiSection = this.section('2 · 生成研究关键词', true);
      this.aiSection.append(
        this.el('p', '区域、对象、方法：中英双语，每类最多 5 个词。', { class: 'muted' }),
      );
      this.generate = this.button('生成研究关键词', async () => {
        if (!this.app.get('secret', '')) {
          this.selectPage('settings');
          this.apiSection.open = true;
          this.app.status('请先保存 API 配置。');
          return;
        }
        await this.app.analyze(this.scope());
      });
      this.generate.className = 'pl-library-action pl-action-sage';
      this.generate.title = '仅处理缺失关键词，可中断后继续';
      this.cancel = this.el('button', '停止生成', { type: 'button' });
      this.cancel.addEventListener('click', () => this.app.cancel());
      this.aiSection.append(
        this.generate,
        this.cancel,
        this.el('p', '元数据将发送至 API，可能计费。', { class: 'muted' }),
      );
      const goSearch = this.el('button', '去找文献', {
        type: 'button',
        class: 'pl-text-button',
      });
      goSearch.addEventListener('click', () => this.selectPage('search'));
      this.sectionHost.append(goSearch);
    },

    mountLibrarySettings() {
      const settings = this.section('索引与标签', false);
      this.auto = this.select(settings, '元数据更新', [
        ['manual', '手动更新'],
        ['auto', '自动更新整个个人文库'],
      ]);
      this.auto.value = this.app.get('auto', false) ? 'auto' : 'manual';
      this.auto.onchange = () => {
        this.app.set('auto', this.auto.value === 'auto');
        this.app.pending = true;
        this.app.schedule();
        this.app.status('更新方式已保存。');
      };
      settings.append(
        this.el('p', '自动更新不调用 AI。', {
          class: 'muted',
        }),
      );
      this.native = this.select(settings, '标签保存位置', [
        ['private', '仅插件'],
        ['native', '插件 + Zotero 双语标签'],
      ]);
      this.native.value = this.app.get('native', false) ? 'native' : 'private';
      settings.append(
        this.button('保存标签选项', async () => {
          const enabled = this.native.value === 'native';
          this.app.set('native', enabled);
          await this.app.syncTags(!enabled);
          this.app.status(
            enabled
              ? '研究关键词已同步到 Zotero 原生标签。'
              : '关键词仅保存在插件中；已移除本插件添加的原生标签。',
          );
        }),
      );
      settings.append(
        this.el('p', '切回仅插件时，只移除插件添加的原生标签。', {
          class: 'muted',
        }),
      );

      const maintenance = this.section('维护工具', false);
      this.maintenanceSection = maintenance;
      maintenance.append(
        this.row(
          this.button('重建缓存', () => this.app.update({}, true)),
          this.button('重新生成全部关键词', async () => {
            await this.app.analyze(this.scope(), true);
          }),
        ),
      );
      maintenance.append(
        this.el('p', '重建：整个文库。重新生成：当前范围，再次调用 API。', {
          class: 'muted',
        }),
      );
    },
  };
})(this);
