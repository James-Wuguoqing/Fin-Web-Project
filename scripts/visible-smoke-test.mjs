#!/usr/bin/env node

import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const args = new Set(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(process.env.TEST_BASE_URL || "http://127.0.0.1:3000");
const isFast = args.has("--fast") || process.env.TEST_FAST === "1";
const isReportMode = args.has("--report") || process.env.TEST_REPORT === "1";
const slowMo = Number(process.env.TEST_SLOW_MO || (isFast ? 80 : 650));
const browserPath = process.env.TEST_BROWSER_PATH || findBrowserPath();
const videoRequested = isReportMode && process.env.TEST_RECORD_VIDEO !== "0";
const ffmpegPath = videoRequested ? findPlaywrightFfmpegPath() : null;
const shouldRecordVideo = Boolean(videoRequested && ffmpegPath);
const runStartedAt = new Date();
const timestamp = formatTimestamp(runStartedAt);
const projectRoot = process.cwd();
const reportsRoot = join(projectRoot, "reports", "visible-smoke");
const runDir = join(reportsRoot, "runs", timestamp);
const latestDir = join(reportsRoot, "latest");
const activeReportDir = isReportMode ? runDir : null;
const screenshotDir = isReportMode ? join(activeReportDir, "screenshots") : null;
const videoTempDir = isReportMode ? join(activeReportDir, ".video") : null;
const reportVideoPath = isReportMode ? join(activeReportDir, "visible-smoke.webm") : null;
const fakeLogin = {
  email: "tester@example.com",
  registerEmail: "newuser@example.com",
  password: "Password123",
  name: "Test User"
};

const results = [];
const consoleIssues = [];
const terminalLines = [];
let currentStep = null;
let browser;
let context;
let page;

if (!browserPath) {
  fatal(
    "No Chrome or Edge executable was found. Set TEST_BROWSER_PATH to your browser executable path."
  );
}

if (isReportMode) {
  prepareReportDirs();
}

await ensureServerReachable();

try {
  logInfo(`Base URL: ${baseUrl}`);
  logInfo(`Browser: ${browserPath}`);
  logInfo(`Mode: ${isFast ? "fast" : "visible"}; slowMo=${slowMo}ms`);
  if (isReportMode) {
    logInfo(`Report run directory: ${activeReportDir}`);
    if (shouldRecordVideo) {
      logInfo(`Video recording enabled: ${ffmpegPath}`);
    } else if (videoRequested) {
      logInfo("Native Playwright video skipped: ffmpeg was not found. A screenshot replay video will be generated instead.");
    }
  }

  browser = await chromium.launch({
    executablePath: browserPath,
    headless: false,
    slowMo,
    args: ["--start-maximized"]
  });

  context = await browser.newContext({
    viewport: isReportMode ? { width: 1440, height: 900 } : null,
    recordVideo: shouldRecordVideo
      ? {
          dir: videoTempDir,
          size: { width: 1440, height: 900 }
        }
      : undefined
  });

  page = await context.newPage();

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleIssues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleIssues.push(`pageerror: ${error.message}`);
  });

  await installVisualHelpers(page);

  await step(page, "首页加载和核心区块可见", async () => {
    await goto(page, "/");
    await expectHeading(page, "今日市场总览");
    await expectHeading(page, "市场看板");
    await expectText(page, "市场情绪");
    await pageSummary(page);
  });

  await step(page, "市场看板 tab 切换：指数 / 板块 / 外汇", async () => {
    await goto(page, "/");
    await clickAndMark(page, page.getByRole("button", { name: "板块" }), "点击市场看板 tab：板块");
    await expectActiveMarketTab(page, "板块");
    await clickAndMark(page, page.getByRole("button", { name: "外汇" }), "点击市场看板 tab：外汇");
    await expectActiveMarketTab(page, "外汇");
    await clickAndMark(page, page.getByRole("button", { name: "指数" }), "点击市场看板 tab：指数");
    await expectActiveMarketTab(page, "指数");
  });

  await step(page, "首页二级菜单：市场分类", async () => {
    await goto(page, "/?view=catalog");
    await expectHeading(page, "市场分类入口");
    await expectText(page, "打开完整分类页");
    await pageSummary(page);
  });

  await step(page, "主导航页面：深度 / 快讯 / 策略", async () => {
    await goto(page, "/focus");
    await expectHeading(page, "深度栏目 工作台");
    await expectText(page, "封面深读");
    await goto(page, "/flash");
    await expectHeading(page, "快讯 工作台");
    await expectHeading(page, "今日快讯");
    await goto(page, "/insight");
    await expectHeading(page, "策略 工作台");
    await expectHeading(page, "策略摘要");
  });

  await step(page, "各频道二级视图：macro / newsHub / heatmap", async () => {
    await goto(page, "/focus?view=macro");
    await expectText(page, "宏观栏目");
    await goto(page, "/flash?view=newsHub");
    await expectHeading(page, "新闻中心入口");
    await goto(page, "/insight?view=heatmap");
    await expectHeading(page, "策略图表");
    await expectText(page, "资金偏好温度计");
  });

  await step(page, "搜索：展示结果、回车跳转、无结果提示", async () => {
    await goto(page, "/");
    const search = page.getByLabel("搜索市场、板块、新闻");
    await fillAndMark(page, search, "新闻", "输入搜索关键词：新闻");
    await expectVisible(page, page.getByRole("listbox", { name: "搜索结果" }), "搜索结果面板");
    await pressAndMark(page, search, "Enter", "按 Enter 跳转到首个搜索结果");
    await expectUrl(page, "/flash");
    await goto(page, "/");
    await fillAndMark(page, page.getByLabel("搜索市场、板块、新闻"), "zzzz-no-match", "输入无匹配搜索词");
    await expectText(page, "没有找到匹配内容");
  });

  await step(page, "首页登录/注册弹窗：菜单、校验、成功提示、切换", async () => {
    await goto(page, "/");
    await clickAndMark(page, page.getByRole("button", { name: "登录 / 注册" }), "打开登录/注册菜单");
    await clickAndMark(page, page.getByRole("menuitem", { name: "登录" }), "选择登录");
    await expectHeading(page, "登录 FinScope");
    await clickAndMark(page, page.getByRole("button", { name: "立即登录" }), "提交空登录表单");
    await expectText(page, "请输入邮箱或手机号。");
    await fillAndMark(page, page.getByPlaceholder("输入邮箱或手机号"), fakeLogin.email, "输入登录账号");
    await fillAndMark(page, page.getByPlaceholder("输入密码"), fakeLogin.password, "输入登录密码", true);
    await clickAndMark(page, page.getByRole("button", { name: "立即登录" }), "提交登录表单");
    await expectText(page, "前端登录流程已通过");
    await clickAndMark(page, page.getByRole("button", { name: "没有账户？去注册" }), "切换到注册弹窗");
    await expectHeading(page, "注册 FinScope");
    await clickAndMark(page, page.getByRole("button", { name: "创建账户" }), "提交空注册表单");
    await expectText(page, "请输入昵称。");
    await clickAndMark(page, page.getByRole("button", { name: "关闭注册框" }), "关闭注册弹窗");
  });

  await step(page, "独立登录页表单校验和成功提示", async () => {
    await goto(page, "/login");
    await expectHeading(page, "登录 FinScope");
    await clickAndMark(page, page.getByRole("button", { name: "进入工作台" }), "提交空登录页表单");
    await expectText(page, "请输入邮箱或手机号。");
    await fillAndMark(page, page.getByPlaceholder("name@company.com"), fakeLogin.email, "输入登录页账号");
    await fillAndMark(page, page.getByPlaceholder("输入密码"), fakeLogin.password, "输入登录页密码", true);
    await clickAndMark(page, page.getByRole("button", { name: "进入工作台" }), "提交登录页表单");
    await expectText(page, "前端登录流程已通过");
  });

  await step(page, "独立注册页表单校验和成功提示", async () => {
    await goto(page, "/register");
    await expectHeading(page, "注册 FinScope");
    await clickAndMark(page, page.getByRole("button", { name: "创建账户" }), "提交空注册页表单");
    await expectText(page, "请输入昵称。");
    await fillAndMark(page, page.getByPlaceholder("输入你的昵称"), fakeLogin.name, "输入昵称");
    await fillAndMark(page, page.getByPlaceholder("name@company.com"), fakeLogin.registerEmail, "输入注册邮箱");
    await fillAndMark(page, page.getByPlaceholder("至少 8 位密码"), fakeLogin.password, "输入注册密码", true);
    await fillAndMark(page, page.getByPlaceholder("再次输入密码"), fakeLogin.password, "输入确认密码", true);
    await clickAndMark(page, page.getByRole("button", { name: "创建账户" }), "提交注册页表单");
    await expectText(page, "前端注册流程已通过");
  });

  await step(page, "市场分类页", async () => {
    await goto(page, "/markets");
    await expectHeading(page, "市场分类页");
    await expectText(page, "返回首页");
    await expectText(page, "查看新闻中心");
    await pageSummary(page);
  });

  await step(page, "新闻中心与新闻详情页", async () => {
    await goto(page, "/news");
    await expectHeading(page, "财经新闻中心");
    const details = page.getByRole("link", { name: "查看详情" });
    await ensureCountAtLeast(details, 1, "新闻详情链接");
    await clickAndMark(page, details.first(), "打开第一条新闻详情");
    await page.waitForURL((url) => /\/news\/.+/.test(url.pathname), { timeout: 15000 });
    await expectHeading(page, "AI 摘要", 30000);
    await expectHeading(page, "相关文章", 30000);
    await clickAndMark(page, page.getByRole("link", { name: "返回新闻中心" }), "返回新闻中心");
    await expectPath(page, "/news");
  });

  await step(page, "本地 API 健康检查", async () => {
    const home = await fetchJson("/api/market/home");
    assert(home.panels && home.news, "/api/market/home 缺少 panels 或 news");

    await fetchJson("/api/markets");
    const news = await fetchJson("/api/news");
    const firstArticleId = news.articles?.[0]?.id;
    assert(firstArticleId, "/api/news 没有文章 id");
    await fetchJson(`/api/news/${firstArticleId}`);
  });
} finally {
  if (page) {
    try {
      await page.close();
    } catch {
      // The browser may already be closed after a hard failure.
    }
  }

  if (context) {
    try {
      await context.close();
    } catch {
      // The browser may already be closed after a hard failure.
    }
  }

  if (shouldRecordVideo && page?.video()) {
    await saveVideo(page);
  }

  if (isReportMode && videoRequested && !existsSync(reportVideoPath) && browser) {
    await createScreenshotReplayVideo(browser);
  }

  if (browser) {
    await browser.close();
  }
}

