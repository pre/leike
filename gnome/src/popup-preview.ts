import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import type { Entry } from '@leike/core';
import { loadImage } from './popup-list.ts';
import { colorCss, fitSize, informationRows, previewText, type TimeFormat } from './popup-model.ts';

/** The right side: the preview of the selected entry and the Information table under it. */
export class PopupPreview {
  readonly actor: St.BoxLayout;
  private readonly scroll: St.ScrollView;
  private readonly content: St.BoxLayout;
  private readonly info: St.BoxLayout;

  /** maxImageSize is the largest image preview in stage pixels. */
  constructor(
    private readonly imagePath: (id: string) => string,
    private readonly time: TimeFormat,
    private readonly maxImageSize: [number, number],
  ) {
    this.actor = new St.BoxLayout({ vertical: true, style_class: 'leike-preview', x_expand: true, y_expand: true });
    this.content = new St.BoxLayout({ vertical: true, style_class: 'leike-preview-content', x_expand: true });
    this.scroll = new St.ScrollView({
      hscrollbar_policy: St.PolicyType.NEVER,
      vscrollbar_policy: St.PolicyType.AUTOMATIC,
      overlay_scrollbars: true,
      y_expand: true,
      child: this.content,
    });
    this.info = new St.BoxLayout({ vertical: true, style_class: 'leike-info', x_expand: true });
    this.actor.add_child(this.scroll);
    this.actor.add_child(this.info);
  }

  show(entry: Entry | null): void {
    this.content.destroy_all_children();
    this.info.destroy_all_children();
    this.scroll.vadjustment.value = 0;
    if (entry === null) {
      return;
    }
    this.buildContent(entry);
    this.info.add_child(new St.Label({ text: 'Information', style_class: 'leike-info-title' }));
    for (const [label, value] of informationRows(entry, Date.now(), this.time)) {
      const row = new St.BoxLayout({ style_class: 'leike-info-row', x_expand: true });
      row.add_child(new St.Label({ text: label, style_class: 'leike-info-label', x_expand: true }));
      row.add_child(new St.Label({ text: value, style_class: 'leike-info-value' }));
      this.info.add_child(row);
    }
  }

  private buildContent(entry: Entry): void {
    if (entry.type === 'image') {
      this.content.add_child(this.buildImage(entry));
      return;
    }
    if (entry.type === 'color') {
      const css = colorCss(entry.text ?? '');
      if (css !== null) {
        this.content.add_child(new St.Widget({ style_class: 'leike-color-swatch', style: `background-color: ${css};` }));
      }
    }
    const styleClass = { file: 'leike-preview-text leike-preview-mono', link: 'leike-preview-text leike-preview-link' }[entry.type as string];
    const label = new St.Label({ text: previewText(entry), style_class: styleClass ?? 'leike-preview-text', x_expand: true });
    // The St typings use a second copy of the Pango typings, so the enum types do not match. The values are the same.
    const text = label.clutter_text as unknown as { line_wrap: boolean; line_wrap_mode: Pango.WrapMode; ellipsize: Pango.EllipsizeMode };
    text.line_wrap = true;
    text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    text.ellipsize = Pango.EllipsizeMode.NONE;
    this.content.add_child(label);
  }

  private buildImage(entry: Entry): Clutter.Actor {
    const scale = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scale_factor;
    const [maxWidth, maxHeight] = this.maxImageSize;
    // The texture cache multiplies the size by the scale, so give it logical pixels.
    const [width, height] = fitSize(entry.image?.width ?? 0, entry.image?.height ?? 0, maxWidth / scale, maxHeight / scale);
    return new St.Bin({
      style_class: 'leike-preview-image',
      x_expand: true,
      x_align: Clutter.ActorAlign.CENTER,
      child: loadImage(this.imagePath(entry.id), Math.max(1, width), Math.max(1, height)),
    });
  }
}
