import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type { Clipboard } from './clipboard.ts';
import type { Injector } from './injector.ts';
import { PopupList } from './popup-list.ts';
import { commandForKey, pageStep, PopupModel, popupSize, timeFormat, typeFilterLabel, type PopupCommand } from './popup-model.ts';
import { PopupPreview } from './popup-preview.ts';
import type { HistoryStore } from './store.ts';

export interface PopupServices {
  store: HistoryStore;
  clipboard: Clipboard;
  injector: Injector;
  openPreferences: () => void;
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
 * The history popup: a modal box in the middle of the focused window's monitor with
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
    // The focused window gets the paste, so the popup opens on its monitor, not on the monitor of the pointer.
    const focusMonitor = global.display.focus_window?.get_monitor() ?? -1;
    const monitor = Main.layoutManager.monitors[focusMonitor] ?? Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
    if (!monitor) {
      return;
    }
    const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
    const [width, height] = popupSize(monitor.width, monitor.height, scale);
    const time = timeFormat(GLib.TimeZone.new_local().get_identifier());
    const model = new PopupModel(store.history.entries);
    const imagePath = (id: string) => store.imagePath(id);

    // The backdrop covers all monitors, so a click outside the box on any monitor closes the popup.
    // The parent modalDialogGroup takes the size of its child and ignores its position, so the backdrop binds to the stage.
    const backdrop = new St.Widget({ style_class: 'leike-backdrop', reactive: true });
    backdrop.add_constraint(new Clutter.BindConstraint({ source: global.stage, coordinate: Clutter.BindCoordinate.ALL }));
    const box = new St.BoxLayout({
      style_class: 'modal-dialog leike-popup',
      vertical: true,
      reactive: true,
      width,
      height,
      x: monitor.x + Math.round((monitor.width - width) / 2),
      y: monitor.y + Math.round((monitor.height - height) / 2),
    });
    backdrop.add_child(box);

    const header = new St.BoxLayout({ style_class: 'leike-header', x_expand: true });
    const search = new St.Entry({ style_class: 'leike-search', hint_text: 'Search clipboard history', can_focus: true, x_expand: true });
    const filterLabel = new St.Label({ text: typeFilterLabel(model.type), style_class: 'leike-type-filter', y_align: Clutter.ActorAlign.CENTER });
    const settingsButton = new St.Button({
      style_class: 'leike-settings-button',
      child: new St.Icon({ icon_name: 'emblem-system-symbolic', style_class: 'leike-settings-icon' }),
      accessible_name: 'Preferences',
      y_align: Clutter.ActorAlign.CENTER,
    });
    settingsButton.connect('clicked', () => {
      // Close first: the modal popup is above all windows and holds the keyboard.
      this.close();
      this.services.openPreferences();
    });
    header.add_child(search);
    header.add_child(filterLabel);
    header.add_child(settingsButton);
    box.add_child(header);

    const body = new St.BoxLayout({ style_class: 'leike-body', x_expand: true, y_expand: true });
    const list = new PopupList(imagePath, time, {
      select: (index) => this.select(index),
      activate: (index) => {
        this.select(index);
        this.activate(true);
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

    const stage = global.stage as Clutter.Stage;
    // A click outside the box closes the popup on the release, so the window below gets no button event.
    let pressedOutside = false;
    backdrop.connect('button-press-event', (_actor, event: Clutter.Event) => {
      pressedOutside = stage.get_event_actor(event) === backdrop;
      return Clutter.EVENT_STOP;
    });
    backdrop.connect('button-release-event', (_actor, event: Clutter.Event) => {
      if (pressedOutside && stage.get_event_actor(event) === backdrop) {
        this.close();
      }
      pressedOutside = false;
      return Clutter.EVENT_STOP;
    });

    // A press on the box itself, not on the entry or a row, drags the box.
    let drag: { dx: number; dy: number } | null = null;
    box.connect('button-press-event', (_actor, event: Clutter.Event) => {
      if (stage.get_event_actor(event) !== box || event.get_button() !== Clutter.BUTTON_PRIMARY) {
        return Clutter.EVENT_PROPAGATE;
      }
      const [x, y] = event.get_coords();
      drag = { dx: x - box.x, dy: y - box.y };
      return Clutter.EVENT_STOP;
    });
    // Captured, so a row under the pointer cannot take the motion while the box moves.
    // Clutter logs a warning when a handler stops an enter or a leave event.
    backdrop.connect('captured-event', (_actor, event: Clutter.Event) => {
      const type = event.type();
      if (drag === null || type === Clutter.EventType.ENTER || type === Clutter.EventType.LEAVE) {
        return Clutter.EVENT_PROPAGATE;
      }
      if (type === Clutter.EventType.BUTTON_RELEASE) {
        drag = null;
      } else if (type === Clutter.EventType.MOTION) {
        const [x, y] = event.get_coords();
        box.set_position(Math.round(x - drag.dx), Math.round(y - drag.dy));
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
    // popModal gives the focus back to the previous window.
    this.close();
    if (!copied) {
      console.warn(`Leike: the image file of entry ${entry.id} is missing, nothing was copied`);
      return;
    }
    // The watcher skips the own change, so move the entry to the top here.
    store.touch(entry.id);
    if (paste) {
      injector.sendAfterRefocus('paste');
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
