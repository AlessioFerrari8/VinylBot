import { Component, ElementRef, signal, viewChild } from '@angular/core';

@Component({
  selector: 'app-landing-page',
  imports: [],
  templateUrl: './landing-page.html',
})
export class LandingPage {
  // carosello screenshots
  private readonly shotsScroller = viewChild<ElementRef<HTMLDivElement>>('shotsScroller');
  readonly activeShot = signal(0);

  // link per download
  readonly discordInviteUrl = 'https://discord.com/oauth2/authorize?client_id=1487848371137024222&scope=bot&permissions=3148800'
  readonly slackInviteUrl = 'https://hackclub.enterprise.slack.com/archives/C0BJLKXBQ9M'

  scrollShots(direction: number) {
    const el = this.shotsScroller()?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: 'smooth' });
  }

  onShotsScroll() {
    const el = this.shotsScroller()?.nativeElement;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    this.activeShot.set(maxScroll > 0 && el.scrollLeft > maxScroll / 2 ? 1 : 0);
  }

  readonly faqs = [
    {
      q: 'Is VinylBot really free forever?',
      a: 'Yes. VinylBot is open source under the MIT license with no premium tier, paywalls, or hidden limits. Self-host it or use our hosted instance at no cost.',
    },
    {
      q: 'Which platforms are supported?',
      a: 'Both Discord and Slack are first-class citizens. The same commands, embeds, and vinyl game work seamlessly across either platform.',
    },
    {
      q: 'Do I need to connect a music account?',
      a: "To unlock full playback you'll connect a Spotify account, which takes a single click. The vinyl game and basic controls work out of the box.",
    },
    {
      q: 'Can I self-host VinylBot?',
      a: 'Absolutely. Clone the repository, add your bot token, and deploy anywhere — Vercel, Docker, or your own hardware. Full docs are included.',
    },
    {
      q: 'How can I contribute?',
      a: 'Open an issue, pick up a good-first-issue, or submit a pull request. Our contributor guide walks you through the setup in minutes.',
    },
  ];

  readonly open = signal<number | null>(0);

  toggle(i: number) {
    this.open.set(this.open() === i ? null : i);
  }
}
