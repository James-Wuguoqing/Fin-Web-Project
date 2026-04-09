import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const cacheDirectory = path.join(process.cwd(), ".cache", "finscope");

function getCacheFilePath(key) {
  const digest = crypto.createHash("sha256").update(key).digest("hex");
  return path.join(cacheDirectory, `${digest}.json`);
}

function getPersistentCacheInflightMap() {
  if (!globalThis.__finscopePersistentCacheInflight) {
    globalThis.__finscopePersistentCacheInflight = new Map();
  }

  return globalThis.__finscopePersistentCacheInflight;
}

async function ensureCacheDirectory() {
  await fs.mkdir(cacheDirectory, { recursive: true });
}

export async function getPersistentCacheEntry(key) {
  try {
    const filePath = getCacheFilePath(key);
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function getPersistentCache(key, maxAgeMs) {
  const entry = await getPersistentCacheEntry(key);

  if (!entry?.savedAt || Date.now() - entry.savedAt > maxAgeMs) {
    return null;
  }

  return entry.value;
}

export async function setPersistentCache(key, value, savedAt = Date.now()) {
  await ensureCacheDirectory();
  const filePath = getCacheFilePath(key);
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        savedAt,
        value
      },
      null,
      2
    ),
    "utf8"
  );

  return value;
}

export async function deletePersistentCache(key) {
  try {
    await fs.unlink(getCacheFilePath(key));
  } catch {
    return;
  }
}

export async function withPersistentCache(key, maxAgeMs, computeValue, options = {}) {
  const cachedEntry = await getPersistentCacheEntry(key);
  const cachedValue =
    cachedEntry?.savedAt && Date.now() - cachedEntry.savedAt <= maxAgeMs ? cachedEntry.value : null;
  const inflightMap = getPersistentCacheInflightMap();

  if (cachedValue !== null) {
    if (options.returnMeta) {
      return {
        value: cachedValue,
        cacheState: "fresh_cache",
        savedAt: cachedEntry.savedAt,
        error: null
      };
    }

    return cachedValue;
  }

  function handleStaleFallback(error) {
    if (options.allowStaleOnError !== false && cachedEntry?.value !== undefined) {
      if (options.returnMeta) {
        return {
          value: cachedEntry.value,
          cacheState: "stale_on_error",
          savedAt: cachedEntry.savedAt,
          error
        };
      }

      return cachedEntry.value;
    }

    throw error;
  }

  const inflightOperation = inflightMap.get(key);

  if (inflightOperation) {
    try {
      const result = await inflightOperation;

      if (options.returnMeta) {
        return {
          value: result.value,
          cacheState: cachedEntry?.savedAt ? "refreshed" : "fresh_fetch",
          savedAt: result.savedAt,
          error: null
        };
      }

      return result.value;
    } catch (error) {
      return handleStaleFallback(error);
    }
  }

  const refreshTask = (async () => {
    const value = await computeValue();
    const savedAt = Date.now();
    await setPersistentCache(key, value, savedAt);
    return { value, savedAt };
  })();

  inflightMap.set(key, refreshTask);

  try {
    const result = await refreshTask;

    if (options.returnMeta) {
      return {
        value: result.value,
        cacheState: cachedEntry?.savedAt ? "refreshed" : "fresh_fetch",
        savedAt: result.savedAt,
        error: null
      };
    }

    return result.value;
  } catch (error) {
    return handleStaleFallback(error);
  } finally {
    if (inflightMap.get(key) === refreshTask) {
      inflightMap.delete(key);
    }
  }
}
