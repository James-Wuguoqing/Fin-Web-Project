"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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

export default function MarketHome({ data, initialSection = "overview", initialView = "board" }) {
  const [activePanel, setActivePanel] = useState("indices");
  const [riskOff, setRiskOff] = useState(false);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [authModal, setAuthModal] = useState(null);
  const authMenuRef = useRef(null);
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
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

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
            <label className={styles.searchBar}>
              <span className={styles.searchIcon} aria-hidden="true" />
              <input type="search" placeholder="搜索市场、板块、新闻..." />
            </label>

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
                    <span className={styles.authIcon} aria-hidden="true" />
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
                          setAuthModal("login");
                          setAuthMenuOpen(false);
                        }}
                      >
                        <span className={styles.authIcon} aria-hidden="true" />
                        <span>登录</span>
                      </button>
                      <button
                        className={styles.authDropdownItem}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAuthModal("register");
                          setAuthMenuOpen(false);
                        }}
                      >
                        <span className={styles.authIconPrimary} aria-hidden="true" />
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
          onClick={() => setAuthModal(null)}
        >
          <div
            className={styles.authModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalTopbar}>
              <div>
                <p className={styles.eyebrow}>Account Access</p>
                <h2 id="auth-modal-title">
                  {authModal === "login" ? "登录 FinScope" : "注册 FinScope"}
                </h2>
              </div>
              <button
                className={styles.modalClose}
                type="button"
                aria-label="关闭登录框"
                onClick={() => setAuthModal(null)}
              >
                ×
              </button>
            </div>

            <div className={styles.modalTabs} role="tablist" aria-label="登录注册切换">
              <button
                className={`${styles.modalTab} ${authModal === "login" ? styles.modalTabActive : ""}`}
                type="button"
                onClick={() => setAuthModal("login")}
              >
                登录
              </button>
              <button
                className={`${styles.modalTab} ${authModal === "register" ? styles.modalTabActive : ""}`}
                type="button"
                onClick={() => setAuthModal("register")}
              >
                注册
              </button>
            </div>

            <form className={styles.authForm}>
              {authModal === "register" ? (
                <label className={styles.field}>
                  <span>昵称</span>
                  <input type="text" placeholder="输入你的昵称" />
                </label>
              ) : null}

              <label className={styles.field}>
                <span>{authModal === "login" ? "邮箱或手机号" : "注册邮箱"}</span>
                <input
                  type="text"
                  placeholder={authModal === "login" ? "输入邮箱或手机号" : "输入常用邮箱"}
                />
              </label>

              <label className={styles.field}>
                <span>{authModal === "login" ? "密码" : "设置密码"}</span>
                <input type="password" placeholder={authModal === "login" ? "输入密码" : "至少 8 位密码"} />
              </label>

              {authModal === "register" ? (
                <label className={styles.field}>
                  <span>确认密码</span>
                  <input type="password" placeholder="再次输入密码" />
                </label>
              ) : null}

              <div className={styles.modalActions}>
                <button className={styles.primaryBtn} type="button">
                  {authModal === "login" ? "立即登录" : "创建账户"}
                </button>
                <button
                  className={styles.ghostBtn}
                  type="button"
                  onClick={() => setAuthModal(authModal === "login" ? "register" : "login")}
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
