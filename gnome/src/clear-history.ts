import Gio from 'gi://Gio';
import { historyFile, imagesDir } from './data-paths.ts';

/**
 * Deletes history.json and the files in images/. The preferences window
 * runs in its own process, so it cannot change the history of the
 * extension in memory. The extension sees that history.json is gone and
 * empties its history.
 */
export function clearHistory(userDataDir: string): void {
  deleteIfExists(Gio.File.new_for_path(historyFile(userDataDir)));
  const images = Gio.File.new_for_path(imagesDir(userDataDir));
  if (!images.query_exists(null)) {
    return;
  }
  const children = images.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
  for (let info = children.next_file(null); info !== null; info = children.next_file(null)) {
    deleteIfExists(images.get_child(info.get_name()));
  }
  children.close(null);
}

function deleteIfExists(file: Gio.File): void {
  if (file.query_exists(null)) {
    file.delete(null);
  }
}
