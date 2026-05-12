import { useTranslation } from 'react-i18next'

export default function TaskListPage() {
  const { t } = useTranslation('tasks')

  return <div>{t('title')}</div>
}
