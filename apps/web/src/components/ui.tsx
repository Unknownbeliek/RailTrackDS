/** Small presentational pieces. They render; hooks fetch (section 9.2). */
import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'default' | 'ghost';
  small?: boolean;
};

export function Button({ variant = 'default', small, className = '', ...rest }: ButtonProps) {
  const variantClass =
    variant === 'primary' ? 'rp-button--primary' : variant === 'ghost' ? 'rp-button--ghost' : '';
  return (
    <button
      {...rest}
      className={`rp-button ${variantClass} ${small ? 'rp-button--small' : ''} ${className}`.trim()}
    />
  );
}

export function Chip({
  active,
  children,
  ...rest
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }>) {
  return (
    <button type="button" className="rp-chip" aria-pressed={Boolean(active)} {...rest}>
      {children}
    </button>
  );
}

export function Card({
  children,
  className = '',
  as: As = 'section',
}: PropsWithChildren<{ className?: string; as?: 'section' | 'div' }>) {
  return <As className={`rp-card ${className}`.trim()}>{children}</As>;
}

export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="rp-empty" role="status" aria-live="polite">
      <p>{label ?? t('common.loading')}…</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rp-error" role="alert">
      <strong>{t('common.error')}. </strong>
      {message}
      {onRetry ? (
        <div style={{ marginTop: 'var(--rp-space-sm)' }}>
          <Button small onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rp-empty">
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function SectionTitle({ children, hint }: PropsWithChildren<{ hint?: ReactNode }>) {
  return (
    <div className="rp-row rp-row--between" style={{ margin: 'var(--rp-space-lg) 0 var(--rp-space-sm)' }}>
      <h2 className="rp-title" style={{ fontSize: 'var(--rp-font-sheet-title)' }}>
        {children}
      </h2>
      {hint}
    </div>
  );
}

export function BackLink({ to, children }: PropsWithChildren<{ to: string }>) {
  return (
    <Link to={to} className="rp-button rp-button--ghost rp-button--small" style={{ marginBottom: 'var(--rp-space-md)' }}>
      ← {children}
    </Link>
  );
}
