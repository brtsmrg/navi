import { ShieldCheck } from 'lucide-react';
import { Button, Sheet } from './ui';

export function SafetyGate({ open, onAccept }: { open: boolean; onAccept: () => void }) {
  return (
    <Sheet open={open} onOpenChange={() => undefined} title="Before you drive" dismissible={false}>
      <div className="space-y-3 text-[15px] leading-relaxed text-mute">
        <p>
          Navi is a second pair of eyes. It reads the road ahead from map data and tells you what is coming. Maps can be wrong, and
          it cannot see traffic, surface, weather or people.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>You are the driver. Obey the law and the posted limits.</li>
          <li>Set up the route before you move. Do not touch the phone while driving.</li>
          <li>Fast driving belongs on closed courses. On public roads, the notes help you see further, not go faster.</li>
        </ul>
      </div>
      <Button variant="primary" className="mt-5 w-full" onClick={onAccept}>
        <ShieldCheck size={20} /> I understand
      </Button>
    </Sheet>
  );
}
