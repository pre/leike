export const firstRunDoneSetting = 'first-run-done';

/** The part of Gio.Settings that the first run uses. */
export interface FirstRunSettings {
  get_boolean(key: string): boolean;
  set_boolean(key: string, value: boolean): boolean;
}

/**
 * Opens the preferences window at the first enable, so the user sees the
 * GNOME shortcuts that conflict with the defaults (GNOME uses Super+V for
 * the notification list). Returns true when it opened the window.
 * The setting is set before the window opens, so an error in
 * openPreferences does not open the window again at each login.
 */
export function openPrefsOnFirstRun(settings: FirstRunSettings, openPreferences: () => void): boolean {
  if (settings.get_boolean(firstRunDoneSetting)) {
    return false;
  }
  settings.set_boolean(firstRunDoneSetting, true);
  openPreferences();
  return true;
}
