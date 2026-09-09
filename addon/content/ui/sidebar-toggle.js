(function (root) {
  'use strict';

  /** Adds a persistent toggle below Locate in the library and reader navigation rails. */
  class SidebarToggle {
    constructor(view) {
      this.view = view;
      this.entries = [];
      for (const id of ['zotero-view-item-sidenav', 'zotero-context-pane-sidenav']) {
        const rail = view.doc.getElementById(id);
        if (!rail) continue;
        const entry = view.el('div', undefined, { class: 'pl-sidenav-entry' });
        const button = view.el('button', undefined, {
          class: 'pl-sidenav-toggle',
          type: 'button',
          tabindex: '0',
          'aria-controls': 'paper-lens-sidebar',
          'aria-label': '显示或隐藏文献透镜',
        });
        button.append(
          view.el('img', undefined, {
            src: view.app.uri + 'content/icons/paper-lens.png',
            alt: '',
          }),
        );
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          view.toggle();
        });
        // Keep the native rail's arrow-key navigation, but let HTML handle button activation.
        button.addEventListener('keydown', (event) => {
          if ([' ', 'Enter'].includes(event.key)) event.stopPropagation();
        });
        entry.append(button);
        const locate = rail.querySelector('[data-action="locate"]');
        if (locate?.parentElement) locate.parentElement.after(entry);
        else rail.append(entry);
        this.entries.push({ entry, button });
      }
      this.update();
    }

    update() {
      const visible = !this.view.panel.hidden;
      for (const { button } of this.entries) {
        button.setAttribute('aria-pressed', String(visible));
        button.setAttribute('aria-expanded', String(visible));
        button.title = visible ? '隐藏文献透镜' : '显示文献透镜';
      }
    }

    destroy() {
      for (const { entry } of this.entries) entry.remove();
      this.entries = [];
    }
  }

  root.LensSidebarToggle = SidebarToggle;
})(this);
