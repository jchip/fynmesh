export declare const hasDocument: boolean;
/**
 *
 * @returns
 */
export declare function getLastScript(): Element;
/**
 *
 * @returns
 */
export declare function getCurrentScript(): Element | SVGScriptElement;
/**
 *
 * @param id
 * @returns
 */
export declare function startsWithDotSlash(id: string): boolean;
/**
 *
 * @param obj
 * @param k
 * @param elem
 */
export declare function addElementToArrayInObject<T>(obj: T, k: string, elem: unknown): boolean;
/**
 *
 * @param obj
 * @returns first key of the object
 */
export declare function firstObjectKey(obj: any): string;
/**
 *
 * @param name
 * @returns container id
 */
export declare function containerNameToId(name: string): string;
/**
 *
 * @param T
 * @returns new object
 */
export declare function createObject<T = any>(): T;
//# sourceMappingURL=utils.d.ts.map