import { debounce } from "@/lib/redis";

export const COINGECKO_FALLBACK_FETCHES_PER_DAY = 4;
export const COINGECKO_FALLBACK_COOLDOWN_SECONDS = Math.floor(
  24 * 60 * 60 / COINGECKO_FALLBACK_FETCHES_PER_DAY
);

const FALLBACK_KEY_PREFIX = "prices:coingecko:fallback";
const localCooldownUntil = new Map<string, number>();

function buildFallbackKey(id: string): string {
  return `${FALLBACK_KEY_PREFIX}:${id.trim().toLowerCase()}`;
}

function allowByLocalCooldown(id: string): boolean {
  const key = buildFallbackKey(id);
  const now = Date.now();
  const blockedUntil = localCooldownUntil.get(key) ?? 0;
  if (blockedUntil > now) return false;
  localCooldownUntil.set(key, now + COINGECKO_FALLBACK_COOLDOWN_SECONDS * 1000);
  return true;
}

export async function canFetchFromCoinGecko(id: string): Promise<boolean> {
  const normalized = id.trim().toLowerCase();
  if (!normalized) return false;

  try {
    return await debounce(
      buildFallbackKey(normalized),
      COINGECKO_FALLBACK_COOLDOWN_SECONDS
    );
  } catch (error) {
    console.warn(
      `[pricing] Redis cooldown unavailable for "${normalized}", falling back to local cooldown:`,
      error instanceof Error ? error.message : String(error)
    );
    return allowByLocalCooldown(normalized);
  }
}

export async function splitByCoinGeckoCooldown(ids: string[]): Promise<{
  allowed: string[];
  blocked: string[];
}> {
  const allowed: string[] = [];
  const blocked: string[] = [];
  const seen = new Set<string>();

  for (const rawId of ids) {
    const id = rawId.trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    if (await canFetchFromCoinGecko(id)) {
      allowed.push(id);
    } else {
      blocked.push(id);
    }
  }

  return { allowed, blocked };
}
