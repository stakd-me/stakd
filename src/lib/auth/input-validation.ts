import type { NextRequest } from "next/server";
import { isIP } from "node:net";

const HEX_RE = /^[0-9a-f]+$/i;
const DEFAULT_TRUST_PROXY = process.env.NODE_ENV !== "production";

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeIpCandidate(raw: string | null): string | null {
  if (!raw) return null;

  let candidate = raw.trim();
  if (!candidate) return null;

  const [fromList] = candidate.split(",");
  candidate = fromList?.trim() ?? "";
  if (!candidate) return null;

  if (candidate.startsWith("[")) {
    const closingBracket = candidate.indexOf("]");
    if (closingBracket > 0) {
      candidate = candidate.slice(1, closingBracket);
    }
  } else {
    const firstColon = candidate.indexOf(":");
    const lastColon = candidate.lastIndexOf(":");
    if (firstColon > -1 && firstColon === lastColon) {
      const host = candidate.slice(0, firstColon).trim();
      const port = candidate.slice(firstColon + 1).trim();
      if (host && /^\d+$/.test(port)) {
        candidate = host;
      }
    }
  }

  return isIP(candidate) ? candidate : null;
}

export function isHexOfByteLength(value: unknown, bytes: number): value is string {
  return typeof value === "string" && value.length === bytes * 2 && HEX_RE.test(value);
}

export function getRequestIp(req: NextRequest): string {
  const trustProxyHeaders = parseBooleanEnv(
    process.env.TRUST_PROXY_IP_HEADERS,
    DEFAULT_TRUST_PROXY
  );

  if (!trustProxyHeaders) return "unknown";

  return (
    normalizeIpCandidate(req.headers.get("x-real-ip")) ||
    normalizeIpCandidate(req.headers.get("x-forwarded-for")) ||
    normalizeIpCandidate(req.headers.get("cf-connecting-ip")) ||
    normalizeIpCandidate(req.headers.get("x-vercel-forwarded-for")) ||
    "unknown"
  );
}
