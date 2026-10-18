type Hooks = {
  acquire: () => void;
  release: () => void;
};

type Claim = Hooks & { ratio: number };

const claims = new Map<string, Claim>();
let owner: string | null = null;
let electing = false;

function elect() {
  if (electing) return;
  electing = true;
  try {
    let bestId: string | null = null;
    let best = 0.18;
    for (const [id, claim] of claims) {
      if (claim.ratio > best) {
        best = claim.ratio;
        bestId = id;
      }
    }
    if (bestId === owner) return;
    const previous = owner;
    owner = bestId;
    if (previous) claims.get(previous)?.release();
    if (owner) claims.get(owner)?.acquire();
  } finally {
    electing = false;
  }
}

export function reportGl(id: string, ratio: number, hooks: Hooks) {
  const current = claims.get(id);
  if (current) {
    current.ratio = ratio;
    current.acquire = hooks.acquire;
    current.release = hooks.release;
  } else {
    claims.set(id, { ratio, ...hooks });
  }
  elect();
}

export function clearGl(id: string) {
  const claim = claims.get(id);
  claims.delete(id);
  if (owner === id) {
    owner = null;
    claim?.release();
  }
  elect();
}
