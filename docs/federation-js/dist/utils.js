export const hasDocument = typeof document !== "undefined";
/**
 *
 * @returns
 */
export function getLastScript() {
    if (hasDocument && document.readyState === "loading") {
        const scripts = document.querySelectorAll("script[src]");
        const lastScript = scripts[scripts.length - 1];
        return lastScript;
    }
    return undefined;
}
/**
 *
 * @returns
 */
export function getCurrentScript() {
    return hasDocument && (document.currentScript || getLastScript());
}
/**
 *
 * @param id
 * @returns
 */
export function startsWithDotSlash(id) {
    return id && id.startsWith("./");
}
/**
 *
 * @param obj
 * @param k
 * @param elem
 */
export function addElementToArrayInObject(obj, k, elem) {
    return !(obj[k] || (obj[k] = [])).includes(elem) && obj[k].push(elem);
}
/**
 *
 * @param obj
 * @returns first key of the object
 */
export function firstObjectKey(obj) {
    return Object.keys(obj)[0];
}
/**
 *
 * @param name
 * @returns container id
 */
export function containerNameToId(name) {
    const containerSigPrefix = "__mf_container_";
    if (name.startsWith(containerSigPrefix)) {
        return name;
    }
    return containerSigPrefix + name;
}
/**
 *
 * @param T
 * @returns new object
 */
export function createObject() {
    return Object.create(null);
}
