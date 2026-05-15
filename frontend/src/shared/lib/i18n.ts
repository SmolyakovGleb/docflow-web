import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import authRu from '@/locales/ru/auth.json'
import commonRu from '@/locales/ru/common.json'
import errorsRu from '@/locales/ru/errors.json'
import analyticsRu from '@/locales/ru/analytics.json'
import cmdkRu from '@/locales/ru/cmdk.json'
import dictionariesRu from '@/locales/ru/dictionaries.json'
import historyRu from '@/locales/ru/history.json'
import navRu from '@/locales/ru/nav.json'
import notFoundRu from '@/locales/ru/notFound.json'
import onboardingRu from '@/locales/ru/onboarding.json'
import repositoriesRu from '@/locales/ru/repositories.json'
import settingsRu from '@/locales/ru/settings.json'
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
        analytics: analyticsRu,
        cmdk: cmdkRu,
        dictionaries: dictionariesRu,
        history: historyRu,
        notFound: notFoundRu,
        onboarding: onboardingRu,
        repositories: repositoriesRu,
        settings: settingsRu,
      },
    },
    ns: [
      'common',
      'nav',
      'auth',
      'tasks',
      'errors',
      'analytics',
      'cmdk',
      'dictionaries',
      'history',
      'notFound',
      'onboarding',
      'repositories',
      'settings',
    ],
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
