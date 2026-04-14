import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

void i18n.use(initReactI18next).init({
  lng: 'zh',
  fallbackLng: 'zh',
  defaultNS: 'common',
  resources: {
    zh: {
      common: {
        errorTitle: '出错了',
        errorDescription: '请刷新页面或稍后再试。',
        retry: '重试',
      },
    },
  },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

export default i18n
