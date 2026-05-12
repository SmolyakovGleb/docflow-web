import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from '@/shared/ui/Toast/toast'
import { translateApiError } from '@/shared/lib/errorMessages'
import { Button } from '@/shared/ui/Button/Button'
import styles from './WebhookSecretModal.module.css'

interface WebhookSecretModalProps {
  open: boolean
  webhookSecret: string
  webhookUrl: string
  onDone: () => void
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

export function WebhookSecretModal({
  open,
  webhookSecret,
  webhookUrl,
  onDone,
}: WebhookSecretModalProps) {
  const { t } = useTranslation('repositories')

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} data-testid="webhook-secret-overlay" />
        <Dialog.Content
          className={styles.content}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>{t('secret_modal_title')}</Dialog.Title>
          </div>

          <div className={styles.body}>
            <div className={styles.warning}>
              <AlertTriangle className={styles.warningIcon} size={18} />
              <div className={styles.warningText}>
                <strong>{t('secret_modal_warning')}</strong> {t('secret_modal_description')}
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabel}>{t('secret_label')}</div>
              <div className={styles.fieldRow}>
                <input className={styles.fieldValue} readOnly value={webhookSecret} />
                <Button
                  className={styles.copyButton}
                  iconLeft={<Copy size={14} />}
                  variant="secondary"
                  onClick={() => {
                    void copyText(webhookSecret)
                      .then(() => toast.success(t('secret_copy_success')))
                      .catch((error) => toast.error(translateApiError(error)))
                  }}
                >
                  {t('copy_secret')}
                </Button>
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabel}>{t('webhook_url_label')}</div>
              <div className={styles.fieldRow}>
                <input className={styles.fieldValue} readOnly value={webhookUrl} />
                <Button
                  className={styles.copyButton}
                  iconLeft={<Copy size={14} />}
                  variant="secondary"
                  onClick={() => {
                    void copyText(webhookUrl)
                      .then(() => toast.success(t('url_copy_success')))
                      .catch((error) => toast.error(translateApiError(error)))
                  }}
                >
                  {t('copy_webhook_url')}
                </Button>
              </div>
            </div>

            <div className={styles.stepsTitle}>{t('webhook_steps_title')}</div>
            <div className={styles.steps}>
              {[1, 2, 3, 4, 5].map((step) => (
                <div key={step} className={styles.step}>
                  <div className={styles.stepNum}>{step}</div>
                  <div className={styles.stepText}>{t(`webhook_step_${step}`)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.footer}>
            <Button onClick={onDone}>{t('done')}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
