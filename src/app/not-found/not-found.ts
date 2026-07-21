import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <div class="nf">
      <span class="nf__icon material-icons-outlined" aria-hidden="true">explore_off</span>
      <h1 class="nf__title">Page not found</h1>
      <p class="nf__text">
        That page doesn’t exist — it may have moved, or the link may be mistyped.
      </p>
      <a class="nf__cta" routerLink="/">Browse all tools</a>
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 80px clamp(16px, 4vw, 28px) 96px;
    }

    .nf {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .nf__icon {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      margin-bottom: 16px;
      font-size: 30px;
      color: var(--on-var);
      background: var(--surface-2);
      border-radius: 14px;
    }

    .nf__title {
      margin: 0 0 8px;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--on);
    }

    .nf__text {
      max-width: 360px;
      margin: 0 0 20px;
      font-size: 15px;
      line-height: 1.55;
      color: var(--on-var);
    }

    .nf__cta {
      padding: 10px 16px;
      font-size: 13.5px;
      font-weight: 600;
      color: var(--on-primary);
      background: var(--primary);
      border-radius: var(--r-btn);
      text-decoration: none;
    }

    .nf__cta:hover {
      background: var(--primary-strong);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {}
