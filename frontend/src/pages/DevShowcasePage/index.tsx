import { useState } from 'react'
import { Bell, FolderSearch, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/shared/ui/Avatar/Avatar'
import { Button } from '@/shared/ui/Button/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState/EmptyState'
import { Field } from '@/shared/ui/Field/Field'
import { Input } from '@/shared/ui/Input/Input'
import { RepoLink } from '@/shared/ui/RepoLink/RepoLink'
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton'
import { Spinner } from '@/shared/ui/Spinner/Spinner'
import { StatusPill } from '@/shared/ui/StatusPill/StatusPill'
import { toast } from '@/shared/ui/Toast/toast'
import { getInitials } from '@/shared/lib/getInitials'
import styles from './DevShowcasePage.module.css'

export function DevShowcasePage() {
  const { t } = useTranslation('common')
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.title}>{t('dev_showcase_title')}</div>
        <div className={styles.description}>{t('dev_showcase_description')}</div>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardTitle}>{t('dev_section_buttons')}</div>
          <div className={styles.row}>
            <Button iconLeft={<Plus size={16} />}>{t('dev_primary_button')}</Button>
            <Button variant="secondary">{t('dev_secondary_button')}</Button>
            <Button variant="ghost">{t('dev_ghost_button')}</Button>
            <Button variant="danger">{t('dev_danger_button')}</Button>
            <Button variant="secondary" loading>
              {t('loading')}
            </Button>
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>{t('dev_section_fields')}</div>
          <div className={styles.stack}>
            <Field label={t('dev_input_label')} htmlFor="showcase-email" hint={t('dev_input_hint')}>
              <Input id="showcase-email" type="email" placeholder="team@company.com" />
            </Field>
            <Field
              label={t('dev_password_label')}
              htmlFor="showcase-password"
              error={t('dev_input_error')}
            >
              <Input id="showcase-password" type="password" error defaultValue="hunter2" />
            </Field>
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>{t('dev_section_statuses')}</div>
          <div className={styles.row}>
            <StatusPill status="queued" />
            <StatusPill status="running" />
            <StatusPill status="done" />
            <StatusPill status="failed" />
            <StatusPill status="published" />
            <StatusPill status="conflict" />
          </div>
          <div className={styles.row}>
            <Avatar name="Anna Kuznetsova" />
            <Avatar name="AK" size={22} />
            <Avatar name="" size={18} />
            <RepoLink repo={t('dev_repo_value')} />
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>{t('dev_section_feedback')}</div>
          <div className={styles.stack}>
            <EmptyState
              icon={FolderSearch}
              title={t('dev_empty_title')}
              description={t('dev_empty_description')}
              actions={<Button variant="secondary">{t('dev_primary_button')}</Button>}
            />
            <div className={styles.row}>
              <Skeleton width={120} />
              <Skeleton width={200} />
              <Skeleton variant="rect" width={64} height={42} />
              <Skeleton variant="circle" width={32} height={32} />
              <Spinner label={t('dev_loading_label')} />
            </div>
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>{t('dev_section_overlay')}</div>
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>
              {t('dev_open_dialog')}
            </Button>
            <Button
              variant="ghost"
              iconLeft={<Bell size={16} />}
              onClick={() =>
                toast.success(t('dev_toast_title'), {
                  description: t('dev_toast_description'),
                })
              }
            >
              {t('dev_show_toast')}
            </Button>
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTitle}>{t('dev_section_helpers')}</div>
          <div
            className={styles.helperText}
          >{`${t('dev_helper_initials')}: ${getInitials('Anna Kuznetsova')}`}</div>
          <div className={styles.helperText}>{`${t('dev_avatar_label')}: AK / ?`}</div>
          <div
            className={styles.helperText}
          >{`${t('dev_repo_label')}: ${t('dev_repo_value')}`}</div>
        </article>
      </section>

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={t('dev_confirm_title')}
        description={t('dev_confirm_description')}
        confirmVariant="danger"
        onConfirm={() => {
          setDialogOpen(false)
          toast.success(t('dev_toast_title'), {
            description: t('dev_toast_description'),
          })
        }}
      />
    </main>
  )
}
