import { Popover } from 'radix-ui';
import { Gauge, X } from 'lucide-react';
import { currentUsage, modeLabel, type PublicConfig } from '@/lib/live-config';

export function ModeDetails({ config, guided = false }: { config: PublicConfig | null; guided?: boolean }) {
  const usage = currentUsage(config);
  return <>
    <h2 id="mode-details-title">Mode and usage</h2>
    <dl>
      <div><dt>Current mode</dt><dd>{!config?.liveAI || guided ? 'Guided demo' : 'Live'}</dd></div>
      <div><dt>Model</dt><dd>{config?.model || 'Configuration unavailable'}{!config?.liveAI && ' (inactive)'}</dd></div>
      {config?.liveAI && <div><dt>Live messages today</dt><dd>{usage ? `${usage.used} of ${usage.limit}` : 'Usage unavailable'}</dd></div>}
    </dl>
    {config?.liveAI && <p>Resets at midnight UTC. Failed provider requests also count once reserved.</p>}
    <p>Guided demos run locally and do not count toward the limit.</p>
  </>;
}

export function ModeIndicator({ config, guided, onRefresh }: {
  config: PublicConfig | null; guided?: boolean; onRefresh: () => void;
}) {
  const label = modeLabel(config);
  return <Popover.Root onOpenChange={(open) => { if (open) onRefresh(); }}>
    <Popover.Trigger asChild>
      <button type="button" className="mode-indicator" aria-label={`Mode and usage: ${label}`}>
        <Gauge size={17} aria-hidden="true" /><span>{label}</span>
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className="mode-popover" sideOffset={8} align="end" collisionPadding={12} aria-labelledby="mode-details-title">
        <ModeDetails config={config} guided={guided} />
        <Popover.Close className="icon-button mode-close" aria-label="Close mode and usage"><X size={16} /></Popover.Close>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
