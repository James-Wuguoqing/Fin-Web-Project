export const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2
});

const updateTimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function formatUpdatedAt(value) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "未知时间";
  }

  return updateTimeFormatter.format(parsed);
}

function getErrorMessage(error) {
  if (!error) {
    return "";
  }

  return typeof error === "string" ? error : error.message || String(error);
}

function isRateLimitError(error) {
  const message = getErrorMessage(error).toLowerCase();

  return ["rate limit", "too many", "429", "premium", "quota", "limit"].some((pattern) =>
    message.includes(pattern)
  );
}

function buildSyncStatus(syncMeta = {}, labelPrefix, updatedAt) {
  const { cacheState, error } = syncMeta;
  const updateLine = `${labelPrefix} · 上次更新 ${formatUpdatedAt(updatedAt)}`;

  if (cacheState === "stale_on_error" && isRateLimitError(error)) {
    return {
      state: "limited",
      tone: "warning",
      label: "数据源限流中",
      detail: `当前显示上次成功数据 · ${updateLine}`
    };
  }

  if (cacheState === "stale_on_error") {
    return {
      state: "stale",
      tone: "neutral",
      label: "使用缓存",
      detail: `数据源暂时不可用，当前显示上次成功数据 · ${updateLine}`
    };
  }

  if (cacheState === "syncing") {
    return {
      state: "syncing",
      tone: "neutral",
      label: "同步中",
      detail: updateLine
    };
  }

  return {
    state: "live",
    tone: "positive",
    label: "最新",
    detail: updateLine
  };
}

export function stampPayload(data, labelPrefix, syncMeta = {}) {
  const updatedAt = syncMeta.savedAt
    ? new Date(syncMeta.savedAt).toISOString()
    : data.updatedAt || new Date().toISOString();

  return {
    ...data,
    updatedAt,
    updatedLabel: `${labelPrefix} · 上次更新 ${formatUpdatedAt(updatedAt)}`,
    syncStatus: buildSyncStatus(syncMeta, labelPrefix, updatedAt)
  };
}

export function buildStampedFallback(data, labelPrefix) {
  return stampPayload(data, labelPrefix, {
    cacheState: "syncing",
    savedAt: Date.now()
  });
}

export function formatChange(changeValue) {
  const value = Number(changeValue);

  if (Number.isNaN(value)) {
    return "0.00%";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function getTone(changeValue) {
  const value = Number(changeValue);

  if (Number.isNaN(value)) {
    return "neutral";
  }

  if (value > 0.1) {
    return "positive";
  }

  if (value < -0.1) {
    return "negative";
  }

  return "neutral";
}

export function formatQuoteValue(value) {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return "--";
  }

  return numberFormatter.format(numericValue);
}

export function formatFxValue(value) {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return "--";
  }

  return numericValue >= 1 ? numericValue.toFixed(2) : numericValue.toFixed(4);
}

export function formatFredValue(seriesId, value) {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return "--";
  }

  if (seriesId === "CPIAUCSL") {
    return numericValue.toFixed(2);
  }

  return `${numericValue.toFixed(2)}%`;
}

export function getFredSummary(seriesId, change) {
  if (seriesId === "FEDFUNDS") {
    return change >= 0 ? "政策利率持平或上行" : "政策利率回落";
  }

  if (seriesId === "CPIAUCSL") {
    return change >= 0 ? "通胀仍在累积" : "价格压力缓和";
  }

  return change >= 0 ? "就业市场偏稳" : "就业市场降温";
}
