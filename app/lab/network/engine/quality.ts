export type QualityTier = 0 | 1 | 2;

/** Desktop cap is 1.5. Lower tiers give a frame-time budget back. */
export function clampedDpr(dpr: number, tier: QualityTier) {
  const cap = tier >= 2 ? 1 : tier === 1 ? 1.25 : 1.5;
  if (!Number.isFinite(dpr) || dpr <= 0) return 1;
  return Math.min(cap, Math.max(1, dpr));
}

export function shadowMapSize(tier: QualityTier) {
  if (tier >= 2) return 0;
  return tier === 1 ? 1024 : 2048;
}

/**
 * Drop a tier after sustained frames slower than 20ms.
 * A single hitch does not change the image.
 */
export function stepQuality(tier: QualityTier, frameMs: number, slow: number) {
  if (frameMs > 20) {
    const nextSlow = slow + 1;
    if (nextSlow >= 15 && tier < 2) return { tier: (tier + 1) as QualityTier, slow: 0 };
    return { tier, slow: nextSlow };
  }
  if (frameMs < 13.5 && tier > 0) {
    const nextSlow = slow - 1;
    if (nextSlow <= -90) return { tier: (tier - 1) as QualityTier, slow: 0 };
    return { tier, slow: nextSlow };
  }
  return { tier, slow: 0 };
}
