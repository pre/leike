import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {
  brokenHistoryFilesToDelete,
  dataDir,
  historyFile,
  imageFilesToDelete,
  imagesDir,
  type DirectoryChild,
} from './data-paths.ts';

/**
 * Deletes history.json, the copies of a history.json that was not valid,
 * and the PNG files in images/. The preferences window runs in its own
 * process, so it cannot change the history of the extension in memory. The
 * extension sees that history.json is gone and empties its history.
 */
export function clearHistory(userDataDir: string): void {
  deleteIgnoringMissing(Gio.File.new_for_path(historyFile(userDataDir)));
  const data = Gio.File.new_for_path(dataDir(userDataDir));
  brokenHistoryFilesToDelete(childrenOf(data, Gio.FileQueryInfoFlags.NONE)).forEach((name) => deleteIgnoringMissing(data.get_child(name)));
  const images = Gio.File.new_for_path(imagesDir(userDataDir));
  // A symbolic link to a directory outside the data directory is not followed.
  imageFilesToDelete(childrenOf(images, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS)).forEach((name) => deleteIgnoringMissing(images.get_child(name)));
}

/** The children of a directory. Gives none for a path that is not a directory. linkFlags tells if a link to a directory counts. */
function childrenOf(directory: Gio.File, linkFlags: Gio.FileQueryInfoFlags): DirectoryChild[] {
  if (directory.query_file_type(linkFlags, null) !== Gio.FileType.DIRECTORY) {
    return [];
  }
  const enumerator = directory.enumerate_children(
    'standard::name,standard::type',
    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
    null,
  );
  const children: DirectoryChild[] = [];
  for (let info = enumerator.next_file(null); info !== null; info = enumerator.next_file(null)) {
    children.push({ name: info.get_name(), isRegularFile: info.get_file_type() === Gio.FileType.REGULAR });
  }
  enumerator.close(null);
  return children;
}

/**
 * Deletes a file. A missing file is not an error: the extension deletes
 * unused image files when it sees that history.json is gone, possibly a
 * moment before this process does.
 */
export function deleteIgnoringMissing(file: Gio.File): void {
  try {
    file.delete(null);
  } catch (error) {
    if (!(error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))) {
      throw error;
    }
  }
}
