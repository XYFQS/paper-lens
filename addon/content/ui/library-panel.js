(function (root) {
  'use strict';

  root.LensLibraryUI = {
    mountMetadata() {
      this.indexSection = this.section('1 · 读取文献信息', true);
      this.indexSection.append(this.el('p', '读取条目信息，不读取 PDF 全文。', { class: 'muted' }));
      const update = this.button('读取 / 更新文献', () => this.app.update(this.scope()));
      update.className = 'pl-library-action pl-action-sand';
      this.indexSection.append(update);

      this.aiSection = this.section('2 · 生成研究画像', true);
      this.aiSection.append(
        this.el(
          'p',
          '主题、区域、对象、方法、数据来源、指标变量：中英配对，每类最多 5 个；结论最多 3 条。',
          {
            class: 'muted',
          },
        ),
      );
      this.generate = this.button('生成研究画像', async () => {
        if (!this.app.get('secret', '')) {
          this.selectPage('settings');
          this.apiSection.open = true;
          this.app.status('请先保存 API 配置。');
          return;
        }
        await this.app.analyze(this.scope());
      });
      this.generate.className = 'pl-library-action pl-action-sage';
      this.generate.title = '只处理尚未生成或文献信息已变化的条目，可中断后继续';
      this.cancel = this.el('button', '停止生成', { type: 'button' });
      this.cancel.addEventListener('click', () => this.app.cancel());
      this.aiSection.append(
        this.generate,
        this.cancel,
        this.el('p', '只发送题录字段，不发送 PDF、附件与笔记内容。调用可能计费。', {
          class: 'muted',
        }),
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
        ['native', '插件 + Zotero 原生标签'],
      ]);
      this.native.value = this.app.get('native', false) ? 'native' : 'private';
      settings.append(
        this.button('保存标签选项', async () => {
          const enabled = this.native.value === 'native';
          this.app.set('native', enabled);
          await this.app.syncTags(!enabled);
          this.app.status(
            enabled
              ? '已同步英文规范标签（T:: 主题、R:: 区域、O:: 对象、M:: 方法、D:: 数据、V:: 变量）。'
              : '关键词仅保存在插件中；已移除本插件添加的原生标签。',
          );
        }),
      );
      settings.append(
        this.el(
          'p',
          '原生标签只写英文规范名（如 R::China），不会中英各写一套；判定为自动标签，可在 Zotero 标签栏中隐藏。切回仅插件时只移除本插件添加的标签，不会动你手工建立的同名标签。',
          { class: 'muted' },
        ),
      );

      const maintenance = this.section('维护工具', false);
      this.maintenanceSection = maintenance;
      maintenance.append(
        this.row(
          this.button('重建缓存', () => this.app.update({}, true)),
          this.button('重新生成全部画像', async () => {
            await this.app.analyze(this.scope(), true);
          }),
        ),
      );
      maintenance.append(
        this.el('p', '重建：只读取元数据，整个文库。重新生成：当前范围，再次调用 API。', {
          class: 'muted',
        }),
      );
    },
  };
})(this);
