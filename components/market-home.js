"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getInitialAuthValues, submitAuthRequest, validateAuthValues } from "../lib/auth-client";
import styles from "./market-home.module.css";

const tabs = [
  { key: "indices", label: "指数" },
  { key: "sectors", label: "板块" },
  { key: "fx", label: "外汇" }
];

const navItems = [
  {
    key: "overview",
    label: "市场概览",
    href: "/",
    children: [
      { key: "board", label: "市场看板" },
      { key: "catalog", label: "市场分类" }
    ]
  },
  {
    key: "focus",
    label: "深度栏目",
    href: "/focus",
    children: [
      { key: "feature", label: "封面深读" },
      { key: "macro", label: "宏观栏目" }
    ]
  },
  {
    key: "news",
    label: "快讯",
    href: "/flash",
    children: [
      { key: "headlines", label: "新闻卡片" },
      { key: "newsHub", label: "新闻中心" }
    ]
  },
  {
    key: "insight",
    label: "策略",
    href: "/insight",
    children: [
      { key: "watchlist", label: "本周关注" },
      { key: "heatmap", label: "策略图表" }
    ]
  }
];

const utilityItems = [
  { key: "feedback", label: "反馈" },
  { key: "alerts", label: "提醒" },
  { key: "help", label: "帮助" }
];

const heroStatNotes = {
  "追踪资产": "首页覆盖范围",
  "宏观指标": "FRED 实时追踪",
  "定时刷新": "服务端缓存刷新"
};
const updatedTimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function getToneLabel(tone) {
  if (tone === "positive") return "上行";
  if (tone === "negative") return "回落";
  return "平衡";
}

function getChangeScore(change) {
  const numeric = Number.parseFloat(String(change).replace(/[^\d.-]/g, ""));

  if (!Number.isFinite(numeric)) {
    return 48;
  }

  return Math.max(22, Math.min(92, Math.round(Math.abs(numeric) * 18 + 28)));
}

function formatLastUpdated(value) {
  if (!value) {
    return "服务端刷新已启用";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "服务端刷新已启用";
  }

  return `上次更新 ${updatedTimeFormatter.format(parsed)}`;
}

function getStatusToneClass(tone, stylesMap) {
  if (tone === "warning") return stylesMap.statusWarning;
  if (tone === "neutral") return stylesMap.statusNeutral;
  return stylesMap.statusPositive;
}

function normalizeSearchValue(value = "") {
  return String(value).trim().toLowerCase();
}

function matchesSearch(fields, query) {
  const tokens = normalizeSearchValue(query).split(/\s+/).filter(Boolean);
  const normalizedFields = fields.map((field) => normalizeSearchValue(field)).filter(Boolean);

  return tokens.every((token) => normalizedFields.some((field) => field.includes(token)));
}

function buildSearchResults(data, query) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return [];
  }

  const navResults = navItems.flatMap((item) => [
    {
      id: `nav-${item.key}`,
      type: "栏目",
      title: item.label,
      description: item.children.map((child) => child.label).join(" / "),
      href: item.href,
      fields: [item.label, item.href, ...item.children.map((child) => child.label)]
    },
    ...item.children.map((child) => ({
      id: `nav-${item.key}-${child.key}`,
      type: "视图",
      title: `${item.label} · ${child.label}`,
      description: `打开 ${item.label} 的 ${child.label}`,
      href: `${item.href}?view=${child.key}`,
      fields: [item.label, child.label, child.key]
    }))
  ]);

  const marketResults = Object.entries(data.panels || {}).flatMap(([panelKey, items]) =>
    (items || []).map((item) => ({
      id: `market-${panelKey}-${item.label}`,
      type: "市场",
      title: item.label,
      description: `${item.value} · ${item.change}`,
      href: "/?view=board",
      fields: [item.label, item.value, item.change, panelKey]
    }))
  );

  const categoryResults = (data.marketCategories || []).map((item) => ({
    id: `category-${item.title}`,
    type: "分类",
    title: item.title,
    description: item.description,
    href: "/markets",
    fields: [item.title, item.description]
  }));

  const newsResults = (data.news || []).map((item) => ({
    id: `news-${item.id}`,
    type: "新闻",
    title: item.title,
    description: item.summary,
    href: item.id ? `/news/${item.id}` : "/news",
    fields: [
      item.title,
      item.summary,
      item.source,
      item.badge,
      item.sentiment,
      ...(item.topics || []),
      ...(item.tickers || [])
    ]
  }));

  return [...navResults, ...marketResults, ...categoryResults, ...newsResults]
    .filter((result) => matchesSearch(result.fields, normalizedQuery))
    .slice(0, 8);
}

