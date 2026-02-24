import { useAuthStore } from "@/lib/store";

let refreshInFlight: Promise<boolean> | null = null;

/**
 * JWT-aware fetch wrapper.
 * Auto-attaches Authorization header and handles token refresh on 401.
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const { accessToken } = useAuthStore.getState();

  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let res = await fetch(url, { ...options, headers });

  // If 401, attempt token refresh
  if (res.status === 401) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      // Retry with new token
      const newToken = useAuthStore.getState().accessToken;
      if (newToken) {
        headers.set("Authorization", `Bearer ${newToken}`);
      }
      res = await fetch(url, { ...options, headers });
    } else {
      // Refresh failed — clear auth state
      useAuthStore.getState().clearAuth();
    }
  }

  return res;
}

async function attemptTokenRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        // Single-flight refresh to avoid concurrent token rotation races.
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "same-origin",
        });
        if (!res.ok) return false;

        const data = await res.json();
        useAuthStore.getState().setAuth(data.userId, data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}
