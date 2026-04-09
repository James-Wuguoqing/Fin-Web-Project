import { getPersistentCacheEntry, setPersistentCache, withPersistentCache } from "./persistent-cache";

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const FRED_API_KEY = process.env.FRED_API_KEY;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const MARKET_DATA_PROVIDER = process.env.MARKET_DATA_PROVIDER || "twelve-data";

const alphaBaseUrl = "https://www.alphavantage.co/query";
const fredBaseUrl = "https://api.stlouisfed.org/fred/series/observations";
const twelveDataBaseUrl = "https://api.twelvedata.com";
const ALPHA_REQUEST_INTERVAL_MS = 1200;
const LIVE_REFRESH_MS = 1000 * 60 * 5;
const LIVE_REVALIDATE_SECONDS = 300;
const MACRO_REFRESH_MS = 1000 * 60 * 60;
const MACRO_REVALIDATE_SECONDS = 3600;
const NEWS_ARTICLE_RETENTION_MS = 1000 * 60 * 60 * 24 * 30;
const NEWS_ARTICLE_ARCHIVE_LIMIT = 48;
const NEWS_ARTICLE_INDEX_KEY = "news-article-index-v1";
const PRESS_RELEASE_SYMBOLS = ["MSFT", "NVDA", "AAPL", "AMZN", "META", "AMD"];
const htmlEntityMap = {
  amp: "&",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  lt: "<",
  gt: ">"
};
const trackedTickerAliases = [
  { ticker: "MSFT", aliases: ["microsoft", "azure", "github", "copilot"] },
  { ticker: "NVDA", aliases: ["nvidia", "geforce", "cuda", "blackwell"] },
  { ticker: "AAPL", aliases: ["apple", "iphone", "ipad", "macbook"] },
  { ticker: "AMZN", aliases: ["amazon", "aws", "prime video"] },
  { ticker: "META", aliases: ["meta", "instagram", "whatsapp", "facebook"] },
  { ticker: "AMD", aliases: ["amd", "ryzen", "epyc", "radeon"] }
];
const pressReleaseTopicKeywords = [
  { topic: "AI", keywords: ["artificial intelligence", " ai ", "generative", "model"] },
  { topic: "云服务", keywords: ["cloud", "azure", "aws", "data center"] },
  { topic: "芯片", keywords: ["chip", "gpu", "semiconductor", "processor"] },
  { topic: "企业更新", keywords: ["launch", "announce", "partnership", "expands", "earnings"] }
];

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2
});
const updateTimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function toSearchParams(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  return searchParams.toString();
}

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

