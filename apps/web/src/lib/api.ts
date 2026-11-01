/**
 * The ONLY fetch in the browser (section 9.1). Every response is validated
 * with the shared schema, so the web app cannot drift from the API contract.
 */
import type { z } from 'zod';
import {
  adminSnapshotSchema,
  apiErrorSchema,
  budgetResponseSchema,
  corridorDetailSchema,
  corridorListSchema,
  corridorMapSchema,
  healthSchema,
  nearbySchema,
  searchResultSchema,
  shareCreateSchema,
  shareViewSchema,
  snapshotListSchema,
  trainDetailSchema,
  type ApiErrorBody,
  type ErrorCode,
} from '@railpulse/shared';

const BASE = '/api/v1';

export class ApiError extends Error {
  readonly code: ErrorCode | 'NETWORK';
  readonly status: number;

  constructor(code: ErrorCode | 'NETWORK', message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function toApiError(body: unknown, status: number): ApiError {
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    const error = parsed.data.error as ApiErrorBody['error'];
    return new ApiError((error.code as ErrorCode) ?? 'INTERNAL', error.message, status);
  }
  return new ApiError('INTERNAL', 'The API returned an unexpected response.', status);
}

async function api<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.infer<S>> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError('NETWORK', 'The network is unreachable.', 0);
  }
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw toApiError(body, response.status);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('INTERNAL', 'The API response did not match its schema.', response.status);
  }
  return parsed.data;
}

export const apiClient = {
  health: () => api('/health', healthSchema),
  corridors: () => api('/corridors', corridorListSchema),
  corridor: (slug: string) => api(`/corridors/${slug}`, corridorDetailSchema),
  map: (slug: string, params: { snapshot?: string; at?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.snapshot) query.set('snapshot', params.snapshot);
    if (params.at) query.set('at', params.at);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return api(`/corridors/${slug}/map${suffix}`, corridorMapSchema);
  },
  snapshots: (slug: string, date?: string) =>
    api(`/corridors/${slug}/snapshots${date ? `?date=${date}` : ''}`, snapshotListSchema),
  train: (number: string) => api(`/trains/${number}`, trainDetailSchema),
  nearby: (number: string) => api(`/trains/${number}/nearby`, nearbySchema),
  search: (term: string) => api(`/search?q=${encodeURIComponent(term)}`, searchResultSchema),
  createShare: (trainNumber: string, journeyDate: string) =>
    api('/share', shareCreateSchema, {
      method: 'POST',
      body: JSON.stringify({ trainNumber, journeyDate }),
    }),
  share: (code: string) => api(`/share/${code}`, shareViewSchema),
  budget: (token: string) =>
    api('/admin/budget', budgetResponseSchema, { headers: { 'x-admin-token': token } }),
  takeSnapshot: (token: string) =>
    api('/admin/snapshot', adminSnapshotSchema, {
      method: 'POST',
      headers: { 'x-admin-token': token },
    }),
};

export type ApiClient = typeof apiClient;
