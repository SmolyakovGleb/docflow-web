import { BarChart3, BookOpen, FolderOpen, History, List, Settings, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { selectUser } from '@/features/auth/model/authSlice'
import { useAppSelector } from '@/shared/store/hooks'
import styles from './Sidebar.module.css'
import { NavItem } from './NavItem'
import { UserBlock } from './UserBlock'
import { Wordmark } from './Wordmark'

export function Sidebar() {
  const { t } = useTranslation('nav')
  const user = useAppSelector(selectUser)

  return (
    <aside className={styles.sidebar}>
      <Wordmark />

      <nav className={styles.nav} aria-label="Primary">
        <div className={styles.navGroup}>
          <div className={styles.navSectionLabel}>{t('work_section')}</div>
          <NavItem icon={List} label={t('tasks')} to="/tasks" />
          <NavItem icon={History} label={t('history')} to="/history" />
          <NavItem icon={BarChart3} label={t('analytics')} to="/analytics" />
        </div>

        <div className={styles.navDivider} />

        <div className={styles.navGroup}>
          <div className={styles.navSectionLabel}>{t('config_section')}</div>
          <NavItem icon={FolderOpen} label={t('repositories')} to="/repositories" />
          <NavItem icon={BookOpen} label={t('dictionaries')} to="/dictionaries" />
          <NavItem icon={Settings} label={t('settings')} to="/settings" />
        </div>

        {user?.is_admin && (
          <>
            <div className={styles.navDivider} />
            <div className={styles.navGroup}>
              <div className={styles.navSectionLabel}>{t('admin_section')}</div>
              <NavItem icon={ShieldCheck} label={t('admin_panel')} to="/admin" variant="admin" />
            </div>
          </>
        )}
      </nav>

      <div className={styles.sidebarFooter}>
        <UserBlock />
      </div>
    </aside>
  )
}
