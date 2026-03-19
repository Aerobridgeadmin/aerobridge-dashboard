"use client";

import { useState, type ReactNode } from "react";

type Tab = {
  id: string;
  label: string;
  badge?: number;
};

export function PayrollTabs({
  tabs,
  contents,
  defaultTab,
}: {
  tabs: Tab[];
  contents: ReactNode[];
  defaultTab?: string;
}) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id ?? "");
  const activeIndex = tabs.findIndex((t) => t.id === activeTab);

  return (
    <>
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      {contents.map((content, i) => (
        <div key={tabs[i]?.id ?? i} style={{ display: i === activeIndex ? "contents" : "none" }}>
          {content}
        </div>
      ))}
    </>
  );
}
