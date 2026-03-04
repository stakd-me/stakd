import type { NextRequest } from "next/server";
import { getRequestIp, isHexOfByteLength } from "@/lib/auth/input-validation";

function makeRequest(headers: Record<string, string>): NextRequest {
  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    requestHeaders.set(key, value);
  }
  return { headers: requestHeaders } as NextRequest;
}

describe("isHexOfByteLength", () => {
  it("accepts valid hex of target byte length", () => {
    expect(isHexOfByteLength("ab".repeat(32), 32)).toBe(true);
  });

  it("rejects invalid input", () => {
    expect(isHexOfByteLength("zz".repeat(32), 32)).toBe(false);
    expect(isHexOfByteLength("ab", 32)).toBe(false);
    expect(isHexOfByteLength(123, 32)).toBe(false);
  });
});

describe("getRequestIp", () => {
  const originalTrustProxy = process.env.TRUST_PROXY_IP_HEADERS;

  afterEach(() => {
    process.env.TRUST_PROXY_IP_HEADERS = originalTrustProxy;
  });

  it("returns unknown when proxy headers are not trusted", () => {
    process.env.TRUST_PROXY_IP_HEADERS = "0";
    const req = makeRequest({ "x-forwarded-for": "203.0.113.11" });
    expect(getRequestIp(req)).toBe("unknown");
  });

  it("uses x-real-ip when trusted", () => {
    process.env.TRUST_PROXY_IP_HEADERS = "1";
    const req = makeRequest({ "x-real-ip": "203.0.113.10" });
    expect(getRequestIp(req)).toBe("203.0.113.10");
  });

  it("parses first forwarded ip and strips port", () => {
    process.env.TRUST_PROXY_IP_HEADERS = "1";
    const req = makeRequest({
      "x-forwarded-for": "198.51.100.5:54321, 10.0.0.1",
    });
    expect(getRequestIp(req)).toBe("198.51.100.5");
  });

  it("returns unknown for malformed values", () => {
    process.env.TRUST_PROXY_IP_HEADERS = "1";
    const req = makeRequest({ "x-forwarded-for": "not-an-ip" });
    expect(getRequestIp(req)).toBe("unknown");
  });
});
