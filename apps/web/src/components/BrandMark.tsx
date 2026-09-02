import { cn } from '@thingcost/ui';

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span aria-hidden="true" className={cn('block size-7 shrink-0', className)}>
      <img
        alt=""
        className="hidden size-full light:block"
        decoding="async"
        draggable={false}
        height={1024}
        src="/brand/chronicle-mark.svg"
        width={1024}
      />
      <img
        alt=""
        className="block size-full light:hidden"
        decoding="async"
        draggable={false}
        height={1024}
        src="/brand/chronicle-mark-reverse.svg"
        width={1024}
      />
    </span>
  );
}