function stampPayload(data, labelPrefix, syncMeta = {}) {
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

async function fetchAlphaVantage(params) {
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

async function fetchTwelveData(endpoint, params) {
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

async function fetchFredSeries(seriesId, limit = 2) {
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

async function fetchStooqSnapshot(symbol) {
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

function formatChange(changeValue) {
  const value = Number(changeValue);

  if (Number.isNaN(value)) {
    return "0.00%";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getTone(changeValue) {
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

function formatQuoteValue(value) {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return "--";
  }

  return numberFormatter.format(numericValue);
}

function formatFxValue(value) {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return "--";
  }

  return numericValue >= 1 ? numericValue.toFixed(2) : numericValue.toFixed(4);
}

function formatFredValue(seriesId, value) {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return "--";
  }

  if (seriesId === "CPIAUCSL") {
    return numericValue.toFixed(2);
  }

  return `${numericValue.toFixed(2)}%`;
}

function getFredSummary(seriesId, change) {
  if (seriesId === "FEDFUNDS") {
    return change >= 0 ? "政策利率持平或上行" : "政策利率回落";
  }

  if (seriesId === "CPIAUCSL") {
    return change >= 0 ? "通胀仍在累积" : "价格压力缓和";
  }

  return change >= 0 ? "就业市场偏稳" : "就业市场降温";
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildArticleId(item) {
  if (item.id) {
    return slugify(`${item.source || "article"}-${item.id}`);
  }

  const seed = [item.source, item.time_published || item.datetime, item.title].filter(Boolean).join("-");
  return slugify(seed);
}

function getNewsArticleCacheKey(articleId) {
  return `news-article:${articleId}`;
}

function formatPublishedAt(value) {
  if (!value) {
    return "未知时间";
  }

  if (/^\d{8}T\d{6}$/.test(value)) {
    const year = value.slice(0, 4);
    const month = value.slice(4, 6);
    const day = value.slice(6, 8);
    const hour = value.slice(9, 11);
    const minute = value.slice(11, 13);

    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value)) {
    return value.replace("T", " ").slice(0, 16);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 16).replace("T", " ");
}

function getArticleSortTimestamp(value) {
  if (!value) {
    return 0;
  }

  const normalized = typeof value === "string" ? value.replace(" ", "T") : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function decodeHtmlEntities(value = "") {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = entity.toLowerCase();

    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return htmlEntityMap[normalized] ?? match;
  });
}

function stripHtml(value = "") {
  return decodeHtmlEntities(
    value
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value = "", maxLength = 180) {
  if (!value) {
    return "";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function extractFirstUrl(value = "") {
  const match = value.match(/href=["']([^"']+)["']/i);
  return match ? decodeHtmlEntities(match[1]) : "";
}

function detectTickersFromText(value = "") {
  const normalized = ` ${value.toLowerCase()} `;

  return trackedTickerAliases
    .filter(({ ticker, aliases }) => {
      const tickerHit = normalized.includes(` ${ticker.toLowerCase()} `);
      const aliasHit = aliases.some((alias) => normalized.includes(alias));
      return tickerHit || aliasHit;
    })
    .map(({ ticker }) => ticker)
    .slice(0, 4);
}

function detectTopicsFromText(value = "", item = {}) {
  const normalized = ` ${value.toLowerCase()} `;
  const topics = new Set();

  if (typeof item.style === "string" && item.style.trim() && !item.style.includes("{")) {
    topics.add(item.style === "press_release" ? "公司公告" : item.style);
  }

  topics.add("公司公告");

  pressReleaseTopicKeywords.forEach(({ topic, keywords }) => {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      topics.add(topic);
    }
  });

  const languages = Array.isArray(item.language) ? item.language : [item.language].filter(Boolean);

  languages.forEach((language) => {
    const normalizedLanguage = String(language).toLowerCase();

    if (normalizedLanguage && normalizedLanguage !== "en" && normalizedLanguage !== "en-us") {
      topics.add(String(language).toUpperCase());
    }
  });

  if (item.url || item.body?.includes("prnewswire.com")) {
    topics.add("新闻稿");
  }

  return Array.from(topics).slice(0, 4);
}

function inferSentimentFromText(value = "") {
  const normalized = value.toLowerCase();
  const positiveHits = ["record", "growth", "expands", "launch", "beats", "strong"].filter((keyword) =>
    normalized.includes(keyword)
  ).length;
  const negativeHits = ["cuts", "decline", "lawsuit", "recall", "risk", "weak"].filter((keyword) =>
    normalized.includes(keyword)
  ).length;

  if (positiveHits > negativeHits) {
    return "Bullish";
  }

  if (negativeHits > positiveHits) {
    return "Bearish";
  }

  return "Neutral";
}

function normalizeAlphaNewsItem(item, index) {
  return {
    id: buildArticleId(item),
    badge: index === 0 ? "头条" : item.source || "快讯",
    title: item.title ?? "暂无标题",
    summary:
      item.summary?.slice(0, 180) ||
      "Alpha Vantage 新闻接口返回的摘要将显示在这里。",
    source: item.source || "Alpha Vantage",
    url: item.url || "",
    publishedAt: formatPublishedAt(item.time_published),
    sentiment: item.overall_sentiment_label || "Neutral",
    image: item.banner_image || "",
    topics: (item.topics || []).slice(0, 4).map((topic) => topic.topic),
    tickers: (item.ticker_sentiment || []).slice(0, 4).map((entry) => entry.ticker)
  };
}

function normalizePressReleaseItem(item, index) {
  const plainBody = stripHtml(item.body || item.summary || item.description || "");
  const combinedText = `${item.title || ""} ${plainBody}`;
  const tickers = detectTickersFromText(combinedText);

  return {
    id: buildArticleId({
      source: "twelve-data",
      id: item.id || item.uuid || item.datetime,
      title: item.title
    }),
    badge: index === 0 ? "实时" : "公告",
    title: item.title ?? "暂无标题",
    summary: truncateText(plainBody, 180) || "Twelve Data 公告流已接入。",
    source: "Twelve Data",
    url: item.url || extractFirstUrl(item.body || ""),
    publishedAt: formatPublishedAt(item.datetime || item.published_at || item.date),
    sentiment: inferSentimentFromText(combinedText),
    image: item.image || "",
    topics: detectTopicsFromText(combinedText, item),
    tickers
  };
}

function isPersistableNewsArticle(article) {
  return Boolean(article?.id) && !String(article.id).startsWith("fallback-");
}

async function getPersistedNewsArticle(articleId) {
  if (!articleId) {
    return null;
  }

  const entry = await getPersistentCacheEntry(getNewsArticleCacheKey(articleId));

  if (!entry?.savedAt || Date.now() - entry.savedAt > NEWS_ARTICLE_RETENTION_MS) {
    return null;
  }

  return entry.value ?? null;
}

async function rememberNewsArticles(articles) {
  const persistableArticles = articles.filter(isPersistableNewsArticle);

  if (persistableArticles.length === 0) {
    return articles;
  }

  const savedAt = Date.now();

  await Promise.allSettled(
    persistableArticles.map((article) =>
      setPersistentCache(getNewsArticleCacheKey(article.id), article, savedAt)
    )
  );

  try {
    const cachedIndex = (await getPersistentCacheEntry(NEWS_ARTICLE_INDEX_KEY))?.value ?? [];
    const nextIndexMap = new Map();

    cachedIndex.forEach((entry) => {
      if (entry?.id) {
        nextIndexMap.set(entry.id, entry);
      }
    });

    persistableArticles.forEach((article) => {
      nextIndexMap.set(article.id, {
        id: article.id,
        publishedAt: article.publishedAt || "",
        savedAt
      });
    });

    const nextIndex = Array.from(nextIndexMap.values())
      .sort((left, right) => {
        const rightTimestamp = getArticleSortTimestamp(right.publishedAt) || Number(right.savedAt) || 0;
        const leftTimestamp = getArticleSortTimestamp(left.publishedAt) || Number(left.savedAt) || 0;
        return rightTimestamp - leftTimestamp;
      })
      .slice(0, NEWS_ARTICLE_ARCHIVE_LIMIT);

    await setPersistentCache(NEWS_ARTICLE_INDEX_KEY, nextIndex, savedAt);
  } catch (error) {
    console.error("Failed to update news article archive index:", error);
  }

  return articles;
}

function buildFallbackData() {
  const news = [
    {
      id: "fallback-market-brief",
      badge: "头条",
      title: "财经首页已接入真实数据骨架。",
      summary: "当前页面会在服务端请求 Alpha Vantage 与 FRED，并在接口限流时自动回退到占位内容。",
      source: "FinScope",
      url: "",
      publishedAt: "实时同步中",
      sentiment: "Neutral",
      image: "",
      topics: ["Market"],
      tickers: ["SPY"]
    }
  ];

  return {
    tickerTape: ["SPY --", "QQQ --", "USD/TWD --", "黄金 --"],
    marketSentiment: {
      label: "Data Syncing",
      score: 50,
      summary: "正在等待实时数据"
    },
    heroStats: [
      { value: "4", label: "追踪资产" },
      { value: "3", label: "宏观指标" },
      { value: "5m", label: "定时刷新" }
    ],
    panels: {
      indices: [],
      sectors: [],
      fx: []
    },
    featureStory: {
      title: "财经首页已接入真实数据骨架。",
      body: "当前页面会在服务端请求 Alpha Vantage 与 FRED，并在接口限流时自动回退到占位内容。",
      linkLabel: "阅读策略摘要"
    },
    macroColumns: [],
    news,
    insight: {
      watchlist: ["等待市场数据", "等待宏观数据", "等待新闻数据"],
      score: "50 / 100",
      bars: [40, 52, 48, 50, 56, 54, 58]
    },
    marketCategories: []
  };
}

async function getQuote(symbol, label = symbol) {
  if (MARKET_DATA_PROVIDER === "twelve-data" && TWELVE_DATA_API_KEY) {
    try {
      const quote = await fetchTwelveData("quote", { symbol });
      const price = quote.close || quote.price;
      const changePercent = String(quote.percent_change ?? quote.change_percent ?? 0).replace("%", "");

      return {
        symbol,
        label,
        value: formatQuoteValue(price),
        rawValue: Number(price),
        change: formatChange(changePercent),
        rawChange: Number(changePercent),
        tone: getTone(changePercent),
        provider: "Twelve Data"
      };
    } catch (error) {
      console.error(`Failed to fetch Twelve Data quote for ${symbol}, falling back:`, error);
    }
  }

  const data = await fetchAlphaVantage({
    function: "GLOBAL_QUOTE",
    symbol
  });
  const quote = data["Global Quote"] ?? {};
  const price = quote["05. price"];
  const changePercent = (quote["10. change percent"] ?? "0%").replace("%", "");

  return {
    symbol,
    label,
    value: formatQuoteValue(price),
    rawValue: Number(price),
    change: formatChange(changePercent),
    rawChange: Number(changePercent),
    tone: getTone(changePercent),
    provider: "Alpha Vantage"
  };
}

async function getFxRate(fromCurrency, toCurrency, label) {
  if (MARKET_DATA_PROVIDER === "twelve-data" && TWELVE_DATA_API_KEY) {
    try {
      const rateBlock = await fetchTwelveData("exchange_rate", {
        symbol: `${fromCurrency}/${toCurrency}`
      });
      const exchangeRate = rateBlock.rate;
      const changePercent = Number(rateBlock.percent_change ?? 0);

      return {
        label,
        value: formatFxValue(exchangeRate),
        rawValue: Number(exchangeRate),
        change: formatChange(changePercent),
        rawChange: changePercent,
        tone: getTone(changePercent),
        provider: "Twelve Data"
      };
    } catch (error) {
      console.error(`Failed to fetch Twelve Data FX for ${label}, falling back:`, error);
    }
  }

  const data = await fetchAlphaVantage({
    function: "CURRENCY_EXCHANGE_RATE",
    from_currency: fromCurrency,
    to_currency: toCurrency
  });

  const rateBlock = data["Realtime Currency Exchange Rate"] ?? {};
  const exchangeRate = rateBlock["5. Exchange Rate"];
  const previousClose = rateBlock["8. Bid Price"] || rateBlock["9. Ask Price"];
  const rate = Number(exchangeRate);
  const previous = Number(previousClose);
  const changePercent =
    Number.isFinite(rate) && Number.isFinite(previous) && previous !== 0
      ? ((rate - previous) / previous) * 100
      : 0;

  return {
    label,
    value: formatFxValue(exchangeRate),
    rawValue: rate,
    change: formatChange(changePercent),
    rawChange: changePercent,
    tone: getTone(changePercent),
    provider: "Alpha Vantage"
  };
}

async function getFredMetric(seriesId, label) {
  const observations = await fetchFredSeries(seriesId, 6);
  const [latest, previous] = observations.filter((item) => Number.isFinite(Number(item?.value))).slice(0, 2);
  const latestValue = Number(latest?.value);
  const previousValue = Number(previous?.value);
  const delta =
    Number.isFinite(latestValue) && Number.isFinite(previousValue) ? latestValue - previousValue : 0;

  return {
    label,
    value: formatFredValue(seriesId, latest?.value),
    delta,
    summary: getFredSummary(seriesId, delta),
    tone: getTone(delta)
  };
}

async function getStooqCommodity(symbol, label) {
  const snapshot = await fetchStooqSnapshot(symbol);
  const changePercent =
    Number.isFinite(snapshot.open) && snapshot.open !== 0
      ? ((snapshot.close - snapshot.open) / snapshot.open) * 100
      : 0;

  return {
    label,
    value: `$${numberFormatter.format(snapshot.close)}`,
    change: formatChange(changePercent),
    rawChange: changePercent,
    tone: getTone(changePercent),
    provider: "Stooq"
  };
}

function buildWaitingItem(label) {
  return {
    label,
    value: "--",
    change: "等待数据",
    tone: "neutral"
  };
}

async function getGoldMarketItem() {
  try {
    return await getQuote("GLD", "伦敦金");
  } catch (error) {
    console.error("Failed to load GLD quote for gold proxy:", error);
  }

  try {
    return await getStooqCommodity("xauusd", "伦敦金");
  } catch (error) {
    console.error("Failed to load Stooq gold snapshot:", error);
  }

  return buildWaitingItem("伦敦金");
}

function buildSentiment(indices, macroMetrics) {
  const marketAverage =
    indices.reduce((total, item) => total + (Number.isFinite(item.rawChange) ? item.rawChange : 0), 0) /
    Math.max(indices.length, 1);
  const macroDrag = macroMetrics[0]?.delta > 0 ? -5 : 5;
  const score = Math.max(18, Math.min(88, Math.round(55 + marketAverage * 6 + macroDrag)));

  return {
    label: score >= 55 ? "Risk-On" : "Risk-Off",
    score,
    summary: score >= 55 ? "风险资产偏强" : "避险偏好升温"
  };
}

function buildInsightScore(indices, macroMetrics) {
  const equityMomentum = indices.reduce(
    (total, item) => total + (Number.isFinite(item.rawChange) ? item.rawChange : 0),
    0
  );
  const macroTilt = macroMetrics.some((item) => item.tone === "negative") ? -6 : 4;
  const score = Math.max(20, Math.min(90, Math.round(58 + equityMomentum * 4 + macroTilt)));

  return {
    score: `${score} / 100`,
    bars: [score - 24, score - 12, score - 18, score - 8, score - 3, score + 6, score].map((value) =>
      Math.max(18, Math.min(92, value))
    )
  };
}

function buildFeatureStory(indices, macroMetrics) {
  const strongestIndex = [...indices].sort((left, right) => right.rawChange - left.rawChange)[0];
  const fedFunds = macroMetrics.find((item) => item.label === "联邦基金利率");
  const provider = strongestIndex?.provider || "市场数据源";

  return {
    title: `${strongestIndex?.label ?? "美股"}领涨，市场继续围绕增长与利率重新定价。`,
    body: `当前首页已接入真实数据。${strongestIndex?.label ?? "主要风险资产"}最新变动为 ${
      strongestIndex?.change ?? "--"
    }，行情由 ${provider} 提供，而${fedFunds?.label ?? "政策利率"}信号显示“${
      fedFunds?.summary ?? "政策观察中"
    }”。`,
    linkLabel: "阅读策略摘要"
  };
}

function buildMacroColumns(macroMetrics) {
  return macroMetrics.map((item) => ({
    kicker: "宏观",
    title: item.label,
    body: `${item.value}，${item.summary}`
  }));
}

const marketGroups = [
  {
    title: "美国股票",
    description: "用高流动性 ETF 追踪美国主要风格与规模因子。",
    symbols: [
      ["SPY", "标普 500"],
      ["QQQ", "纳斯达克 100"],
      ["DIA", "道琼斯"],
      ["IWM", "罗素 2000"]
    ]
  },
  {
    title: "海外市场",
    description: "补充欧洲、日本和新兴市场的整体风险偏好。",
    symbols: [
      ["VGK", "欧洲股票"],
      ["EWJ", "日本股票"],
      ["EEM", "新兴市场"],
      ["MCHI", "中国股票"]
    ]
  },
  {
    title: "债券信用",
    description: "观察久期风险与信用利差是否压制风险资产。",
    series: [
      { seriesId: "DGS10", label: "10Y Treasury", format: "yield", inverseTone: true },
      { seriesId: "DGS2", label: "2Y Treasury", format: "yield", inverseTone: true },
      { seriesId: "DBAA", label: "Moody's BAA", format: "yield", inverseTone: true },
      { seriesId: "BAMLH0A0HYM2", label: "HY OAS", format: "yield", inverseTone: true }
    ]
  },
  {
    title: "商品主题",
    description: "用黄金、原油和广义商品判断通胀与避险交易。",
    series: [
      { seriesId: "DCOILWTICO", label: "WTI 原油", format: "usd" },
      { seriesId: "DCOILBRENTEU", label: "Brent 原油", format: "usd" },
      { seriesId: "DHHNGSP", label: "Henry Hub", format: "usd" }
    ]
  }
];

async function getNewsFeedRaw(limit = 8) {
  try {
    const newsFeed = await fetchAlphaVantage({
      function: "NEWS_SENTIMENT",
      tickers: "SPY,QQQ,AAPL,MSFT,NVDA,AMZN,META,GLD,TLT",
      limit,
      sort: "LATEST"
    });

    const normalized = (newsFeed.feed ?? []).map(normalizeAlphaNewsItem);

    if (normalized.length > 0) {
      await rememberNewsArticles(normalized);
      return normalized;
    }
  } catch (error) {
    console.error("Failed to load news feed:", error);
  }

  try {
    const pressReleases = await fetchTwelveData("press_releases", {
      symbol: PRESS_RELEASE_SYMBOLS.join(","),
      outputsize: Math.min(limit, 8)
    });
    const feed = pressReleases.press_releases ?? pressReleases.data ?? pressReleases.items ?? [];
    const normalized = feed.map(normalizePressReleaseItem).filter((item) => item.title && item.summary);

    if (normalized.length > 0) {
      await rememberNewsArticles(normalized);
      return normalized;
    }
  } catch (error) {
    console.error("Failed to load Twelve Data press releases:", error);
  }

  throw new Error("No live news feed available");
}

async function getHomepageDataRaw() {
  try {
    const [spy, qqq, dia, iwm, usdTwd, eurUsd, usdJpy, news, fedFunds, cpi, unemployment] =
      await Promise.all([
        getQuote("SPY", "SPY"),
        getQuote("QQQ", "QQQ"),
        getQuote("DIA", "DIA"),
        getQuote("IWM", "IWM"),
        getFxRate("USD", "TWD", "USD/TWD"),
        getFxRate("EUR", "USD", "EUR/USD"),
        getFxRate("USD", "JPY", "USD/JPY"),
        getNewsFeedRaw(4),
        getFredMetric("FEDFUNDS", "联邦基金利率"),
        getFredMetric("CPIAUCSL", "美国 CPI"),
        getFredMetric("UNRATE", "美国失业率")
      ]);

    const indices = [spy, qqq, dia, iwm];
    const fx = [usdTwd, eurUsd, usdJpy];
    const macroMetrics = [fedFunds, cpi, unemployment];
    const sentiment = buildSentiment(indices, macroMetrics);
    const insight = buildInsightScore(indices, macroMetrics);

    return {
      tickerTape: [
        `${spy.label} ${spy.change}`,
        `${qqq.label} ${qqq.change}`,
        `${usdTwd.label} ${usdTwd.value}`,
        `${eurUsd.label} ${eurUsd.value}`
      ],
      marketSentiment: sentiment,
      heroStats: [
        { value: "7", label: "实时资产" },
        { value: "3", label: "宏观指标" },
        { value: `${news.length}`, label: "新闻快讯" }
      ],
      panels: {
        indices,
        sectors: macroMetrics.map((item) => ({
          label: item.label,
          value: item.value,
          change: item.summary,
          tone: item.tone
        })),
        fx
      },
      featureStory: buildFeatureStory(indices, macroMetrics),
      macroColumns: buildMacroColumns(macroMetrics),
      news,
      insight: {
        watchlist: [
          `${spy.label} 与 ${qqq.label} 是否延续反弹`,
          `${fedFunds.label} 与 ${cpi.label} 的下次更新`,
          `${usdTwd.label} 是否继续维持强势`
        ],
        score: insight.score,
        bars: insight.bars
      },
      marketCategories: marketGroups.map((group) => ({
        title: group.title,
        description: group.description
      }))
    };
  } catch (error) {
    console.error("Failed to load homepage market data:", error);
    throw error;
  }
}

async function getMarketsDataRaw() {
  try {
    const goldItemPromise = getGoldMarketItem();
    const groups = await Promise.all(
      marketGroups.map(async (group) => {
        if (group.symbols) {
          const quotes = await Promise.allSettled(
            group.symbols.map(([symbol, label]) => getQuote(symbol, label))
          );

          return {
            title: group.title,
            description: group.description,
            items: quotes.map((result, index) =>
              result.status === "fulfilled"
                ? result.value
                : {
                    label: group.symbols[index][1],
                    value: "--",
                    change: "等待数据",
                    tone: "neutral"
                  }
            )
          };
        }

        const snapshots = await Promise.allSettled(
          group.series.map(async (seriesConfig) => {
            const observations = await fetchFredSeries(seriesConfig.seriesId, seriesConfig.lookback ?? 8);
            const [latest, previous] = observations
              .filter((item) => Number.isFinite(Number(item?.value)))
              .slice(0, 2);
            const latestValue = Number(latest?.value);
            const previousValue = Number(previous?.value);
            const delta =
              Number.isFinite(latestValue) && Number.isFinite(previousValue) ? latestValue - previousValue : NaN;

            if (!Number.isFinite(latestValue) && seriesConfig.publicQuoteFallback) {
              try {
                return await getStooqCommodity(seriesConfig.publicQuoteFallback, seriesConfig.label);
              } catch (error) {
                console.error(`Failed to load public commodity fallback for ${seriesConfig.label}:`, error);
              }
            }

            if (!Number.isFinite(latestValue) && seriesConfig.quoteFallback) {
              return getQuote(seriesConfig.quoteFallback, seriesConfig.label);
            }

            return {
              label: seriesConfig.label,
              value: Number.isFinite(latestValue)
                ? seriesConfig.format === "usd"
                  ? `$${numberFormatter.format(latestValue)}`
                  : `${latestValue.toFixed(2)}%`
                : "--",
              change: Number.isFinite(delta)
                ? `较前值 ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}${
                    seriesConfig.format === "usd" ? "" : " 个百分点"
                  }`
                : latest?.date
                  ? `更新于 ${latest.date}`
                  : "最新观测",
              tone: getTone(seriesConfig.inverseTone ? -delta : delta)
            };
          })
        );

        const items = snapshots.map((result, index) =>
          result.status === "fulfilled"
            ? result.value
            : buildWaitingItem(group.series[index].label)
        );

        if (group.title === "商品主题") {
          items.unshift(await goldItemPromise);
        }

        return {
          title: group.title,
          description: group.description,
          items
        };
      })
    );

    const hasLiveItems = groups.some((group) => group.items.some((item) => item.value !== "--"));

    return {
      updatedLabel: hasLiveItems ? "Twelve Data 与 FRED 混合刷新" : "数据同步中",
      groups
    };
  } catch (error) {
    console.error("Failed to load markets data:", error);
    throw error;
  }
}

export async function getRelatedArticles(article, limit = 3) {
  const feed = await getCachedNewsArchive();

  return feed
    .filter((item) => item.id !== article.id)
    .map((candidate) => {
      const sharedTopics = candidate.topics.filter((topic) => article.topics.includes(topic)).length;
      const sharedTickers = candidate.tickers.filter((ticker) => article.tickers.includes(ticker)).length;
      const score = sharedTopics * 2 + sharedTickers * 3;

      return {
        ...candidate,
        relevanceScore: score
      };
    })
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, limit);
}

function buildHomepageFallbackState() {
  return {
    ...buildFallbackData(),
    heroStats: [
      { value: "7", label: "实时资产" },
      { value: "3", label: "宏观指标" },
      { value: "5m", label: "定时刷新" }
    ]
  };
}

function buildMarketsFallbackState() {
  return {
    groups: marketGroups.map((group) => ({
      title: group.title,
      description: group.description,
      items: (group.symbols
        ? group.symbols.map(([, label]) => label)
        : [...(group.title === "商品主题" ? ["伦敦金"] : []), ...group.series.map((item) => item.label)]
      ).map((label) => buildWaitingItem(label))
    }))
  };
}

function buildStampedFallback(data, labelPrefix) {
  return stampPayload(data, labelPrefix, {
    cacheState: "syncing",
    savedAt: Date.now()
  });
}

export async function getCachedHomepageData() {
  try {
    const cached = await withPersistentCache(
      "homepage-data-v7",
      LIVE_REFRESH_MS,
      async () => getHomepageDataRaw(),
      { allowStaleOnError: true, returnMeta: true }
    );

    return stampPayload(cached.value, "行情与快讯约 5 分钟刷新", cached);
  } catch {
    return buildStampedFallback(buildHomepageFallbackState(), "行情同步中");
  }
}

export async function getCachedNewsFeedState() {
  try {
    const cached = await withPersistentCache(
      "news-feed-v8",
      LIVE_REFRESH_MS,
      async () => ({
        articles: await getNewsFeedRaw(8)
      }),
      { allowStaleOnError: true, returnMeta: true }
    );

    return stampPayload(cached.value, "新闻约 5 分钟刷新", cached);
  } catch {
    return buildStampedFallback(
      {
        articles: buildFallbackData().news
      },
      "新闻同步中"
    );
  }
}

export async function getCachedNewsFeed() {
  const payload = await getCachedNewsFeedState();
  return payload.articles;
}

export async function getCachedNewsArchive(limit = NEWS_ARTICLE_ARCHIVE_LIMIT) {
  const currentFeed = await getCachedNewsFeed();
  const archiveIndex = (await getPersistentCacheEntry(NEWS_ARTICLE_INDEX_KEY))?.value ?? [];
  const archivedArticles = await Promise.all(
    archiveIndex.slice(0, limit).map((entry) => getPersistedNewsArticle(entry?.id))
  );

  const mergedArticles = new Map();

  [...currentFeed, ...archivedArticles.filter(Boolean)].forEach((article) => {
    if (article?.id && !mergedArticles.has(article.id)) {
      mergedArticles.set(article.id, article);
    }
  });

  return Array.from(mergedArticles.values())
    .sort((left, right) => getArticleSortTimestamp(right.publishedAt) - getArticleSortTimestamp(left.publishedAt))
    .slice(0, limit);
}

export async function getCachedMarketsData() {
  try {
    const cached = await withPersistentCache(
      "markets-data-v12",
      LIVE_REFRESH_MS,
      async () => getMarketsDataRaw(),
      { allowStaleOnError: true, returnMeta: true }
    );

    return stampPayload(cached.value, "行情约 5 分钟刷新", cached);
  } catch {
    return buildStampedFallback(buildMarketsFallbackState(), "行情同步中");
  }
}

export async function getCachedNewsArticle(articleId) {
  const persistedArticle = await getPersistedNewsArticle(articleId);

  if (persistedArticle) {
    return persistedArticle;
  }

  const feed = await getCachedNewsFeed();
  const cachedFeedArticle = feed.find((item) => item.id === articleId);

  if (cachedFeedArticle) {
    await rememberNewsArticles([cachedFeedArticle]);
    return cachedFeedArticle;
  }

  try {
    const refreshedFeed = await getNewsFeedRaw(16);
    return refreshedFeed.find((item) => item.id === articleId) ?? null;
  } catch (error) {
    console.error(`Failed to refresh article ${articleId} from live feed:`, error);
    return null;
  }
}
