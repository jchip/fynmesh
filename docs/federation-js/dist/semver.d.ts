/**
 * @param {string} str version string
 * @returns {(string|number|undefined|[])[]} parsed version
 */
export declare const parseVersion: (str: string) => (string | number | undefined | [])[];
/**
 * @param {string} a version
 * @param {string} b version
 * @returns {boolean} true, iff a < b
 */
export declare const versionLt: (_a: string, _b: string) => boolean;
/**
 * @param {string} str range string
 * @returns {SemVerRange} parsed range
 */
export declare const parseRange: (str: string) => any;
export declare const rangeToString: (range: any) => any;
/**
 * @param {SemVerRange} range version range
 * @param {string} version the version
 * @returns {boolean} if version satisfy the range
 */
export declare const satisfy: (range: any, version: any) => boolean;
//# sourceMappingURL=semver.d.ts.map