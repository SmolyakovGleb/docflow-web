import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import authRu from '@/locales/ru/auth.json'
import commonRu from '@/locales/ru/common.json'
import errorsRu from '@/locales/ru/errors.json'
import historyRu from '@/locales/ru/history.json'
import navRu from '@/locales/ru/nav.json'
import repositoriesRu from '@/locales/ru/repositories.json'
import tasksRu from '@/locales/ru/tasks.json'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ru: {
        common: commonRu,
        nav: navRu,
        auth: authRu,
        tasks: tasksRu,
        errors: errorsRu,
        history: historyRu,
        repositories: repositoriesRu,
      },
    },
    ns: ['common', 'nav', 'auth', 'tasks', 'errors', 'history', 'repositories'],
    defaultNS: 'common',
    lng: 'ru',
    fallbackLng: 'ru',
    supportedLngs: ['ru'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })

export default i18n
