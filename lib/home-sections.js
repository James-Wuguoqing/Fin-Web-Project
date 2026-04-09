export const defaultViewsBySection = {
  overview: "board",
  focus: "feature",
  news: "headlines",
  insight: "watchlist"
};

export const validViewsBySection = {
  overview: ["board", "catalog"],
  focus: ["feature", "macro"],
  news: ["headlines", "newsHub"],
  insight: ["watchlist", "heatmap"]
};

export function normalizeSection(section) {
  if (section === "focus" || section === "news" || section === "insight") {
    return section;
  }

  return "overview";
}

export function getInitialView(section, view) {
  const normalizedSection = normalizeSection(section);
  const validViews = validViewsBySection[normalizedSection] || [];

  if (typeof view === "string" && validViews.includes(view)) {
    return view;
  }

  return defaultViewsBySection[normalizedSection];
}
