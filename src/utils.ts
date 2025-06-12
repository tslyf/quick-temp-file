/**
 * Normalizes a path by converting backslashes to forward slashes.
 * @param pathToNormalize The path to normalize.
 * @returns The normalized path string.
 */
export function normalizePath(pathToNormalize: string): string {
    const replace: [RegExp, string][] = [
        [/\\/g, '/'],
        [/(\w):/, '/$1'],
        [/(\w+)\/\.\.\/?/g, ''],
        [/^\.\//, ''],
        [/\/\.\//, '/'],
        [/\/\.$/, ''],
        [/\/$/, ''],
    ];

    let currentPath = pathToNormalize;
    replace.forEach(array => {
        while (array[0].test(currentPath)) {
            currentPath = currentPath.replace(array[0], array[1]);
        }
    });
    return currentPath;
}

/**
 * Compares two file paths, ignoring case on Windows.
 * @param path1 The first path.
 * @param path2 The second path.
 * @returns `true` if the paths are considered equal.
 */
export function pathEqual(actual: string, expected: string): boolean {
    if (actual === expected) { return true; }
    
    const normalizedActual = normalizePath(actual);
    const normalizedExpected = normalizePath(expected);

    if (process.platform === "win32") {
        return normalizedActual.toLowerCase() === normalizedExpected.toLowerCase();
    }
    
    return normalizedActual === normalizedExpected;
}