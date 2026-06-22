import axios from 'axios'
import { getAccessToken } from './authToken'

export const axiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

// Подставляем JWT в заголовок Authorization. Нужно за гейтвеем VibeCode,
// который режет session-куку; withCredentials оставлен как fallback.
axiosInstance.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
