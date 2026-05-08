import { http, HttpResponse } from 'msw'

const API_BASE = '/api'

export const handlers = [
  http.get(`${API_BASE}/health`, () => HttpResponse.json({ status: 'ok' })),

  http.get(`${API_BASE}/auth/me`, () =>
    HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
  ),
]
