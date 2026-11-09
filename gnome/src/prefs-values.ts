/** The limits of the History page. */
export const maxEntriesRange = { min: 10, max: 5000, step: 10 } as const;
export const maxImageMiBRange = { min: 1, max: 1024, step: 1 } as const;
export const maxTextKiBRange = { min: 64, max: 65536, step: 64 } as const;

const bytesPerKiB = 1024;
const bytesPerMiB = 1024 * 1024;

export function bytesToKiB(bytes: number): number {
  return Math.round(bytes / bytesPerKiB);
}

export function kibToBytes(kib: number): number {
  return Math.round(kib) * bytesPerKiB;
}

export function bytesToMiB(bytes: number): number {
  return Math.round(bytes / bytesPerMiB);
}

export function mibToBytes(mib: number): number {
  return Math.round(mib) * bytesPerMiB;
}

/**
 * The list with the WM_CLASS added, or the reason why it cannot be added.
 * The injector compares WM_CLASS values without case, so the check does too.
 */
export function addWmClass(
  list: readonly string[],
  input: string,
): { list: string[]; problem: null } | { list: null; problem: string } {
  const wmClass = input.trim();
  if (wmClass === '') {
    return { list: null, problem: 'Type a WM_CLASS value.' };
  }
  if (list.some((value) => value.toLowerCase() === wmClass.toLowerCase())) {
    return { list: null, problem: `${wmClass} is already in the list.` };
  }
  return { list: [...list, wmClass], problem: null };
}

export function removeWmClass(list: readonly string[], wmClass: string): string[] {
  return list.filter((value) => value !== wmClass);
}

/**
 * The version line of the preferences window. A release has `1.2.3` in
 * version-name, a local build has `git-<commit>` (see esbuild.mjs).
 */
export function versionLabel(versionName: string | undefined): string {
  if (versionName === undefined) {
    return 'Leike';
  }
  return versionName.startsWith('git-') ? `Leike ${versionName}` : `Leike v${versionName}`;
}