printSummary();
writeReportArtifacts();

const failed = results.filter((result) => result.status === "FAIL");
const materialConsoleIssues = getMaterialConsoleIssues();

if (failed.length > 0 || materialConsoleIssues.length > 0) {
  process.exitCode = 1;
}

function prepareReportDirs() {
  mkdirSync(runDir, { recursive: true });
  mkdirSync(screenshotDir, { recursive: true });
  if (shouldRecordVideo) {
    mkdirSync(videoTempDir, { recursive: true });
  }
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join("");
}

function findBrowserPath() {
  const candidates = [
    process.env.CHROME,
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge"
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(resolve(candidate)));
}

function findPlaywrightFfmpegPath() {
  const explicit = process.env.TEST_FFMPEG_PATH || process.env.FFMPEG_PATH;
  if (explicit && existsSync(resolve(explicit))) {
    return resolve(explicit);
  }

  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== "0"
      ? process.env.PLAYWRIGHT_BROWSERS_PATH
      : null,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : null,
    process.env.HOME ? join(process.env.HOME, "Library", "Caches", "ms-playwright") : null,
    process.env.HOME ? join(process.env.HOME, ".cache", "ms-playwright") : null
  ].filter(Boolean);

  const names = new Set(["ffmpeg-win64.exe", "ffmpeg-mac", "ffmpeg-linux"]);
  for (const root of roots) {
    const found = findFileByName(root, names, 3);
    if (found) {
      return found;
    }
  }

  return null;
}

