import { deletePersistentCache, getPersistentCache, setPersistentCache } from "./persistent-cache";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_SUMMARY_MODEL || "gpt-5-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const AI_SUMMARY_TTL_MS = 1000 * 60 * 60 * 24;
const FALLBACK_SUMMARY_MARKER = "当前站点尚未配置 OpenAI key，因此这里展示的是规则化摘要。";

function getSummaryInflightMap() {
  if (!globalThis.__finscopeArticleSummaryInflight) {
    globalThis.__finscopeArticleSummaryInflight = new Map();
  }

  return globalThis.__finscopeArticleSummaryInflight;
}

function buildFallbackSummary(article) {
  return `这篇文章聚焦 ${article.tickers?.join("、") || "市场主线"}，核心信息是“${article.summary}”。${FALLBACK_SUMMARY_MARKER}`;
}

function isFallbackSummary(summary) {
  return typeof summary === "string" && summary.includes(FALLBACK_SUMMARY_MARKER);
}

async function fetchOpenAISummary(article) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content:
            "你是财经编辑。请用简体中文写一段 90 到 140 字的高质量新闻摘要，强调市场含义、潜在影响和需要继续跟踪的变量。不要使用项目符号。"
        },
        {
          role: "user",
          content: `标题：${article.title}\n来源：${article.source}\n发布时间：${article.publishedAt}\n摘要：${article.summary}\n标签：${article.topics?.join("、") || "无"}\n相关代码：${article.tickers?.join("、") || "无"}`
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI summary request failed: ${response.status}`);
  }

  const data = await response.json();
  const summary = data.output_text?.trim();

  if (!summary) {
    throw new Error("OpenAI summary response was empty");
  }

  return summary;
}

export async function getArticleSummary(article) {
  const cacheKey = `ai-summary:${article.id}`;
  const cachedSummary = await getPersistentCache(cacheKey, AI_SUMMARY_TTL_MS);

  if (cachedSummary && !isFallbackSummary(cachedSummary)) {
    return cachedSummary;
  }

  if (isFallbackSummary(cachedSummary)) {
    await deletePersistentCache(cacheKey);
  }

  if (!OPENAI_API_KEY) {
    return buildFallbackSummary(article);
  }

  const inflightMap = getSummaryInflightMap();
  const inflightTask = inflightMap.get(cacheKey);

  if (inflightTask) {
    return inflightTask;
  }

  const task = (async () => {
    try {
      const summary = await fetchOpenAISummary(article);
      await setPersistentCache(cacheKey, summary);
      return summary;
    } catch (error) {
      console.error("Failed to generate AI summary:", error);
      return buildFallbackSummary(article);
    } finally {
      inflightMap.delete(cacheKey);
    }
  })();

  inflightMap.set(cacheKey, task);
  return task;
}
