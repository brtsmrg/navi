import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Dialog, Slider, Switch, ToggleGroup } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'raise' | 'quiet';

export function Button({
  variant = 'raise',
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...p}
      className={cn(
        'inline-flex min-h-12 select-none items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-medium transition active:scale-[0.98] disabled:opacity-40',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand/90',
        variant === 'raise' && 'bg-raise text-ink hover:bg-line',
        variant === 'quiet' && 'text-mute hover:text-ink',
        className,
      )}
    />
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(v) => v && onChange(v as T)}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-bg p-1"
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="min-h-10 rounded-lg px-2 text-sm text-mute transition data-[state=on]:bg-raise data-[state=on]:text-ink"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-4 text-[15px]">
      <span>{label}</span>
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        className="relative h-7 w-12 shrink-0 rounded-full bg-line transition data-[state=checked]:bg-brand"
      >
        <Switch.Thumb className="block size-5 translate-x-1 rounded-full bg-ink transition data-[state=checked]:translate-x-6 data-[state=checked]:bg-white" />
      </Switch.Root>
    </label>
  );
}

export function Range({
  value,
  min,
  max,
  step,
  onChange,
  label,
  display,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
  display: string;
}) {
  return (
    <div className="py-2">
      <div className="mb-2 flex items-baseline justify-between text-[15px]">
        <span>{label}</span>
        <span className="font-display text-xl text-mute">{display}</span>
      </div>
      <Slider.Root
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={([v]) => onChange(v)}
        className="relative flex h-8 touch-none select-none items-center"
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-line">
          <Slider.Range className="absolute h-full rounded-full bg-ink" />
        </Slider.Track>
        <Slider.Thumb className="block size-6 rounded-full bg-ink shadow-lg" />
      </Slider.Root>
    </div>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
  dismissible?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (dismissible || o) && onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => !dismissible && e.preventDefault()}
          onInteractOutside={(e) => !dismissible && e.preventDefault()}
          className="safe-b fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-panel p-5 md:inset-auto md:left-1/2 md:top-1/2 md:w-[480px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="font-display text-3xl font-semibold">{title}</Dialog.Title>
            {dismissible && (
              <Dialog.Close aria-label="Close" className="grid size-11 place-items-center rounded-full bg-raise">
                <X size={20} />
              </Dialog.Close>
            )}
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
