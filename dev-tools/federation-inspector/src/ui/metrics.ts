/**
 * Sizes that both the stylesheet and the layout code need to agree on.
 *
 * The virtual list positions rows by arithmetic, so its row height has to be
 * exactly the height CSS gives a row. Two hardcoded 24s in two files is a bug
 * waiting for someone to change one of them, so the number lives here, the
 * stylesheet interpolates it, and the list imports it.
 */

export type Density = "compact" | "normal" | "relaxed";

/**
 * Type and spacing multiplier.
 *
 * "normal" is the default and is deliberately not as tight as it can be. This
 * panel is read for long stretches while debugging, and the size that fits the
 * most rows is not the size that stays readable -- packing information in only
 * helps up to the point where the eye stops wanting to scan it. "compact" is
 * there for a big monitor and a big registry; "relaxed" for a laptop.
 */
export const SCALE: Record<Density, number> = {
  compact: 0.88,
  normal: 1,
  relaxed: 1.14,
};

/** Row height at scale 1. Everything else in the panel keys off this. */
export const ROW_H_BASE = 32;

export function rowHeight(density: Density): number {
  return Math.round(ROW_H_BASE * SCALE[density]);
}
