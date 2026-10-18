type Hooks = {
  acquire: () => void;
  release: () => void;
};

type Claim = Hooks & { ratio: number; active: boolean };

const claims = new Map<string, Claim>();
const visibleRatio = 0.08;

function elect() {
  for (const claim of claims.values()) {
    const should = claim.ratio > visibleRatio;
    if (should && !claim.active) {
      claim.active = true;
      claim.acquire();
    } else if (!should && claim.active) {
      claim.active = false;
      claim.release();
    }
  }
}

export function reportGl(id: string, ratio: number, hooks: Hooks) {
  const current = claims.get(id);
  if (current) {
    current.ratio = ratio;
    current.acquire = hooks.acquire;
    current.release = hooks.release;
  } else {
    claims.set(id, { ratio, active: false, ...hooks });
  }
  elect();
}

export function clearGl(id: string) {
  const claim = claims.get(id);
  claims.delete(id);
  if (claim?.active) {
    claim.active = false;
    claim.release();
  }
}
