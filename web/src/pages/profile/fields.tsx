import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Controller, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { Input, Label, Select, Textarea, cx } from '../../components/ui';

// Forms here are loosely typed on purpose: section shapes come from the shared Zod schemas,
// and the server validates every save again.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Form = UseFormReturn<any>;

export function errorAt(errors: FieldValues, name: string): string | undefined {
  let cur: unknown = errors;
  for (const part of name.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  const msg = (cur as { message?: unknown } | undefined)?.message;
  return typeof msg === 'string' ? msg : undefined;
}

function Wrap({ label, hint, error, htmlFor, children, className }: { label: string; hint?: ReactNode; error?: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} hint={hint}>
        {label}
      </Label>
      {children}
      {error && <p className="mt-1 text-xs text-red-200">{error}</p>}
    </div>
  );
}

type Base = { form: Form; name: string; label: string; hint?: ReactNode; className?: string };

export function TextField({ form, name, label, hint, className, type = 'text', placeholder, list }: Base & { type?: string; placeholder?: string; list?: string }) {
  const id = useId();
  return (
    <Wrap label={label} hint={hint} error={errorAt(form.formState.errors, name)} htmlFor={id} className={className}>
      <Input id={id} type={type} placeholder={placeholder} list={list} {...form.register(name)} />
    </Wrap>
  );
}

export function MonthField(props: Base) {
  return <TextField {...props} type="month" />;
}

export function SelectField({ form, name, label, hint, className, options }: Base & { options: readonly (readonly [string, string])[] }) {
  const id = useId();
  return (
    <Wrap label={label} hint={hint} error={errorAt(form.formState.errors, name)} htmlFor={id} className={className}>
      <Select id={id} {...form.register(name)}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </Select>
    </Wrap>
  );
}

export function CheckField({ form, name, label, className }: Base) {
  return (
    <label className={cx('flex items-center gap-2 text-sm text-slate-300', className)}>
      <input type="checkbox" className="size-4" {...form.register(name)} />
      {label}
    </label>
  );
}

/** Edits a string[]: one item per line (separator "\n") or comma-separated (separator ","). */
function ListInput({ value, onChange, separator, placeholder, rows, id }: { value: string[]; onChange: (v: string[]) => void; separator: '\n' | ','; placeholder?: string; rows?: number; id: string }) {
  const join = (v: string[]) => v.join(separator === ',' ? ', ' : '\n');
  const [text, setText] = useState(() => join(value ?? []));
  const last = useRef(value ?? []);
  useEffect(() => {
    if (JSON.stringify(value ?? []) !== JSON.stringify(last.current)) {
      last.current = value ?? [];
      setText(join(value ?? []));
    }
  }, [value]);
  const handle = (t: string) => {
    setText(t);
    const arr = t
      .split(separator)
      .map((s) => s.trim())
      .filter(Boolean);
    last.current = arr;
    onChange(arr);
  };
  return separator === ',' ? (
    <Input id={id} value={text} placeholder={placeholder} onChange={(e) => handle(e.target.value)} />
  ) : (
    <Textarea id={id} value={text} rows={rows ?? 3} placeholder={placeholder} onChange={(e) => handle(e.target.value)} />
  );
}

export function LinesField({ form, name, label, hint, className, placeholder, rows }: Base & { placeholder?: string; rows?: number }) {
  const id = useId();
  return (
    <Wrap label={label} hint={hint ?? 'one per line'} htmlFor={id} className={className}>
      <Controller control={form.control} name={name} render={({ field }) => <ListInput id={id} value={field.value} onChange={field.onChange} separator={'\n'} placeholder={placeholder} rows={rows} />} />
    </Wrap>
  );
}

export function TagsField({ form, name, label, hint, className, placeholder }: Base & { placeholder?: string }) {
  const id = useId();
  return (
    <Wrap label={label} hint={hint ?? 'comma-separated'} htmlFor={id} className={className}>
      <Controller control={form.control} name={name} render={({ field }) => <ListInput id={id} value={field.value} onChange={field.onChange} separator="," placeholder={placeholder} />} />
    </Wrap>
  );
}

/** Pick any of a fixed set of options for a string[] field. */
export function ChoiceField({ form, name, label, hint, options, className }: Base & { options: readonly string[] }) {
  return (
    <Wrap label={label} hint={hint} className={className}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => {
          const value: string[] = field.value ?? [];
          return (
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => {
                const on = value.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={on}
                    onClick={() => field.onChange(on ? value.filter((v) => v !== o) : [...value, o])}
                    className={cx(
                      'rounded-full border px-2.5 py-1 text-xs',
                      on ? 'border-indigo-800 bg-indigo-950 text-indigo-200' : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-950',
                    )}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          );
        }}
      />
    </Wrap>
  );
}
