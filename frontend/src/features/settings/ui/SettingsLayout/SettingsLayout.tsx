import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import styles from './SettingsLayout.module.css'

export function SettingsLayout() {
  const { t } = useTranslation('settings')

  return (
    <div className={styles.layout}>
      <nav className={styles.sidebar}>
        <NavLink
          to="/settings/profile"
          className={({ isActive }) => cn(styles.item, isActive && styles.itemActive)}
        >
          {t('nav.profile')}
        </NavLink>
        <NavLink
          to="/settings/github"
          className={({ isActive }) => cn(styles.item, isActive && styles.itemActive)}
        >
          {t('nav.github')}
        </NavLink>
        <NavLink
          to="/settings/notifications"
          className={({ isActive }) => cn(styles.item, isActive && styles.itemActive)}
        >
          {t('nav.notifications')}
        </NavLink>
        <NavLink
          to="/settings/team"
          className={({ isActive }) => cn(styles.item, isActive && styles.itemActive)}
        >
          {t('nav.team')}
        </NavLink>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
