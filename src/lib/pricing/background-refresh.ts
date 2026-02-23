import { refreshAllPrices } from "@/lib/pricing";
import { debounce } from "@/lib/redis";

const DEFAULT_INTERVAL_MINUTES = 15;
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 24 * 60;
const DEBOUNCE_SECONDS = 60;
const DEBOUNCE_KEY = "prices:refresh";

type SchedulerState = {
  started: boolean;
  intervalMinutes: number;
  timer: ReturnType<typeof setInterval> | null;
  inFlight: boolean;
};

type SchedulerGlobal = typeof globalThis & {
  __priceRefreshScheduler?: SchedulerState;
};

const schedulerGlobal = globalThis as SchedulerGlobal;

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseIntervalMinutes(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < MIN_INTERVAL_MINUTES) {
    return DEFAULT_INTERVAL_MINUTES;
  }
  return Math.min(parsed, MAX_INTERVAL_MINUTES);
}

async function shouldRunRefresh(): Promise<boolean> {
  try {
    return await debounce(DEBOUNCE_KEY, DEBOUNCE_SECONDS);
  } catch (error) {
    console.warn(
      "[pricing] Debounce unavailable for background refresh; proceeding without debounce:",
      error
    );
    return true;
  }
}

async function runRefreshTick(reason: "startup" | "interval"): Promise<void> {
  const state = schedulerGlobal.__priceRefreshScheduler;
  if (!state) return;
  if (state.inFlight) return;
  state.inFlight = true;

  try {
    const shouldRefresh = await shouldRunRefresh();
    if (!shouldRefresh) return;

    await refreshAllPrices();
    console.log(`[pricing] Background refresh completed (${reason})`);
  } catch (error) {
    console.error(
      `[pricing] Background refresh failed (${reason}):`,
      error
    );
  } finally {
    state.inFlight = false;
  }
}

export function startBackgroundPriceRefreshScheduler(): void {
  if (process.env.NODE_ENV === "test") return;
  if (schedulerGlobal.__priceRefreshScheduler?.started) return;

  const enabled = parseBooleanEnv(
    process.env.PRICES_BACKGROUND_REFRESH_ENABLED,
    true
  );
  if (!enabled) {
    console.log("[startup] Background price refresh scheduler disabled");
    schedulerGlobal.__priceRefreshScheduler = {
      started: true,
      intervalMinutes: 0,
      timer: null,
      inFlight: false,
    };
    return;
  }

  const intervalMinutes = parseIntervalMinutes(
    process.env.PRICES_BACKGROUND_REFRESH_MINUTES
  );
  const timer = setInterval(() => {
    void runRefreshTick("interval");
  }, intervalMinutes * 60 * 1000);

  if (typeof timer === "object" && "unref" in timer && typeof timer.unref === "function") {
    timer.unref();
  }

  schedulerGlobal.__priceRefreshScheduler = {
    started: true,
    intervalMinutes,
    timer,
    inFlight: false,
  };

  console.log(
    `[startup] Background price refresh scheduler enabled (${intervalMinutes} minute interval)`
  );
  void runRefreshTick("startup");
}
