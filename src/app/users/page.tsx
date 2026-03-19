'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import RoleGuard from '@/components/RoleGuard'
import Toast from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/contexts/AuthContext'
import { Search, Shield, Loader2, Mail, UserCog, GraduationCap, Users } from 'lucide-react'

const roleStyles: Record<string, string> = {
  admin: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  instructor: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  student: 'bg-green-50 text-green-700 ring-1 ring-green-200',
}

const roleIcons: Record<string, any> = {
  admin: Shield,
  instructor: UserCog,
  student: GraduationCap,
}

export default function UsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setProfiles((data ?? []) as Profile[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = profiles.filter(p => {
    const matchesSearch = p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase()) ||
      p.department?.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'all' || p.role === roleFilter
    return matchesSearch && matchesRole
  })

  const changeRole = async (userId: string, newRole: string) => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    if (error) {
      setToast({ message: error.message, type: 'error' })
    } else {
      setToast({ message: `Role updated to ${newRole}`, type: 'success' })
      load()
    }
  }

  const counts = {
    all: profiles.length,
    admin: profiles.filter(p => p.role === 'admin').length,
    instructor: profiles.filter(p => p.role === 'instructor').length,
    student: profiles.filter(p => p.role === 'student').length,
  }

  return (
    <RoleGuard allowed={['admin']}>
    <div className="min-h-screen bg-surface-50">
      <Header title="User Management" subtitle="View all users and manage roles" />
      <div className="p-8">
        {/* Role filter tabs */}
        <div className="mb-6 flex items-center gap-6 border-b border-surface-200 pb-4">
          {(['all', 'admin', 'instructor', 'student'] as const).map(role => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`flex items-center gap-2 pb-1 text-sm font-medium transition-all ${roleFilter === role ? 'border-b-2 border-brand-500 text-brand-600' : 'text-surface-500 hover:text-surface-700'}`}
            >
              <span className="capitalize">{role === 'all' ? 'All Users' : role + 's'}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${roleFilter === role ? 'bg-brand-50 text-brand-600' : 'bg-surface-100 text-surface-500'}`}>
                {counts[role]}
              </span>
            </button>
          ))}
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input type="text" placeholder="Search users by name, email, or department..." value={search} onChange={e => setSearch(e.target.value)} className="h-10 w-96 rounded-lg border border-surface-200 bg-white pl-9 pr-4 text-sm outline-none transition-all placeholder:text-surface-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-surface-200 bg-white py-16 text-center">
            <Users className="h-10 w-10 text-surface-300" />
            <p className="mt-3 text-sm font-medium text-surface-500">{search ? `No users match "${search}"` : 'No users found'}</p>
          </div>
        ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50/50">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">User</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Role</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Department</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Onboarding</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Joined</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Change Role</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user, i) => {
                const RIcon = roleIcons[user.role] || Users
                return (
                  <tr key={user.id} className="animate-slide-up border-b border-surface-100 transition-colors last:border-0 hover:bg-surface-50/50" style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white">
                          {user.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-surface-900">{user.full_name || 'Unnamed'}</p>
                          <p className="flex items-center gap-1 text-xs text-surface-400"><Mail className="h-3 w-3" />{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`badge text-[10px] capitalize ${roleStyles[user.role]}`}>
                        <RIcon className="mr-1 inline h-3 w-3" />{user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-surface-600">{user.department || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`badge text-[10px] ${user.onboarding_complete ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                        {user.onboarding_complete ? 'Complete' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-surface-500">{new Date(user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-6 py-4">
                      <select
                        value={user.role}
                        onChange={e => changeRole(user.id, e.target.value)}
                        className="h-8 rounded-lg border border-surface-200 bg-white px-2 text-xs font-medium text-surface-700 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-50"
                      >
                        <option value="student">Student</option>
                        <option value="instructor">Instructor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
    </RoleGuard>
  )
}
