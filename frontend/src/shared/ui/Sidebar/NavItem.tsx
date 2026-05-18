import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/shared/lib/cn'
import styles from './Sidebar.module.css'

interface NavItemProps {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  variant?: 'default' | 'admin'
}

export function NavItem({ to, label, icon: Icon, end = false, variant = 'default' }: NavItemProps) {
  return (
    <NavLink
      className={({ isActive }) =>
        cn(
          styles.navItem,
          isActive && styles.navItemActive,
          variant === 'admin' && styles.navItemAdmin,
          isActive && variant === 'admin' && styles.navItemAdminActive,
        )
      }
      end={end}
      to={to}
    >
      <Icon aria-hidden className={styles.navIcon} />
      <span>{label}</span>
    </NavLink>
  )
}
