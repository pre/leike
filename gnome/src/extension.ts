import type Gio from 'gi://Gio';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { Clipboard } from './clipboard.ts';
import { openPrefsOnFirstRun } from './first-run.ts';
import { Injector } from './injector.ts';
import { Keybindings } from './keybindings.ts';
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

  override enable(): void {
    const settings = this.getSettings();
    this.settings = settings;
    const coreSettings = () => readSettings(settings);

    const store = new HistoryStore({ settings: coreSettings });
    store.load();
    this.store = store;
    this.clipboard = new Clipboard();
    this.watcher = new Watcher(this.clipboard, store, coreSettings);
    const injector = new Injector(() => settings.get_strv('terminal-wm-classes'));
    this.injector = injector;
    this.keybindings = new Keybindings(settings, {
      copy: () => void injector.run('copy'),
      paste: () => void injector.run('paste'),
      cut: () => void injector.run('cut'),
      'open-history': () => this.openHistory(),
    });
    this.maxEntriesHandlerId = settings.connect('changed::max-entries', () => store.prune());
    console.log(`Leike: enabled, ${store.history.entries.length} entries in ${store.historyPath}`);
    openPrefsOnFirstRun(settings, () => this.openPreferences());
  }

  override disable(): void {
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
    console.log('Leike: disabled');
  }

  /** The open-history shortcut calls this. The history popup replaces it. */
  openHistory(): void {
    console.log('Leike: open history (no popup yet)');
  }
}
