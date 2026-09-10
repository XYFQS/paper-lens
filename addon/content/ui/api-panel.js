(function (root) {
  'use strict';

  /** Saved credentials never enter the DOM: the locked input contains a fixed dummy mask. */
  root.LensAPIUI = {
    mountAPI() {
      this.apiEditing = !this.app.get('secret', '');
      const api = this.section('API 设置', this.apiEditing);
      this.apiSection = api;
      this.url = this.field(api, 'Base URL', 'input', { type: 'url' });
      this.model = this.field(api, '模型', 'input');
      this.key = this.field(api, 'API Key', 'input', {
        type: 'password',
        autocomplete: 'new-password',
      });
      this.loadAPIFields();

      this.apiSave = this.button('保存 API', () => {
        if (!this.apiEditing) {
          this.apiEditing = true;
          this.key.value = '';
          this.app.status('修改 API：密钥留空则保留。');
          return;
        }
        root.LensCore.endpoint(this.url.value);
        if (!this.model.value.trim()) throw Error('请填写模型名称。');
        const newKey = this.key.value.trim();
        if (!newKey && !this.app.get('secret', '')) throw Error('请填写 API Key。');
        if (newKey) this.app.secret(newKey);
        this.app.set('url', this.url.value.trim());
        this.app.set('model', this.model.value.trim());
        this.apiEditing = false;
        this.app.status('API 已保存，可测试连接。');
      });
      this.apiTest = this.button('测试连接', async () => {
        const token = { cancelled: false };
        this.app.token = token;
        this.app.status('测试 API 中…');
        await this.app.request([], token);
        this.app.status('API 连接成功；未发送论文数据。');
      });
      this.apiCancel = this.button('取消修改', () => {
        this.apiEditing = false;
        this.loadAPIFields();
        this.app.status('已恢复保存的 API 配置。');
      });
      this.apiClear = this.button('清除密钥', () => {
        this.app.secret('');
        this.key.value = '';
        this.apiEditing = true;
        this.app.status('已清除密钥，请填写新密钥后保存。');
      });
      api.append(this.row(this.apiSave, this.apiTest), this.row(this.apiCancel, this.apiClear));
    },

    loadAPIFields() {
      this.url.value = this.app.get('url', 'https://api.deepseek.com');
      this.model.value = this.app.get('model', 'deepseek-v4-flash');
      this.key.value = this.apiEditing ? '' : '••••••••';
    },

    renderAPI() {
      if (!this.apiSave) return;
      const saved = Boolean(this.app.get('secret', ''));
      if (!this.apiEditing) this.loadAPIFields();
      for (const input of [this.url, this.model, this.key]) {
        input.readOnly = !this.apiEditing;
        input.setAttribute('aria-readonly', String(!this.apiEditing));
      }
      this.key.placeholder = saved ? '留空保留已存密钥' : '填写 API Key';
      this.apiSave.textContent = this.apiEditing ? '保存 API' : '修改 API';
      this.apiCancel.hidden = !this.apiEditing || !saved;
      this.apiClear.hidden = !this.apiEditing || !saved;
      this.apiTest.disabled = this.app.busy || this.apiEditing;
    },
  };
})(this);
