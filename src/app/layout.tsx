import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'AeroBridge Dashboard',
  description: 'Learning Management System — AeroBridge',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="ml-[260px] flex-1 transition-all duration-300">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
