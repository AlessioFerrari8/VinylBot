import { Component, DestroyRef, computed, inject, signal } from '@angular/core';

type ServiceState = 'checking' | 'online' | 'degraded' | 'offline';

interface ServiceCheck {
  name: string;
  desc: string;
  url: string;
  state: ServiceState;
  ping: number | null;
  uptime: number | null;
}

@Component({
  selector: 'app-status',
  imports: [],
  templateUrl: './status.html',
})
export class Status {
  readonly services = signal<ServiceCheck[]>([
    {
      name: 'Discord bot',
      desc: 'Voice quiz + Spotify control',
      url: 'https://vinylbot.alessio.hackclub.app/health',
      state: 'checking',
      ping: null,
      uptime: null,
    },
    {
      name: 'Slack bot',
      desc: 'Chat quiz for workspaces',
      url: 'https://vinylbot-slack.alessio.hackclub.app/health',
      state: 'checking',
      ping: null,
      uptime: null,
    },
  ]);

  readonly lastChecked = signal<Date | null>(null);

  readonly overall = computed<ServiceState>(() => {
    const states = this.services().map((s) => s.state);
    if (states.includes('checking')) return 'checking';
    if (states.every((s) => s === 'online')) return 'online';
    if (states.every((s) => s === 'offline')) return 'offline';
    return 'degraded';
  });

  constructor() {
    this.checkAll();
    // ricontrolla ogni 30 secondi finché la pagina è aperta
    const interval = setInterval(() => this.checkAll(), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(interval));
  }

  async checkAll() {
    const results = await Promise.all(this.services().map((s) => this.checkOne(s)));
    this.services.set(results);
    this.lastChecked.set(new Date());
  }

  private async checkOne(service: ServiceCheck): Promise<ServiceCheck> {
    const started = performance.now();
    try {
      const res = await fetch(service.url, { signal: AbortSignal.timeout(5000) });
      const elapsed = Math.round(performance.now() - started);
      if (!res.ok) return { ...service, state: 'degraded', ping: elapsed, uptime: null };

      const data = await res.json();
      return {
        ...service,
        state: data.status === 'online' ? 'online' : 'degraded',
        ping: typeof data.ping === 'number' && data.ping >= 0 ? Math.round(data.ping) : elapsed,
        uptime: typeof data.uptime === 'number' ? data.uptime : null,
      };
    } catch {
      return { ...service, state: 'offline', ping: null, uptime: null };
    }
  }

  stateLabel(state: ServiceState): string {
    switch (state) {
      case 'online': return 'Operational';
      case 'degraded': return 'Degraded';
      case 'offline': return 'Offline';
      default: return 'Checking…';
    }
  }

  dotClass(state: ServiceState): string {
    switch (state) {
      case 'online': return 'bg-vb-slack';
      case 'degraded': return 'bg-amber-400';
      case 'offline': return 'bg-red-500';
      default: return 'bg-white/30 animate-pulse';
    }
  }

  textClass(state: ServiceState): string {
    switch (state) {
      case 'online': return 'text-vb-slack';
      case 'degraded': return 'text-amber-400';
      case 'offline': return 'text-red-500';
      default: return 'text-white/40';
    }
  }

  overallLabel(): string {
    switch (this.overall()) {
      case 'online': return 'All systems operational';
      case 'degraded': return 'Some services are having issues';
      case 'offline': return 'Major outage, everything is down';
      default: return 'Checking services…';
    }
  }

  formatUptime(seconds: number | null): string {
    if (seconds === null) return '—';
    const d = Math.floor(seconds / 86_400);
    const h = Math.floor((seconds % 86_400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }
}
