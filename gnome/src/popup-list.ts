import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import type { Entry, EntryType } from '@leike/core';
import { ensureActorVisibleInScrollView } from 'resource:///org/gnome/shell/misc/animationUtils.js';
import { listItems, rowTitle, type PopupModel, type TimeFormat } from './popup-model.ts';

const typeIcons: Record<EntryType, string> = {
  text: 'edit-paste-symbolic',
  link: 'insert-link-symbolic',
  color: 'color-select-symbolic',
  file: 'folder-documents-symbolic',
  image: 'image-x-generic-symbolic',
};

const thumbnailWidth = 32;
const thumbnailHeight = 24;
/** Build the next chunk when the end of the list is nearer than this. */
const extendMarginPx = 300;

export interface ListCallbacks {
  select: (index: number) => void;
  activate: (index: number) => void;
  /** The user scrolled near the end of the rows. */
  nearEnd: () => void;
}

/** The left side: entry rows grouped by day, in a scroll view. Builds only the rows of model.rendered. */
export class PopupList {
  readonly actor: St.ScrollView;
  private readonly box: St.BoxLayout;
  private rows: St.Widget[] = [];
  private selected = -1;
  private lastClick: { index: number; time: number } | null = null;

  constructor(
    private readonly imagePath: (id: string) => string,
    private readonly time: TimeFormat,
    private readonly callbacks: ListCallbacks,
  ) {
    this.box = new St.BoxLayout({ vertical: true, style_class: 'leike-list-box', x_expand: true });
    this.actor = new St.ScrollView({
      style_class: 'leike-list',
      hscrollbar_policy: St.PolicyType.NEVER,
      vscrollbar_policy: St.PolicyType.AUTOMATIC,
      overlay_scrollbars: true,
      // Explicit, else the x_expand of the box goes up to the scroll view and the list takes a share of the extra width.
      x_expand: false,
      y_expand: true,
      child: this.box,
    });
    this.actor.vadjustment.connect('notify::value', (adjustment: St.Adjustment) => {
      if (adjustment.upper - (adjustment.value + adjustment.page_size) < extendMarginPx) {
        this.callbacks.nearEnd();
      }
    });
  }

  /** Removes all rows and builds the rows of model.rendered. keepScroll is for a history change while the popup is open. */
  rebuild(model: PopupModel, keepScroll = false): void {
    const scroll = keepScroll ? this.actor.vadjustment.value : 0;
    this.box.destroy_all_children();
    this.rows = [];
    this.selected = -1;
    this.actor.vadjustment.value = scroll;
    if (model.visible.length === 0) {
      this.box.add_child(new St.Label({ text: model.query === '' && model.type === null ? 'No clipboard history' : 'No matches', style_class: 'leike-empty' }));
    }
    this.sync(model);
  }

  /** Adds the rows of model.rendered that are not built yet, and shows the selection. */
  sync(model: PopupModel): void {
    const to = Math.min(model.renderLimit, model.visible.length);
    if (to > this.rows.length) {
      const todayKey = this.time.dayKey(Date.now());
      for (const item of listItems(model.visible, this.rows.length, to, this.time.dayKey, todayKey)) {
        if (item.kind === 'header') {
          this.box.add_child(new St.Label({ text: item.label, style_class: 'leike-day-header' }));
        } else {
          const row = this.buildRow(item.entry, item.index);
          this.rows.push(row);
          this.box.add_child(row);
        }
      }
    }
    this.showSelected(model.selected);
  }

  private showSelected(index: number): void {
    if (index === this.selected) {
      return;
    }
    this.rows[this.selected]?.remove_style_pseudo_class('selected');
    this.selected = index;
    const row = this.rows[index];
    if (row !== undefined) {
      row.add_style_pseudo_class('selected');
      this.scrollTo(row);
    }
  }

  private scrollTo(row: St.Widget): void {
    if (row.has_allocation()) {
      ensureActorVisibleInScrollView(this.actor, row);
      return;
    }
    // A new row has no position before the next layout.
    const handlerId = row.connect('notify::allocation', () => {
      row.disconnect(handlerId);
      if (this.rows[this.selected] === row) {
        ensureActorVisibleInScrollView(this.actor, row);
      }
    });
  }

  private buildRow(entry: Entry, index: number): St.Widget {
    const row = new St.BoxLayout({ style_class: 'leike-row', reactive: true, x_expand: true });
    row.add_child(this.buildIcon(entry));

    // St.Label is one line and ellipsizes at the end by default.
    row.add_child(new St.Label({ text: rowTitle(entry), style_class: 'leike-row-title', x_expand: true, y_align: Clutter.ActorAlign.CENTER }));
    if (entry.app?.name) {
      row.add_child(new St.Label({ text: entry.app.name, style_class: 'leike-row-app', y_align: Clutter.ActorAlign.CENTER }));
    }
    if (entry.pinned) {
      row.add_child(new St.Icon({ icon_name: 'view-pin-symbolic', style_class: 'leike-row-pin', y_align: Clutter.ActorAlign.CENTER }));
    }

    // Motion, not hover: hover also changes when the list scrolls under a still pointer.
    row.connect('motion-event', () => {
      if (this.selected !== index) {
        this.callbacks.select(index);
      }
      return Clutter.EVENT_PROPAGATE;
    });
    row.connect('button-press-event', (_row, event: Clutter.Event) => {
      if (event.get_button() !== Clutter.BUTTON_PRIMARY) {
        return Clutter.EVENT_PROPAGATE;
      }
      // Clutter 14 events have no click count.
      const time = event.get_time();
      const doubleClick = this.lastClick?.index === index && time - this.lastClick.time <= Clutter.Settings.get_default().double_click_time;
      this.lastClick = doubleClick ? null : { index, time };
      if (doubleClick) {
        this.callbacks.activate(index);
      } else {
        this.callbacks.select(index);
      }
      return Clutter.EVENT_STOP;
    });
    return row;
  }

  private buildIcon(entry: Entry): Clutter.Actor {
    const bin = new St.Bin({ style_class: 'leike-row-icon-bin', y_align: Clutter.ActorAlign.CENTER });
    if (entry.type === 'image') {
      bin.set_child(loadImage(this.imagePath(entry.id), thumbnailWidth, thumbnailHeight));
    } else {
      bin.set_child(new St.Icon({ icon_name: typeIcons[entry.type], style_class: 'leike-row-icon' }));
    }
    return bin;
  }
}

/**
 * Loads a PNG file through the St texture cache. The actor gets the image when
 * the load is done. The size is in logical pixels, and the image keeps its
 * aspect ratio inside it. No GLib.Bytes goes through JavaScript.
 */
export function loadImage(path: string, width: number, height: number): Clutter.Actor {
  const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
  // The St typings use a second copy of the Gio typings, so the File types do not match.
  const file = Gio.File.new_for_path(path) as unknown as Parameters<St.TextureCache['load_file_async']>[0];
  return St.TextureCache.get_default().load_file_async(file, width, height, scale, 1);
}