function findFileByName(root, names, depth) {
  if (!root || depth < 0 || !existsSync(root)) {
    return null;
  }

  let entries = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const current = join(root, entry.name);
    if (entry.isFile() && names.has(entry.name)) {
      return current;
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findFileByName(join(root, entry.name), names, depth - 1);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

async function ensureServerReachable() {
  try {
    const response = await fetch(baseUrl);
    if (!response.ok) {
      fatal(`Dev server responded with HTTP ${response.status}. Start it with npm run dev and retry.`);
    }
  } catch (error) {
    fatal(`Cannot reach ${baseUrl}. Start the dev server with npm run dev and retry. ${error.message}`);
  }
}

async function installVisualHelpers(targetPage) {
  await targetPage.addInitScript(() => {
    window.__visibleSmokeHudText = "";

    window.__visibleSmokeEnsureHud = () => {
      let hud = document.getElementById("__visible-smoke-hud");
      if (!hud) {
        hud = document.createElement("div");
        hud.id = "__visible-smoke-hud";
        hud.style.cssText = [
          "position:fixed",
          "top:12px",
          "left:50%",
          "transform:translateX(-50%)",
          "z-index:2147483647",
          "max-width:min(92vw,960px)",
          "padding:10px 16px",
          "border-radius:10px",
          "background:rgba(17,24,39,.94)",
          "color:#fff",
          "font:600 15px/1.45 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
          "box-shadow:0 12px 32px rgba(0,0,0,.28)",
          "pointer-events:none"
        ].join(";");
        document.documentElement.appendChild(hud);
      }
      hud.textContent = window.__visibleSmokeHudText || "Visible smoke test";
    };

    window.__visibleSmokeShowAction = (message) => {
      window.__visibleSmokeHudText = message;
      window.__visibleSmokeEnsureHud();
    };

    window.__visibleSmokeHighlight = (element) => {
      if (!element) return;
      element.scrollIntoView({ block: "center", inline: "center" });
      const oldOutline = element.style.outline;
      const oldBoxShadow = element.style.boxShadow;
      element.style.outline = "4px solid #f97316";
      element.style.boxShadow = "0 0 0 8px rgba(249,115,22,.22)";
      setTimeout(() => {
        element.style.outline = oldOutline;
        element.style.boxShadow = oldBoxShadow;
      }, 1000);
    };

    window.__visibleSmokeClickMarker = (x, y) => {
      const marker = document.createElement("div");
      marker.style.cssText = [
        "position:fixed",
        `left:${x - 16}px`,
        `top:${y - 16}px`,
        "width:32px",
        "height:32px",
        "border-radius:999px",
        "z-index:2147483647",
        "background:rgba(239,68,68,.82)",
        "border:3px solid #fff",
        "box-shadow:0 0 0 8px rgba(239,68,68,.25)",
        "pointer-events:none",
        "transition:opacity .55s ease, transform .55s ease"
      ].join(";");
      document.documentElement.appendChild(marker);
      requestAnimationFrame(() => {
        marker.style.opacity = "0";
        marker.style.transform = "scale(1.8)";
      });
      setTimeout(() => marker.remove(), 700);
    };
  });
}

async function step(targetPage, name, callback) {
  const startedAt = Date.now();
  const index = results.length + 1;
  currentStep = {
    index,
    name,
    status: "RUNNING",
    startedAt: new Date().toISOString(),
    durationMs: 0,
    startUrl: targetPage.url(),
    endUrl: "",
    title: "",
    actions: [],
    assertions: [],
    observations: [],
    screenshot: null,
    screenshotRelative: null,
    detail: ""
  };
  logStep(name);
  try {
    await callback();
    currentStep.status = "PASS";
    logPass(name);
  } catch (error) {
    currentStep.status = "FAIL";
    currentStep.detail = error.message;
    logFail(name, error.message);
  } finally {
    currentStep.durationMs = Date.now() - startedAt;
    currentStep.endUrl = targetPage.url();
    try {
      currentStep.title = await targetPage.title();
    } catch {
      currentStep.title = "";
    }
    await captureStepScreenshot(targetPage, currentStep);
    results.push(currentStep);
    currentStep = null;
  }
}

async function goto(targetPage, path) {
  logAction(`打开页面 ${path}`);
  await targetPage.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await showAction(targetPage, `打开页面 ${path}`);
  await pageSummary(targetPage);
}

async function clickAndMark(targetPage, locator, description) {
  logAction(description);
  await showAction(targetPage, description);
  await ensureUnique(locator, description);
  await locator.evaluate((element) => window.__visibleSmokeHighlight(element));
  const box = await locator.boundingBox();
  await locator.click({ timeout: 15000 });
  if (box) {
    await targetPage.evaluate(
      ({ x, y }) => window.__visibleSmokeClickMarker(x, y),
      { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    );
  }
  await delay(isFast ? 150 : 500);
  await logCurrentPage(targetPage);
}

async function fillAndMark(targetPage, locator, value, description, secret = false) {
  const displayedValue = secret ? "*".repeat(value.length) : value;
  logAction(`${description}: ${displayedValue}`);
  await showAction(targetPage, description);
  await ensureUnique(locator, description);
  await locator.evaluate((element) => window.__visibleSmokeHighlight(element));
  await locator.fill(value, { timeout: 15000 });
  await delay(isFast ? 100 : 350);
}

async function pressAndMark(targetPage, locator, key, description) {
  logAction(`${description}: ${key}`);
  await showAction(targetPage, `${description}: ${key}`);
  await ensureUnique(locator, description);
  await locator.press(key, { timeout: 15000 });
  await delay(isFast ? 150 : 450);
  await logCurrentPage(targetPage);
}

async function showAction(targetPage, message) {
  try {
    await targetPage.evaluate((text) => window.__visibleSmokeShowAction(text), message);
  } catch {
    // Navigations can temporarily clear the helper. The next page action reinstalls it.
  }
}

async function expectHeading(targetPage, name, timeout = 15000) {
  await targetPage.getByRole("heading", { name }).first().waitFor({ state: "visible", timeout });
  logAssertion(`看到标题：${name}`);
}

async function expectText(targetPage, text, timeout = 15000) {
  await targetPage.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
  logAssertion(`看到文本：${text}`);
}

async function expectVisible(_targetPage, locator, label, timeout = 15000) {
  await locator.waitFor({ state: "visible", timeout });
  logAssertion(`看到元素：${label}`);
}

async function expectUrl(targetPage, fragment) {
  await targetPage.waitForURL((url) => url.toString().includes(fragment), { timeout: 15000 });
  logAssertion(`URL 包含：${fragment}`);
}

async function expectPath(targetPage, path) {
  await targetPage.waitForURL((url) => url.pathname === path, { timeout: 15000 });
  logAssertion(`路径等于：${path}`);
}

async function expectActiveMarketTab(targetPage, label) {
  const tab = targetPage.getByRole("button", { name: label });
  const active = await tab.getAttribute("data-active");
  assert(active === "true", `${label} tab 没有变为激活状态`);
  logAssertion(`市场 tab 已激活：${label}`);
}

async function ensureUnique(locator, label) {
  const count = await locator.count();
  assert(count === 1, `${label} 匹配到 ${count} 个元素`);
}

async function ensureCountAtLeast(locator, minimum, label) {
  const count = await locator.count();
  assert(count >= minimum, `${label} 数量为 ${count}，小于 ${minimum}`);
}

async function fetchJson(path) {
  logAction(`请求 API ${path}`);
  const response = await fetch(`${baseUrl}${path}`);
  assert(response.ok, `${path} 返回 HTTP ${response.status}`);
  logAssertion(`${path} 返回 HTTP ${response.status}`);
  return response.json();
}

async function pageSummary(targetPage) {
  await logCurrentPage(targetPage);
  const headings = await targetPage
    .locator("h1, h2")
    .evaluateAll((elements) =>
      elements
        .map((element) => element.textContent?.trim())
        .filter(Boolean)
        .slice(0, 6)
    );
  if (headings.length > 0) {
    logPage(`页面标题摘要：${headings.join(" | ")}`);
  }
}

async function logCurrentPage(targetPage) {
  logPage(`${await targetPage.title()} -> ${targetPage.url()}`);
}

async function captureStepScreenshot(targetPage, stepRecord) {
  if (!isReportMode) return;
  const fileName = `${String(stepRecord.index).padStart(2, "0")}-${slugify(stepRecord.name)}.png`;
  const screenshotPath = join(screenshotDir, fileName);
  await targetPage.screenshot({ path: screenshotPath, fullPage: false });
  stepRecord.screenshot = screenshotPath;
  stepRecord.screenshotRelative = relative(activeReportDir, screenshotPath).replaceAll("\\", "/");
}

async function saveVideo(targetPage) {
  if (!shouldRecordVideo || !targetPage.video()) return;
  try {
    const rawVideoPath = await targetPage.video().path();
    if (rawVideoPath && existsSync(rawVideoPath)) {
      copyFileSync(rawVideoPath, reportVideoPath);
    }
  } catch (error) {
    logInfo(`Video recording could not be saved: ${error.message}`);
  }
}

async function createScreenshotReplayVideo(activeBrowser) {
  const frames = results
    .filter((result) => result.screenshot && existsSync(result.screenshot))
    .map((result) => ({
      index: result.index,
      name: result.name,
      status: result.status,
      url: result.endUrl,
      image: `data:image/png;base64,${readFileSync(result.screenshot).toString("base64")}`
    }));

  if (frames.length === 0) {
    logInfo("Screenshot replay video skipped: no screenshots were available.");
    return;
  }

  let replayContext;
  try {
    replayContext = await activeBrowser.newContext({ viewport: { width: 1440, height: 900 } });
    const replayPage = await replayContext.newPage();
    const byteArray = await replayPage.evaluate(async ({ frames: browserFrames }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1440;
      canvas.height = 900;
      document.body.style.margin = "0";
      document.body.style.background = "#0f172a";
      document.body.appendChild(canvas);

      const ctx = canvas.getContext("2d");
      const stream = canvas.captureStream(4);
      const mimeType = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm"
      ].find((type) => window.MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      const done = new Promise((resolve) => {
        recorder.onstop = resolve;
      });
      const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const loadImage = (src) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = src;
        });

      const drawFrame = async (frame) => {
        const image = await loadImage(frame.image);
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const maxWidth = canvas.width;
        const maxHeight = canvas.height - 78;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        const x = (canvas.width - width) / 2;
        const y = 78 + (maxHeight - height) / 2;
        ctx.drawImage(image, x, y, width, height);

        ctx.fillStyle = "rgba(15,23,42,.96)";
        ctx.fillRect(0, 0, canvas.width, 78);
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 26px Microsoft YaHei, Segoe UI, sans-serif";
        ctx.fillText(`${String(frame.index).padStart(2, "0")} ${frame.name}`, 28, 32);
        ctx.font = "500 17px Microsoft YaHei, Segoe UI, sans-serif";
        ctx.fillStyle = frame.status === "PASS" ? "#86efac" : "#fca5a5";
        ctx.fillText(frame.status, 28, 58);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(frame.url, 106, 58);
      };

      recorder.start();
      for (const frame of browserFrames) {
        await drawFrame(frame);
        await pause(850);
      }
      recorder.stop();
      await done;

      const blob = new Blob(chunks, { type: mimeType || "video/webm" });
      const buffer = await blob.arrayBuffer();
      return Array.from(new Uint8Array(buffer));
    }, { frames });

    writeFileSync(reportVideoPath, Buffer.from(byteArray));
    if (existsSync(videoTempDir)) {
      rmSync(videoTempDir, { recursive: true, force: true });
    }
    logInfo(`Screenshot replay video written: ${reportVideoPath}`);
  } catch (error) {
    logInfo(`Screenshot replay video could not be generated: ${error.message}`);
    if (existsSync(reportVideoPath)) {
      unlinkSync(reportVideoPath);
    }
  } finally {
    if (replayContext) {
      await replayContext.close();
    }
  }
}

function writeReportArtifacts() {
  if (!isReportMode) return;
  const finishedAt = new Date();
  const failed = results.filter((result) => result.status === "FAIL");
  const materialConsoleIssues = getMaterialConsoleIssues();
  const report = {
    title: "FinScope 可视化功能测试报告",
    project: "FinScope Next",
    baseUrl,
    browserPath,
    mode: isFast ? "fast" : "visible",
    startedAt: runStartedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - runStartedAt.getTime(),
    reportDir: activeReportDir,
    video: existsSync(reportVideoPath) ? reportVideoPath : null,
    videoRelative: existsSync(reportVideoPath) ? relative(activeReportDir, reportVideoPath).replaceAll("\\", "/") : null,
    videoStatus: getVideoStatus(),
    videoNote: existsSync(reportVideoPath)
      ? shouldRecordVideo
        ? "完整浏览器录屏已生成。"
        : "当前环境未安装 Playwright ffmpeg；已根据关键截屏生成步骤回放视频，DOCX 内也已嵌入截图。"
      : "当前环境未安装 Playwright ffmpeg；报告已嵌入关键截屏作为可视化证据。",
    terminalLog: join(activeReportDir, "terminal.log"),
    terminalLogRelative: "terminal.log",
    summary: {
      passed: results.length - failed.length,
      failed: failed.length,
      warnings: 0,
      materialConsoleIssues: materialConsoleIssues.length,
      total: results.length
    },
    results,
    consoleIssues,
    materialConsoleIssues
  };

  writeFileSync(join(activeReportDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(join(activeReportDir, "terminal.log"), `${terminalLines.join("\n")}\n`, "utf8");

  rmSync(latestDir, { recursive: true, force: true });
  mkdirSync(dirname(latestDir), { recursive: true });
  cpSync(activeReportDir, latestDir, { recursive: true });
  logInfo(`Report artifacts copied to ${latestDir}`);
}

function getMaterialConsoleIssues() {
  return consoleIssues;
}

function getVideoStatus() {
  if (!existsSync(reportVideoPath)) {
    return videoRequested ? "skipped" : "disabled";
  }
  return shouldRecordVideo ? "recorded" : "screenshot-replay";
}

function printSummary() {
  const failed = results.filter((result) => result.status === "FAIL");
  const materialConsoleIssues = getMaterialConsoleIssues();

  logRaw("log", "");
  logRaw("log", "========== Visible Smoke Test Summary ==========");
  logRaw("log", `Passed: ${results.length - failed.length}`);
  logRaw("log", `Failed: ${failed.length}`);
  logRaw("log", "Warnings: 0");
  logRaw("log", `Material console issues: ${materialConsoleIssues.length}`);

  for (const result of results) {
    logRaw(
      "log",
      `${result.status === "PASS" ? "[PASS]" : "[FAIL]"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`
    );
  }

  for (const issue of materialConsoleIssues) {
    logRaw("log", `[FAIL] Console issue: ${issue}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function fatal(message) {
  logRaw("error", `[FAIL] ${message}`);
  process.exit(1);
}

function logInfo(message) {
  logRaw("log", `[INFO] ${message}`);
}

function logStep(message) {
  logRaw("log", `\n[STEP] ${message}`);
}

function logAction(message) {
  if (currentStep) {
    currentStep.actions.push(message);
  }
  logRaw("log", `[ACTION] ${message}`);
}

function logAssertion(message) {
  if (currentStep) {
    currentStep.assertions.push(message);
  }
  logRaw("log", `[PAGE] ${message}`);
}

function logPage(message) {
  if (currentStep) {
    currentStep.observations.push(message);
  }
  logRaw("log", `[PAGE] ${message}`);
}

function logPass(message) {
  logRaw("log", `[PASS] ${message}`);
}

function logFail(name, message) {
  logRaw("error", `[FAIL] ${name}: ${message}`);
}

function logRaw(method, message) {
  terminalLines.push(message);
  console[method](message);
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
