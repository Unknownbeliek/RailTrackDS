/**
 * F11 admin budget page: used and left this month, the last twenty provider
 * calls and the next planned snapshot. Protected by the admin token, which is
 * kept in sessionStorage only and never in the bundle (rule N1).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';
import { Card, EmptyState, ErrorState, Loading } from '../../components/ui';
import { currentLanguage } from '../../i18n';
import { formatClock } from '../../lib/format';

const TOKEN_KEY = 'railpulse.adminToken';

export function AdminPage() {
  const { t } = useTranslation();
  const language = currentLanguage();
  const [token, setToken] = useState(() => window.sessionStorage.getItem(TOKEN_KEY) ?? '');
  const [entry, setEntry] = useState(token);

  const budget = useQuery({
    queryKey: ['budget', token],
    queryFn: () => apiClient.budget(token),
    enabled: token.length > 0,
    retry: false,
    refetchInterval: 60_000,
  });

  const refresh = useMutation({
    mutationFn: () => apiClient.takeSnapshot(token),
    onSuccess: () => void budget.refetch(),
  });

  const unlock = () => {
    window.sessionStorage.setItem(TOKEN_KEY, entry);
    setToken(entry);
  };

  return (
    <div className="rp-screen">
      <h1 className="rp-title">{t('admin.title')}</h1>
      <p className="rp-subtitle">{t('admin.costNote')}</p>

      <div className="rp-row" style={{ marginTop: 'var(--rp-space-lg)' }}>
        <input
          className="rp-input"
          type="password"
          autoComplete="off"
          placeholder={t('admin.token')}
          aria-label={t('admin.token')}
          value={entry}
          onChange={(event) => setEntry(event.target.value)}
        />
        <button type="button" className="rp-button rp-button--primary" onClick={unlock}>
          {t('admin.unlock')}
        </button>
      </div>

      {budget.isError ? (
        <div style={{ marginTop: 'var(--rp-space-md)' }}>
          <ErrorState message={t('admin.badToken')} />
        </div>
      ) : null}
      {budget.isPending && token ? (
        <div style={{ marginTop: 'var(--rp-space-md)' }}>
          <Loading />
        </div>
      ) : null}

      {budget.data ? (
        <>
          {budget.data.data.budget.warn ? (
            <p className="rp-error" style={{ marginTop: 'var(--rp-space-md)' }}>
              {t('admin.warn')}
            </p>
          ) : null}

          <Card as="section">
            <div className="rp-tiles">
              <div className="rp-tile">
                <p className="rp-tile__label">{t('admin.used')}</p>
                <p className="rp-tile__value">
                  {budget.data.data.budget.used} / {budget.data.data.budget.cap}
                </p>
              </div>
              <div className="rp-tile">
                <p className="rp-tile__label">{t('admin.left')}</p>
                <p className="rp-tile__value">{budget.data.data.budget.remaining}</p>
              </div>
              <div className="rp-tile">
                <p className="rp-tile__label">{t('admin.today')}</p>
                <p className="rp-tile__value">
                  {budget.data.data.budget.usedToday} / {budget.data.data.budget.dailyAllowance}
                </p>
              </div>
            </div>
            <table className="rp-table" style={{ marginTop: 'var(--rp-space-md)' }}>
              <tbody>
                <tr>
                  <th>{t('admin.cap')}</th>
                  <td>{budget.data.data.budget.cap}</td>
                </tr>
                <tr>
                  <th>{t('admin.reserve')}</th>
                  <td>{budget.data.data.budget.reserve}</td>
                </tr>
                <tr>
                  <th>{t('admin.next')}</th>
                  <td>
                    {budget.data.data.budget.nextSnapshotAt
                      ? `${formatClock(budget.data.data.budget.nextSnapshotAt, language)} · ${budget.data.data.budget.month}`
                      : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="rp-row" style={{ marginTop: 'var(--rp-space-md)' }}>
              <button
                type="button"
                className="rp-button rp-button--primary rp-button--small"
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
              >
                {t('admin.refresh')}
              </button>
              {refresh.data ? (
                <span className="rp-muted" style={{ fontSize: 12 }}>
                  {t('admin.refreshed', { count: refresh.data.data.observations })}
                </span>
              ) : null}
              {refresh.isError ? (
                <span className="rp-error" style={{ fontSize: 12 }}>
                  {(refresh.error as Error).message}
                </span>
              ) : null}
            </div>
          </Card>

          <h2 className="rp-title" style={{ fontSize: 'var(--rp-font-sheet-title)', marginTop: 'var(--rp-space-lg)' }}>
            {t('admin.calls')}
          </h2>
          <Card>
            {budget.data.data.recentCalls.length === 0 ? (
              <EmptyState title={t('admin.noCalls')} />
            ) : (
              <table className="rp-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Method</th>
                    <th>When</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {budget.data.data.recentCalls.map((call) => (
                    <tr key={call.id}>
                      <td>{call.id}</td>
                      <td>
                        {call.method}
                        {call.cached ? ' (cache)' : ''}
                      </td>
                      <td>{formatClock(call.createdAt, language)}</td>
                      <td>{call.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
