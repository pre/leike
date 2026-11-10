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
 * The changes that make the rows of a list show the wanted values: the
 * indexes of the shown rows to remove, then the rows to make with their index
 * in `wanted`, in rising order. A row that stays is not made again, so it
 * keeps the keyboard focus and the page keeps its scroll position.
 */
export function rowChanges(
  shown: readonly string[],
  wanted: readonly string[],
): { remove: number[]; insert: [index: number, value: string][] } {
  const remove: number[] = [];
  const stays = new Set<number>();
  let next = 0;
  shown.forEach((value, index) => {
    const at = wanted.indexOf(value, next);
    if (at === -1) {
      remove.push(index);
    } else {
      stays.add(at);
      next = at + 1;
    }
  });
  return { remove, insert: [...wanted.entries()].filter(([index]) => !stays.has(index)) };
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