export default function MarketHome({ data, initialSection = "overview", initialView = "board" }) {
  const router = useRouter();
  const [activePanel, setActivePanel] = useState("indices");
  const [riskOff, setRiskOff] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [authModal, setAuthModal] = useState(null);
  const [authValues, setAuthValues] = useState(() => getInitialAuthValues("login"));
  const [authErrors, setAuthErrors] = useState({});
  const [authNotice, setAuthNotice] = useState(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authModalOffset, setAuthModalOffset] = useState({ x: 0, y: 0 });
  const [authModalMaximized, setAuthModalMaximized] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const searchResults = buildSearchResults(data, deferredSearchQuery);
  const showSearchResults = searchFocused && searchQuery.trim().length > 0;
  const searchRef = useRef(null);
  const authMenuRef = useRef(null);
  const authModalDragRef = useRef(null);
  const activeNav = initialSection;
  const sentimentScore = riskOff ? Math.min(data.marketSentiment.score, 42) : data.marketSentiment.score;
  const sentimentLabel = riskOff ? "Risk-Off" : data.marketSentiment.label;
  const activeItems = data.panels[activePanel] ?? [];
  const currentNav = navItems.find((item) => item.key === activeNav);
  const currentBasePath = currentNav?.href || "/";
  const activeSubnav =
    currentNav?.children.find((child) => child.key === initialView)?.key ||
    currentNav?.children[0]?.key ||
    initialView;
  const currentChild = currentNav?.children.find((child) => child.key === activeSubnav);
  const sectionIntros = {
    overview: {
      eyebrow: "Markets. Macro. Momentum.",
      title: "把复杂市场，整理成一眼能读懂的财经首页。",
      body: "聚合指数、板块、外汇、商品与重点新闻，让读者在进入页面的第一分钟就抓住市场节奏。"
    },
    focus: {
      eyebrow: "Cover Story",
      title: "深度栏目",
      body: "把封面深读与宏观栏目拆成独立浏览入口，让内容页真正像内容页，而不是停留在首页外壳里。"
    },
    news: {
      eyebrow: "Top Stories",
      title: "快讯中心",
      body: "集中浏览新闻卡片与新闻中心入口，快速追踪当日市场事件。"
    },
    insight: {
      eyebrow: "Strategy Note",
      title: "策略视角",
      body: "围绕本周关注与策略图表组织内容，让策略页承担独立分析入口。"
    }
  };
  const currentIntro = sectionIntros[activeNav] || sectionIntros.overview;
  const dashboardTitle = activeNav === "overview" ? "今日市场总览" : `${currentNav?.label} 工作台`;
  const dashboardBody =
    activeNav === "overview"
      ? "在同一个工作台里查看市场、快讯和策略更新，用更轻量的方式完成每日浏览。"
      : currentIntro.body;
  const freshnessNote = data.updatedLabel || "服务端缓存与实时行情同步已经接入当前工作台。";
  const syncStatus = data.syncStatus || {
    label: "最新",
    detail: freshnessNote,
    tone: "positive"
  };
  const lastUpdatedNote = formatLastUpdated(data.updatedAt);
  const overviewKpis = [
    {
      label: "市场情绪",
      value: sentimentLabel,
      meta: data.marketSentiment.summary,
      tone: riskOff ? "negative" : "positive"
    },
    ...data.heroStats.map((item, index) => ({
      label: item.label,
      value: item.value,
      meta: heroStatNotes[item.label] || "工作台实时统计",
      tone: index === 0 ? "positive" : "neutral"
    }))
  ];

  useEffect(() => {
    function handlePointerDown(event) {
      if (!authMenuRef.current?.contains(event.target)) {
        setAuthMenuOpen(false);
      }

      if (!searchRef.current?.contains(event.target)) {
        setSearchFocused(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function handleSearchSubmit(event) {
    event.preventDefault();

    if (searchResults[0]) {
      setSearchFocused(false);
      router.push(searchResults[0].href);
    }
  }

  function handleSearchResultClick() {
    setSearchFocused(false);
    setSearchQuery("");
  }

  function openAuthModal(mode) {
    setAuthModal(mode);
    setAuthValues(getInitialAuthValues(mode));
    setAuthErrors({});
    setAuthNotice(null);
    setAuthSubmitting(false);
    setAuthModalOffset({ x: 0, y: 0 });
    setAuthModalMaximized(false);
  }

  function closeAuthModal() {
    setAuthModal(null);
    setAuthErrors({});
    setAuthNotice(null);
    setAuthSubmitting(false);
    setAuthModalOffset({ x: 0, y: 0 });
    setAuthModalMaximized(false);
    authModalDragRef.current = null;
  }

  function restoreAuthModalSize() {
    setAuthModalMaximized(false);
    setAuthModalOffset({ x: 0, y: 0 });
    authModalDragRef.current = null;
  }

  function maximizeAuthModal() {
    setAuthModalMaximized(true);
    setAuthModalOffset({ x: 0, y: 0 });
    authModalDragRef.current = null;
  }

  function isInteractiveAuthTarget(target) {
    return target instanceof Element
      ? Boolean(target.closest("button, a, input, textarea, select, label, [role='tab']"))
      : false;
  }

  function handleAuthModalPointerDown(event) {
    if (authModalMaximized || event.button !== 0 || isInteractiveAuthTarget(event.target)) {
      return;
    }

    authModalDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: authModalOffset.x,
      originY: authModalOffset.y
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handleAuthModalPointerMove(event) {
    const dragState = authModalDragRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    setAuthModalOffset({
      x: dragState.originX + event.clientX - dragState.startX,
      y: dragState.originY + event.clientY - dragState.startY
    });
  }

  function handleAuthModalPointerEnd(event) {
    const dragState = authModalDragRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    authModalDragRef.current = null;
  }

  function handleAuthFieldChange(fieldName, value) {
    setAuthValues((currentValues) => ({
      ...currentValues,
      [fieldName]: value
    }));
    setAuthErrors((currentErrors) => {
      if (!currentErrors[fieldName]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[fieldName];
      return nextErrors;
    });
    setAuthNotice(null);
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();

    const mode = authModal || "login";
    const nextErrors = validateAuthValues(mode, authValues);

    if (Object.keys(nextErrors).length > 0) {
      setAuthErrors(nextErrors);
      setAuthNotice({
        tone: "error",
        message: "请先修正表单中的提示。"
      });
      return;
    }

    setAuthSubmitting(true);
    setAuthNotice(null);

    try {
      const result = await submitAuthRequest(mode, authValues);

      setAuthNotice({
        tone: "success",
        message: result.message
      });
    } catch (error) {
      setAuthNotice({
        tone: "error",
        message: error.message || "提交失败，请稍后再试。"
      });
    } finally {
      setAuthSubmitting(false);
    }
  }

  return (
    <div className={`${styles.siteShell} ${riskOff ? styles.riskOff : ""}`}>
      <div className={styles.dashboardShell}>
        <header className={styles.topbar}>
          <Link className={styles.brand} href="/">
            <span className={styles.brandMark}>F</span>
            <span>
              <strong>FinScope</strong>
              <small>Finance Workspace</small>
            </span>
          </Link>

          <p className={styles.sidebarSectionLabel}>Workspace</p>

          <nav className={styles.nav} aria-label="主导航">
            {navItems.map((item) => (
              <a
                key={item.key}
                className={activeNav === item.key ? styles.navActive : ""}
                href={item.href}
                data-nav={item.key}
              >
                <span
                  className={`${styles.navGlyph} ${styles[`navGlyph${item.key}`]}`}
                  aria-hidden="true"
                />
                {item.label}
              </a>
            ))}
          </nav>
        </header>

        <main className={styles.mainPanel}>
          <div className={styles.utilityBar}>
            <form className={styles.searchWrap} ref={searchRef} role="search" onSubmit={handleSearchSubmit}>
              <label className={styles.searchBar}>
                <span className={styles.searchIcon} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="搜索市场、板块、新闻..."
                  value={searchQuery}
                  aria-label="搜索市场、板块、新闻"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onFocus={() => setSearchFocused(true)}
                />
                {searchQuery ? (
                  <button
                    className={styles.searchClear}
                    type="button"
                    aria-label="清空搜索"
                    onClick={() => {
                      setSearchQuery("");
                      setSearchFocused(false);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </label>

              {showSearchResults ? (
                <div className={styles.searchResults} role="listbox" aria-label="搜索结果">
                  {searchResults.length > 0 ? (
                    searchResults.map((result) => (
                      <Link
                        key={result.id}
                        className={styles.searchResultItem}
                        href={result.href}
                        role="option"
                        onClick={handleSearchResultClick}
                      >
                        <span>{result.type}</span>
                        <strong>{result.title}</strong>
                        <small>{result.description}</small>
                      </Link>
                    ))
                  ) : (
                    <p className={styles.searchEmpty}>没有找到匹配内容，试试搜索“新闻”“市场”或资产名称。</p>
                  )}
                </div>
              ) : null}
            </form>

            <div className={styles.utilityActions} aria-label="页面工具">
              {utilityItems.map((item) => (
                <button key={item.key} className={styles.utilityButton} type="button">
                  <span className={`${styles.utilityIcon} ${styles[`utilityIcon${item.key}`]}`} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              ))}
              <button className={styles.profileButton} type="button" aria-label="账户中心">
                FS
              </button>
              <div className={styles.authPanel}>
                <div className={styles.authMenu} ref={authMenuRef}>
                  <button
                    className={`${styles.authTrigger} ${authMenuOpen ? styles.authTriggerActive : ""}`}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={authMenuOpen}
                    onClick={() => setAuthMenuOpen((value) => !value)}
                  >
                    <span>登录 / 注册</span>
                    <span className={styles.authCaret} aria-hidden="true">
                      ▾
                    </span>
                  </button>

                  {authMenuOpen ? (
                    <div className={styles.authDropdown} role="menu" aria-label="账户菜单">
                      <button
                        className={styles.authDropdownItem}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          openAuthModal("login");
                          setAuthMenuOpen(false);
                        }}
                      >
                        <span>登录</span>
                      </button>
                      <button
                        className={styles.authDropdownItem}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          openAuthModal("register");
                          setAuthMenuOpen(false);
                        }}
                      >
                        <span>注册</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.contentViewport}>
            <div className={styles.scrollTopFade} aria-hidden="true" />
            <section className={styles.pageIntro}>
              <div>
                <p className={styles.pageKicker}>Workspace</p>
                <h1>{dashboardTitle}</h1>
                <p>{dashboardBody}</p>
              </div>
              <div className={styles.pageMetaCard}>
                <span>Live</span>
                <strong>{currentNav?.label}</strong>
                <small>{freshnessNote}</small>
              </div>
            </section>

            <section className={`${styles.syncStatusBar} ${getStatusToneClass(syncStatus.tone, styles)}`}>
              <div className={styles.syncStatusBadgeWrap}>
                <span className={styles.syncStatusDot} aria-hidden="true" />
                <strong>{syncStatus.label}</strong>
              </div>
              <p>{syncStatus.detail}</p>
            </section>

            <nav className={styles.breadcrumbs} aria-label="面包屑">
              <Link href="/">FinScope</Link>
              <span>/</span>
              <Link href={currentBasePath}>{currentNav?.label}</Link>
            </nav>

            {activeNav === "overview" ? (
              <section className={styles.hero}>
                <div className={styles.heroCopy}>
                  <p className={styles.eyebrow}>{currentIntro.eyebrow}</p>
                  <h1>{currentIntro.title}</h1>
                  <p className={styles.heroText}>{currentIntro.body}</p>
                  <div className={styles.heroActions}>
                    <Link className={styles.primaryBtn} href="/">
                      进入行情看板
                    </Link>
                    <button
                      className={styles.ghostBtn}
                      type="button"
                      onClick={() => setRiskOff((value) => !value)}
                    >
                      切换风险偏好
                    </button>
                    <Link className={styles.secondaryLink} href="/markets">
                      市场分类页
                    </Link>
                  </div>
                  <div className={styles.tickerRow} aria-label="市场简报">
                    {data.tickerTape.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                </div>

                <aside className={styles.heroPanel}>
                  <div className={styles.heroCard}>
                    <p>市场情绪</p>
                    <h2>{sentimentLabel}</h2>
                    <div className={styles.sentimentBar}>
                      <span style={{ width: `${sentimentScore}%` }} />
                    </div>
                    <small className={styles.sentimentSummary}>{data.marketSentiment.summary}</small>
                    <div className={styles.heroStatusLine}>
                      <span>{lastUpdatedNote}</span>
                      <strong>{syncStatus.label}</strong>
                    </div>
                  </div>
                </aside>
              </section>
            ) : null}

            {activeNav !== "overview" ? (
              <section className={styles.sectionHero}>
                <div className={styles.sectionHeroCopy}>
                  <p className={styles.eyebrow}>{currentIntro.eyebrow}</p>
                  <h1>{currentIntro.title}</h1>
                  <p className={styles.heroText}>{currentIntro.body}</p>
                </div>
                <div className={styles.sectionHeroMeta}>
                  <span>{currentNav?.label}</span>
                  <strong>{currentChild?.label}</strong>
                </div>
              </section>
            ) : null}

            <section className={styles.contentStage}>
              <div className={styles.subnavBar}>
                <div className={styles.subnavHeader}>
                  <p className={styles.eyebrow}>Section Menu</p>
                  <h2>{currentNav?.label}</h2>
                </div>
                <div className={styles.subnavTabs} role="tablist" aria-label="二级菜单">
                  {currentNav?.children.map((child) => (
                    <a
                      key={child.key}
                      className={`${styles.subnavTab} ${activeSubnav === child.key ? styles.subnavTabActive : ""}`}
                      href={`${currentBasePath}?view=${child.key}`}
                    >
                      {child.label}
                    </a>
                  ))}
                </div>
              </div>

              {activeNav === "overview" && activeSubnav === "board" ? (
                <section className={styles.boardSection}>
                  <div className={styles.kpiGrid}>
                    {overviewKpis.map((item) => (
                      <article
                        key={`${item.label}-${item.value}`}
                        className={`${styles.kpiCard} ${styles[`kpi${item.tone}`] || ""}`}
                      >
                        <div className={styles.kpiCardHeader}>
                          <span>{item.label}</span>
                          <i aria-hidden="true" />
                        </div>
                        <strong>{item.value}</strong>
                        <p>{item.meta}</p>
                      </article>
                    ))}
                  </div>

                  <div className={styles.sectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>Live Board</p>
                      <h2>市场看板</h2>
                    </div>
                    <div className={styles.tabset} role="tablist" aria-label="市场栏目">
                      {tabs.map((tab) => (
                        <button
                          key={tab.key}
                          className={`${styles.tab} ${activePanel === tab.key ? styles.tabActive : ""}`}
                          data-active={activePanel === tab.key}
                          type="button"
                          onClick={() => setActivePanel(tab.key)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.panelGrid}>
                    {activeItems.map((item) => (
                      <article key={item.label} className={`${styles.marketCard} ${styles[item.tone]}`}>
                        <div className={styles.marketCardHeader}>
                          <p>{item.label}</p>
                          <span className={styles.marketCardTag}>{getToneLabel(item.tone)}</span>
                        </div>
                        <h3>{item.value}</h3>
                        <span className={styles.marketCardChange}>{item.change}</span>
                        <div className={styles.marketCardTrack}>
                          <i style={{ width: `${getChangeScore(item.change)}%` }} />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeNav === "overview" && activeSubnav === "catalog" ? (
                <>
                  <section className={styles.catalogSection}>
                    <div className={styles.sectionHeading}>
                      <div>
                        <p className={styles.eyebrow}>Markets Catalog</p>
                        <h2>市场分类入口</h2>
                      </div>
                      <Link className={styles.inlineLink} href="/markets">
                        打开完整分类页
                      </Link>
                    </div>

                    <div className={styles.catalogGrid}>
                      {data.marketCategories.map((item) => (
                        <article key={item.title} className={styles.catalogCard}>
                          <h3>{item.title}</h3>
                          <p>{item.description}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}

              {activeNav === "focus" && activeSubnav === "feature" ? (
                <section className={styles.focusSection}>
                  <article className={styles.featureStory}>
                    <p className={styles.eyebrow}>Cover Story</p>
                    <h2>{data.featureStory.title}</h2>
                    <p>{data.featureStory.body}</p>
                    <a className={styles.inlineLinkButton} href="/insight">
                      {data.featureStory.linkLabel}
                    </a>
                  </article>
                </section>
              ) : null}

              {activeNav === "focus" && activeSubnav === "macro" ? (
                <section className={styles.focusSection}>
                  <div className={styles.miniColumns}>
                    {data.macroColumns.map((item) => (
                      <article key={item.title}>
                        <p className={styles.miniKicker}>{item.kicker}</p>
                        <h3>{item.title}</h3>
                        <p>{item.body}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeNav === "news" && activeSubnav === "headlines" ? (
                <section className={styles.newsSection}>
                  <div className={styles.sectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>Top Stories</p>
                      <h2>今日快讯</h2>
                    </div>
                  </div>

                  <div className={styles.newsGrid}>
                    {data.news.map((item, index) => (
                      <article
                        key={`${item.badge}-${item.title}`}
                        className={`${styles.newsCard} ${index === 0 ? styles.featured : ""}`}
                      >
                        <span>{item.badge}</span>
                        <h3>{item.title}</h3>
                        <p>{item.summary}</p>
                        <div className={styles.newsActions}>
                          <Link href={`/news/${item.id}`}>查看详情</Link>
                          {item.url ? (
                            <a href={item.url} target="_blank" rel="noreferrer">
                              原文
                            </a>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeNav === "news" && activeSubnav === "newsHub" ? (
                <section className={styles.catalogSection}>
                  <div className={styles.sectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>News Center</p>
                      <h2>新闻中心入口</h2>
                    </div>
                    <Link className={styles.inlineLink} href="/news">
                      打开新闻中心
                    </Link>
                  </div>

                  <div className={styles.catalogGrid}>
                    {data.news.map((item) => (
                      <article key={item.id} className={styles.catalogCard}>
                        <h3>{item.title}</h3>
                        <p>{item.summary}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeNav === "insight" && activeSubnav === "watchlist" ? (
                <section className={styles.insightSection}>
                  <div className={styles.sectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>Strategy Note</p>
                      <h2>策略摘要</h2>
                    </div>
                  </div>

                  <div className={styles.insightLayout}>
                    <article className={styles.insightCard}>
                      <h3>本周关注</h3>
                      <ul>
                        {data.insight.watchlist.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </article>
                  </div>
                </section>
              ) : null}

              {activeNav === "insight" && activeSubnav === "heatmap" ? (
                <section className={styles.insightSection}>
                  <div className={styles.sectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>Strategy Note</p>
                      <h2>策略图表</h2>
                    </div>
                  </div>

                  <div className={styles.insightLayout}>
                    <article className={styles.chartCard} aria-label="趋势示意图">
                      <div className={styles.chartHeader}>
                        <p>资金偏好温度计</p>
                        <strong>{data.insight.score}</strong>
                      </div>
                      <div className={styles.chart}>
                        {data.insight.bars.map((height, index) => (
                          <span key={`${height}-${index}`} style={{ height: `${height}%` }} />
                        ))}
                      </div>
                    </article>
                  </div>
                </section>
              ) : null}
            </section>
            <div className={styles.scrollBottomFade} aria-hidden="true" />
          </div>

        </main>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span className={styles.footerMark} aria-hidden="true">
            F
          </span>
          <p>财经前沿</p>
        </div>
        <span>当前由 Twelve Data、Alpha Vantage、FRED 与 Stooq 提供服务端动态数据</span>
      </footer>

      {authModal ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onClick={closeAuthModal}
        >
          <div
            className={`${styles.authModal} ${authModalMaximized ? styles.authModalMaximized : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            style={
              authModalMaximized
                ? undefined
                : { transform: `translate3d(${authModalOffset.x}px, ${authModalOffset.y}px, 0)` }
            }
            onPointerDown={handleAuthModalPointerDown}
            onPointerMove={handleAuthModalPointerMove}
            onPointerUp={handleAuthModalPointerEnd}
            onPointerCancel={handleAuthModalPointerEnd}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalTopbar}>
              <div>
                <p className={styles.eyebrow}>Account Access</p>
                <h2 id="auth-modal-title">
                  {authModal === "login" ? "登录 FinScope" : "注册 FinScope"}
                </h2>
              </div>
              <div className={styles.modalWindowControls} aria-label="弹窗窗口控制">
                <button
                  className={styles.modalWindowButton}
                  type="button"
                  aria-label="恢复默认大小"
                  onClick={restoreAuthModalSize}
                >
                  -
                </button>
                <button
                  className={styles.modalWindowButton}
                  type="button"
                  aria-label="满屏显示"
                  onClick={maximizeAuthModal}
                >
                  □
                </button>
                <button
                  className={`${styles.modalWindowButton} ${styles.modalClose}`}
                  type="button"
                  aria-label={authModal === "login" ? "关闭登录框" : "关闭注册框"}
                  onClick={closeAuthModal}
                >
                  ×
                </button>
              </div>
            </div>

            <div className={styles.modalTabs} role="tablist" aria-label="登录注册切换">
              <button
                className={`${styles.modalTab} ${authModal === "login" ? styles.modalTabActive : ""}`}
                type="button"
                onClick={() => openAuthModal("login")}
              >
                登录
              </button>
              <button
                className={`${styles.modalTab} ${authModal === "register" ? styles.modalTabActive : ""}`}
                type="button"
                onClick={() => openAuthModal("register")}
              >
                注册
              </button>
            </div>

            <form className={styles.authForm} noValidate onSubmit={handleAuthSubmit}>
              {authModal === "register" ? (
                <label className={styles.field}>
                  <span>昵称</span>
                  <input
                    name="name"
                    type="text"
                    placeholder="输入你的昵称"
                    value={authValues.name || ""}
                    aria-invalid={Boolean(authErrors.name)}
                    aria-describedby={authErrors.name ? "modal-name-error" : undefined}
                    onChange={(event) => handleAuthFieldChange("name", event.target.value)}
                  />
                  {authErrors.name ? (
                    <small id="modal-name-error" className={styles.fieldError}>
                      {authErrors.name}
                    </small>
                  ) : null}
                </label>
              ) : null}

              <label className={styles.field}>
                <span>{authModal === "login" ? "邮箱或手机号" : "注册邮箱"}</span>
                <input
                  name={authModal === "login" ? "account" : "email"}
                  type="text"
                  placeholder={authModal === "login" ? "输入邮箱或手机号" : "输入常用邮箱"}
                  value={authModal === "login" ? authValues.account || "" : authValues.email || ""}
                  aria-invalid={Boolean(authModal === "login" ? authErrors.account : authErrors.email)}
                  aria-describedby={
                    authModal === "login"
                      ? authErrors.account
                        ? "modal-account-error"
                        : undefined
                      : authErrors.email
                        ? "modal-email-error"
                        : undefined
                  }
                  onChange={(event) =>
                    handleAuthFieldChange(authModal === "login" ? "account" : "email", event.target.value)
                  }
                />
                {authModal === "login" && authErrors.account ? (
                  <small id="modal-account-error" className={styles.fieldError}>
                    {authErrors.account}
                  </small>
                ) : null}
                {authModal === "register" && authErrors.email ? (
                  <small id="modal-email-error" className={styles.fieldError}>
                    {authErrors.email}
                  </small>
                ) : null}
              </label>

              <label className={styles.field}>
                <span>{authModal === "login" ? "密码" : "设置密码"}</span>
                <input
                  name="password"
                  type="password"
                  placeholder={authModal === "login" ? "输入密码" : "至少 8 位密码"}
                  value={authValues.password || ""}
                  aria-invalid={Boolean(authErrors.password)}
                  aria-describedby={authErrors.password ? "modal-password-error" : undefined}
                  onChange={(event) => handleAuthFieldChange("password", event.target.value)}
                />
                {authErrors.password ? (
                  <small id="modal-password-error" className={styles.fieldError}>
                    {authErrors.password}
                  </small>
                ) : null}
              </label>

              {authModal === "register" ? (
                <label className={styles.field}>
                  <span>确认密码</span>
                  <input
                    name="confirmPassword"
                    type="password"
                    placeholder="再次输入密码"
                    value={authValues.confirmPassword || ""}
                    aria-invalid={Boolean(authErrors.confirmPassword)}
                    aria-describedby={authErrors.confirmPassword ? "modal-confirm-password-error" : undefined}
                    onChange={(event) => handleAuthFieldChange("confirmPassword", event.target.value)}
                  />
                  {authErrors.confirmPassword ? (
                    <small id="modal-confirm-password-error" className={styles.fieldError}>
                      {authErrors.confirmPassword}
                    </small>
                  ) : null}
                </label>
              ) : null}

              {authNotice ? (
                <p
                  className={`${styles.formNotice} ${
                    authNotice.tone === "success" ? styles.formNoticeSuccess : styles.formNoticeError
                  }`}
                  role={authNotice.tone === "success" ? "status" : "alert"}
                >
                  {authNotice.message}
                </p>
              ) : null}

              <div className={styles.modalActions}>
                <button className={styles.primaryBtn} type="submit" disabled={authSubmitting}>
                  {authSubmitting ? "提交中..." : authModal === "login" ? "立即登录" : "创建账户"}
                </button>
                <button
                  className={styles.ghostBtn}
                  type="button"
                  disabled={authSubmitting}
                  onClick={() => openAuthModal(authModal === "login" ? "register" : "login")}
                >
                  {authModal === "login" ? "没有账户？去注册" : "已有账户？去登录"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
