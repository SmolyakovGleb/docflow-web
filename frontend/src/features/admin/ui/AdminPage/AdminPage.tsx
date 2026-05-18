import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { UsersSection } from '../UsersSection/UsersSection'
import { InvitesSection } from '../InvitesSection/InvitesSection'
import { TasksSection } from '../TasksSection/TasksSection'
import styles from './AdminPage.module.css'

export function AdminPage() {
  const { t } = useTranslation('admin')

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <ShieldCheck size={22} className={styles.pageIcon} />
        <h1 className={styles.pageTitle}>{t('page_title')}</h1>
      </div>
      <UsersSection />
      <InvitesSection />
      <TasksSection />
    </div>
  )
}
