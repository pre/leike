import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class LeikeExtension extends Extension {
  override enable(): void {
    console.log(`Leike: enabled ${this.metadata.uuid}`);
  }

  override disable(): void {
    console.log(`Leike: disabled ${this.metadata.uuid}`);
  }
}
