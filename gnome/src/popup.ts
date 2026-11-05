import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type { Clipboard } from './clipboard.ts';
import type { Injector } from './injector.ts';
import { PopupList } from './popup-list.ts';
import { commandForKey, pageStep, PopupModel, timeFormat, typeFilterLabel, type PopupCommand } from './popup-model.ts';
import { PopupPreview } from './popup-preview.ts';
import type { HistoryStore } from './store.ts';

export interface PopupServices {
  store: HistoryStore;
  clipboard: Clipboard;
  injector: Injector;
}

interface OpenState {
  backdrop: St.Widget;
  grab: Clutter.Grab;
  model: PopupModel;
  search: St.Entry;
  filterLabel: St.Label;
  list: PopupList;
  preview: PopupPreview;
  unsubscribe: () => void;
}

/**
 * The history popup: a modal box in the middle of the current monitor with
 * the search entry on top, the list on the left and the preview on the
 * right. The search entry keeps the key focus. Its key handler moves the
 * list selection, so the user never moves the focus.
 */
export class HistoryPopup {
  private state: OpenState | null = null;

  constructor(private readonly services: PopupServices) {}

  get isOpen(): boolean {
    return this.state !== null;
  }

  open(): void {
    if (this.state !== null) {
      return;
    }
    const { store } = this.services;
    const monitor = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
    if (!monitor) {
      return;
    }
    const width = Math.round(monitor.width * 0.6);
    const height = Math.round(monitor.height * 0.7);
    const time = timeFormat(GLib.TimeZone.new_local().get_identifier());
    const model = new PopupModel(store.history.entries);
    const imagePath = (id: string) => store.imagePath(id);

    const backdrop = new St.Widget({
      style_class: 'leike-backdrop',
      reactive: true,
      layout_manager: new Clutter.BinLayout(),
      x: monitor.x,
      y: monitor.y,
      width: monitor.width,
      height: monitor.height,
    });
    const box = new St.BoxLayout({
      style_class: 'modal-dialog leike-popup',
      vertical: true,
      reactive: true,
      width,
      height,
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
    });
    backdrop.add_child(box);

    const header = new St.BoxLayout({ style_class: 'leike-header', x_expand: true });
    const search = new St.Entry({ style_class: 'leike-search', hint_text: 'Search clipboard history', can_focus: true, x_expand: true });
    const filterLabel = new St.Label({ text: typeFilterLabel(model.type), style_class: 'leike-type-filter', y_align: Clutter.ActorAlign.CENTER });
    header.add_child(search);
    header.add_child(filterLabel);
    box.add_child(header);

    const body = new St.BoxLayout({ style_class: 'leike-body', x_expand: true, y_expand: true });
    const list = new PopupList(imagePath, time, {
      select: (index) => this.select(index),
      activate: (index) => {
        this.select(index);
        this.activate(false);
      },
      nearEnd: () => this.extendList(),
    });
    list.actor.width = Math.round(width * 0.42);
    const preview = new PopupPreview(imagePath, time, [Math.round(width * 0.5), Math.round(height * 0.5)]);
    body.add_child(list.actor);
    body.add_child(new St.Widget({ style_class: 'leike-separator', y_expand: true }));
    body.add_child(preview.actor);
    box.add_child(body);

    Main.layoutManager.modalDialogGroup.add_child(backdrop);
    const grab = Main.pushModal(backdrop, { actionMode: Shell.ActionMode.POPUP });
    if ((grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0) {
      // Another grab is active, for example a menu that is open.
      Main.popModal(grab);
      backdrop.destroy();
      return;
    }

    const unsubscribe = store.onChanged(() => {
      model.setEntries(store.history.entries);
      this.refreshList(true);
    });
    this.state = { backdrop, grab, model, search, filterLabel, list, preview, unsubscribe };

    backdrop.connect('button-press-event', (_actor, event: Clutter.Event) => {
      if ((global.stage as Clutter.Stage).get_event_actor(event) === backdrop) {
        this.close();
      }
      return Clutter.EVENT_STOP;
    });
    search.clutter_text.connect('text-changed', () => {
      model.setQuery(search.get_text());
      this.refreshList();
    });
    search.clutter_text.connect('key-press-event', (_actor, event: Clutter.Event) => this.onKeyPress(event));

    search.grab_key_focus();
    try {
      this.refreshList();
    } catch (error) {
      console.error(`Leike: cannot show the history popup: ${String(error)}`);
      this.close();
    }
  }

  close(): void {
    const state = this.state;
    if (state === null) {
      return;
    }
    this.state = null;
    state.unsubscribe();
    Main.popModal(state.grab);
    state.backdrop.destroy();
  }

  destroy(): void {
    this.close();
  }

  private onKeyPress(event: Clutter.Event): boolean {
    const modifiers = event.get_state();
    const mods = {
      shift: (modifiers & Clutter.ModifierType.SHIFT_MASK) !== 0,
      ctrl: (modifiers & Clutter.ModifierType.CONTROL_MASK) !== 0,
    };
    const command = commandForKey(Clutter.keyval_name(event.get_key_symbol()) ?? '', mods, this.searchCursorAtEnd());
    if (command === null) {
      return Clutter.EVENT_PROPAGATE;
    }
    this.run(command);
    return Clutter.EVENT_STOP;
  }

  /** True when Delete has no text to delete: no selection, and the cursor is after the last character. */
  private searchCursorAtEnd(): boolean {
    const text = this.state?.search.clutter_text;
    if (!text || text.get_selection()) {
      return false;
    }
    const position = text.get_cursor_position();
    // The cursor position counts characters, and -1 is the end.
    return position === -1 || position === [...text.get_text()].length;
  }

  private run(command: PopupCommand): void {
    const state = this.state;
    if (state === null) {
      return;
    }
    const { model } = state;
    const { store } = this.services;
    switch (command) {
      case 'up':
      case 'down':
      case 'page-up':
      case 'page-down': {
        const step = command.startsWith('page') ? pageStep : 1;
        model.move(command === 'up' || command === 'page-up' ? -step : step);
        this.showSelection();
        break;
      }
      case 'copy':
      case 'paste':
        this.activate(command === 'paste');
        break;
      case 'remove':
        if (model.selectedEntry) {
          store.remove(model.selectedEntry.id);
        }
        break;
      case 'toggle-pin':
        if (model.selectedEntry) {
          store.togglePinned(model.selectedEntry.id);
        }
        break;
      case 'next-type':
      case 'previous-type':
        model.cycleType(command === 'previous-type');
        state.filterLabel.text = typeFilterLabel(model.type);
        this.refreshList();
        break;
      case 'close':
        this.close();
        break;
    }
  }

  private select(index: number): void {
    this.state?.model.select(index);
    this.showSelection();
  }

  /** Copies the selected entry and closes. paste also sends Ctrl+V to the window that gets the focus back. */
  private activate(paste: boolean): void {
    const entry = this.state?.model.selectedEntry;
    if (!entry) {
      return;
    }
    const { store, clipboard, injector } = this.services;
    const copied = clipboard.copyEntryToClipboard(entry, store);
    // The previous window gets the keyboard focus about 1 ms after popModal.
    this.close();
    if (!copied) {
      console.warn(`Leike: the image file of entry ${entry.id} is missing, nothing was copied`);
      return;
    }
    // The watcher skips the own change, so move the entry to the top here.
    store.touch(entry.id);
    if (paste) {
      injector.pasteIntoFocusedWindow().catch((error: unknown) => console.error(`Leike: cannot paste: ${String(error)}`));
    }
  }

  private extendList(): void {
    if (this.state?.model.extend()) {
      this.state.list.sync(this.state.model);
    }
  }

  private refreshList(keepScroll = false): void {
    if (this.state === null) {
      return;
    }
    this.state.list.rebuild(this.state.model, keepScroll);
    this.state.preview.show(this.state.model.selectedEntry);
  }

  private showSelection(): void {
    if (this.state === null) {
      return;
    }
    this.state.list.sync(this.state.model);
    this.state.preview.show(this.state.model.selectedEntry);
  }
}
