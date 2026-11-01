import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-accent text-slate-950 hover:bg-accent-hover',
        variant === 'secondary' && 'border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-950',
        variant === 'ghost' && 'text-slate-300 hover:bg-slate-800',
        variant === 'danger' && 'border border-red-800 bg-slate-900 text-red-200 hover:bg-red-950',
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />;
}

const fieldBase =
  'w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-400 focus:border-accent focus:ring-2 focus:ring-indigo-100 focus:outline-none disabled:bg-slate-950';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} {...rest} className={cx(fieldBase, 'h-10', className)} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} {...rest} className={cx(fieldBase, 'min-h-20 py-2 leading-relaxed', className)} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} {...rest} className={cx(fieldBase, 'h-10 pr-8', className)}>
      {children}
    </select>
  );
});

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-slate-300">
      {children}
      {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
    </label>
  );
}

export function Card({ title, description, actions, children, className }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-slate-800 bg-slate-900 shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-200">{title}</h2>}
            {description && <p className="mt-1.5 leading-relaxed text-xs text-slate-400">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

const BADGE: Record<string, string> = {
  gray: 'bg-slate-800 text-slate-300',
  blue: 'bg-sky-950 text-sky-200',
  green: 'bg-emerald-950 text-emerald-200',
  teal: 'bg-teal-950 text-teal-200',
  amber: 'bg-amber-950 text-amber-200',
  red: 'bg-red-950 text-red-200',
  violet: 'bg-violet-950 text-violet-200',
  indigo: 'bg-indigo-950 text-indigo-200',
};
export function Badge({ color = 'gray', children, className }: { color?: keyof typeof BADGE; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium leading-4', BADGE[color], className)}>{children}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900 px-6 py-14 text-center">
      <p className="text-sm font-medium text-slate-100">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm text-slate-400">{children}</div>}
    </div>
  );
}

export { cx };
