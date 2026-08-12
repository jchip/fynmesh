import AveAzulDefault, { type AveAzulClass } from "aveazul";

/**
 * TEMPORARY shim for aveazul's default export typing.
 *
 * aveazul's declarations export the class itself as default, and the class is
 * declared `AveAzul<T> extends Promise<T>`. TypeScript therefore resolves its
 * statics (`resolve`, `all`, ...) to Promise's, which return `Promise<T>` -
 * so the instance extensions this package relies on (`filter`, `map`,
 * `mapSeries`, `timeout`) are not visible and every call site fails to compile.
 *
 * The correctly typed statics do exist, on the exported `AveAzulClass`
 * interface, so re-export the default under that type. This keeps full type
 * safety rather than falling back to `any`.
 *
 * Remove this file once aveazul types its default export as `AveAzulClass`,
 * and import `aveazul` directly again.
 *
 * Note this only started failing when an aveazul copy carrying declarations
 * appeared higher up in node_modules - a version without them resolved to
 * `any` and compiled by accident.
 */
const AveAzul = AveAzulDefault as unknown as AveAzulClass;

export default AveAzul;
