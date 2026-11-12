import type Gio from 'gi://Gio';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { Clipboard } from './clipboard.ts';
import { openPrefsOnFirstRun } from './first-run.ts';
import { Injector } from './injector.ts';
import { Keybindings } from './keybindings.ts';
import { HistoryPopup } from './popup.ts';
import { readSettings } from './settings.ts';
import { HistoryStore } from './store.ts';
import { Watcher } from './watcher.ts';

export default class LeikeExtension extends Extension {
  private settings: Gio.Settings | null = null;
  private maxEntriesHandlerId = 0;
  store: HistoryStore | null = null;
  clipboard: Clipboard | null = null;
  injector: Injector | null = null;
  private watcher: Watcher | null = null;
  private keybindings: Keybindings | null = null;
  popup: HistoryPopup | null = null;

  override enable(): void {
    // GNOME Shell does not call disable() when enable() throws, so remove the parts that started.
    try {
      this.start();
    } catch (error) {
      this.disable();
      throw error;
    }
  }

  override disable(): void {
    this.popup?.destroy();
    this.popup = null;
    this.keybindings?.destroy();
    this.keybindings = null;
    this.injector?.destroy();
    this.injector = null;
    this.watcher?.destroy();
    this.watcher = null;
    this.clipboard?.destroy();
    this.clipboard = null;
    this.store?.destroy();
    this.store = null;
    if (this.maxEntriesHandlerId !== 0) {
      this.settings?.disconnect(this.maxEntriesHandlerId);
      this.maxEntriesHandlerId = 0;
    }
    this.settings = null;
  }

  /** The open-history shortcut calls this. */
  openHistory(): void {
    this.popup?.open();
  }

  private start(): void {
    const settings = this.getSettings();
    this.settings = settings;
    const coreSettings = () => readSettings(settings);

    this.store = new HistoryStore({ settings: coreSettings });
    this.store.load();
    this.maxEntriesHandlerId = settings.connect('changed::max-entries', () => this.store?.prune());
    const clipboard = new Clipboard();
    this.clipboard = clipboard;
    this.watcher = new Watcher(clipboard, this.store, coreSettings);
    this.injector = new Injector(() => settings.get_strv('terminal-wm-classes'), () => clipboard.content());
    this.popup = new HistoryPopup({
      store: this.store,
      clipboard,
      injector: this.injector,
      openPreferences: () => this.openPreferences(),
    });
    this.keybindings = new Keybindings(settings, {
      copy: () => this.injector?.send('copy'),
      paste: () => this.injector?.send('paste'),
      cut: () => this.injector?.send('cut'),
      'open-history': () => this.openHistory(),
    });
    openPrefsOnFirstRun(settings, () => this.openPreferences());
  }
}
