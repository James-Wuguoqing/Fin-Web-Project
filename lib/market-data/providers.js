import { withPersistentCache } from "../persistent-cache";
import {
  ALPHA_REQUEST_INTERVAL_MS,
  ALPHA_VANTAGE_API_KEY,
  FRED_API_KEY,
  LIVE_REFRESH_MS,
  LIVE_REVALIDATE_SECONDS,
  MACRO_REFRESH_MS,
  MACRO_REVALIDATE_SECONDS,
  TWELVE_DATA_API_KEY,
  alphaBaseUrl,
  fredBaseUrl,
  twelveDataBaseUrl
} from "./config";

function toSearchParams(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  return searchParams.toString();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.text();
}

function getAlphaThrottleState() {
  if (!globalThis.__alphaVantageThrottle) {
    globalThis.__alphaVantageThrottle = {
      chain: Promise.resolve(),
      lastRequestAt: 0
    };
  }

  return globalThis.__alphaVantageThrottle;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function scheduleAlphaRequest(task) {
  const throttle = getAlphaThrottleState();

  const scheduled = throttle.chain.then(async () => {
    const delay = Math.max(0, throttle.lastRequestAt + ALPHA_REQUEST_INTERVAL_MS - Date.now());

    if (delay > 0) {
      await wait(delay);
    }

    throttle.lastRequestAt = Date.now();
    return task();
  });

  throttle.chain = scheduled.catch(() => undefined);
  return scheduled;
}

export async function fetchAlphaVantage(params) {
  if (!ALPHA_VANTAGE_API_KEY) {
    throw new Error("Missing ALPHA_VANTAGE_API_KEY");
  }

  const url = `${alphaBaseUrl}?${toSearchParams({
    ...params,
    apikey: ALPHA_VANTAGE_API_KEY
  })}`;

  const cacheKey = `alpha:${url}`;

  return withPersistentCache(
    cacheKey,
    LIVE_REFRESH_MS,
    async () => {
      const data = await scheduleAlphaRequest(() =>
        fetchJson(url, {
          next: { revalidate: LIVE_REVALIDATE_SECONDS }
        })
      );

      if (data.Note || data.Information || data["Error Message"]) {
        throw new Error(data.Note || data.Information || data["Error Message"]);
      }

      return data;
    },
    { allowStaleOnError: true }
  );
}

export async function fetchTwelveData(endpoint, params) {
  if (!TWELVE_DATA_API_KEY) {
    throw new Error("Missing TWELVE_DATA_API_KEY");
  }

  const url = `${twelveDataBaseUrl}/${endpoint}?${toSearchParams({
    ...params,
    apikey: TWELVE_DATA_API_KEY
  })}`;

  const cacheKey = `twelve:${url}`;

  return withPersistentCache(
    cacheKey,
    LIVE_REFRESH_MS,
    async () => {
      const data = await fetchJson(url, {
        next: { revalidate: LIVE_REVALIDATE_SECONDS }
      });

      if (data.code || data.status === "error" || data.message) {
        throw new Error(data.message || data.code || "Twelve Data request failed");
      }

      return data;
    },
    { allowStaleOnError: true }
  );
}

export async function fetchFredSeries(seriesId, limit = 2) {
  if (!FRED_API_KEY) {
    throw new Error("Missing FRED_API_KEY");
  }

  const url = `${fredBaseUrl}?${toSearchParams({
    series_id: seriesId,
    api_key: FRED_API_KEY,
    file_type: "json",
    sort_order: "desc",
    limit: Math.max(limit, 2)
  })}`;

  const data = await withPersistentCache(
    `fred:${seriesId}:${Math.max(limit, 2)}`,
    MACRO_REFRESH_MS,
    () =>
      fetchJson(url, {
        next: { revalidate: MACRO_REVALIDATE_SECONDS }
      }),
    { allowStaleOnError: true }
  );

  return data.observations ?? [];
}

export async function fetchStooqSnapshot(symbol) {
  const url = `https://stooq.com/q/l/?${toSearchParams({
    s: symbol,
    f: "sd2t2ohlcvn",
    e: "csv"
  })}`;
  const cacheKey = `stooq:${url}`;

  return withPersistentCache(
    cacheKey,
    LIVE_REFRESH_MS,
    async () => {
      const payload = await fetchText(url, {
        next: { revalidate: LIVE_REVALIDATE_SECONDS },
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      });
      const [rawSymbol, date, time, open, high, low, close, volume, name] = payload.trim().split(",");

      if (!rawSymbol || !close || rawSymbol === "N/D") {
        throw new Error(`Stooq snapshot unavailable for ${symbol}`);
      }

      return {
        symbol: rawSymbol,
        date,
        time,
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume),
        name
      };
    },
    { allowStaleOnError: true }
  );
}
