import Gio from 'gi://Gio';
import { historyFile, imageFilesToDelete, imagesDir } from './data-paths.ts';

/**
 * Deletes history.json and the PNG files in images/. The preferences
 * window runs in its own process, so it cannot change the history of the
 * extension in memory. The extension sees that history.json is gone and
 * empties its history.
 */
export function clearHistory(userDataDir: string): void {
  const history = Gio.File.new_for_path(historyFile(userDataDir));
  if (history.query_exists(null)) {
    history.delete(null);
  }
  const images = Gio.File.new_for_path(imagesDir(userDataDir));
  // A symbolic link to a directory outside the data directory is not followed.
  if (images.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null) !== Gio.FileType.DIRECTORY) {
    return;
  }
  const children = images.enumerate_children(
    'standard::name,standard::type',
    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
    null,
  );
  const entries = [];
  for (let info = children.next_file(null); info !== null; info = children.next_file(null)) {
    entries.push({ name: info.get_name(), isRegularFile: info.get_file_type() === Gio.FileType.REGULAR });
  }
  children.close(null);
  imageFilesToDelete(entries).forEach((name) => images.get_child(name).delete(null));
}
