/*
 * The member nothing imports.
 *
 * It is exposed, so it is a real federated chunk and `combineDist` puts it in
 * the bundle with the rest -- but no code path reaches it, so its module never
 * leaves stage `registered`. That is the whole reason it exists: a bundle whose
 * members were all executed would report the same member count however the
 * count was derived.
 */
export function getInfo(): { name: string; version: string } {
  return { name: "fynapp-bundled", version: "1.0.0" };
}
