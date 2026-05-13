import * as Dialog from '@radix-ui/react-dialog'
import { Copy } from 'lucide-react'
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
              <svg
                className={styles.warningIcon}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                width={14}
                height={14}
              >
                <path d="M8 3l6 10H2L8 3z" />
                <path d="M8 7v3" />
                <circle cx="8" cy="12.5" r="0.5" fill="currentColor" />
              </svg>
              <div className={styles.warningText}>
                <strong>{t('secret_modal_warning')}</strong> {t('secret_modal_description')}
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabel}>{t('secret_label')}</div>
              <div className={styles.fieldBox}>
                <input className={styles.fieldValue} readOnly value={webhookSecret} />
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={() => {
                    void copyText(webhookSecret)
                      .then(() => toast.success(t('secret_copy_success')))
                      .catch((error) => toast.error(translateApiError(error)))
                  }}
                >
                  <Copy size={12} />
                  {t('copy_secret')}
                </button>
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabel}>{t('webhook_url_label')}</div>
              <div className={styles.fieldBox}>
                <input className={styles.fieldValue} readOnly value={webhookUrl} />
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={() => {
                    void copyText(webhookUrl)
                      .then(() => toast.success(t('url_copy_success')))
                      .catch((error) => toast.error(translateApiError(error)))
                  }}
                >
                  <Copy size={12} />
                  {t('copy_webhook_url')}
                </button>
              </div>
            </div>

            <div className={styles.stepsSection}>
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
          </div>

          <div className={styles.footer}>
            <Button size="sm" onClick={onDone}>
              {t('done')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
