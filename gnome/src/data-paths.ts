/**
 * The files of the clipboard history. Both the extension and the
 * preferences window use these paths. `userDataDir` is the value of
 * GLib.get_user_data_dir(): $XDG_DATA_HOME, or ~/.local/share when
 * XDG_DATA_HOME is not set.
 */
export function dataDir(userDataDir: string): string {
  return `${userDataDir.replace(/\/+$/, '')}/leike`;
}

export function historyFile(userDataDir: string): string {
  return `${dataDir(userDataDir)}/history.json`;
}

export function imagesDir(userDataDir: string): string {
  return `${dataDir(userDataDir)}/images`;
}

/** The PNG file of an image entry. The entry id is the file name. */
export function imageFile(userDataDir: string, id: string): string {
  return `${imagesDir(userDataDir)}/${id}.png`;
}
