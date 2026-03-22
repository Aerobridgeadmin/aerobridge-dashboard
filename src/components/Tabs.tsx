'use client'

export interface TabItem {
  id: string
  label: string
  count?: number
}

interface TabsProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (id: string) => void
  size?: 'sm' | 'md'
}

const sizeClasses = {
  sm: 'gap-1.5 px-3 py-1.5 text-xs',
  md: 'gap-2 px-4 py-2 text-sm',
}

const badgeSizeClasses = {
  sm: 'min-w-[1.125rem] px-1 py-0 text-[10px]',
  md: 'min-w-[1.25rem] px-1.5 py-0.5 text-xs',
}

export default function Tabs({ tabs, activeTab, onChange, size = 'md' }: TabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist">
      {tabs.map(tab => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            id={`tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center rounded-full font-medium transition-colors ${sizeClasses[size]} ${
              isActive
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white text-surface-600 ring-1 ring-surface-200 hover:bg-surface-50'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`ml-1.5 inline-flex items-center justify-center rounded-full font-semibold tabular-nums ${badgeSizeClasses[size]} ${
                  isActive ? 'bg-white/20 text-white' : 'bg-surface-100 text-surface-600'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
