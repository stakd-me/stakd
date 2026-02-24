import type { NextRequest } from "next/server";

const HEX_RE = /^[0-9a-f]+$/i;

export function isHexOfByteLength(value: unknown, bytes: number): value is string {
  return typeof value === "string" && value.length === bytes * 2 && HEX_RE.test(value);
}

export function getRequestIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (!forwardedFor) return "unknown";
  const [firstIp] = forwardedFor.split(",");
  return firstIp?.trim() || "unknown";
}
