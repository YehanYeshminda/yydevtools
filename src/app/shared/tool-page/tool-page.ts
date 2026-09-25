import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';

import { FavoritesService } from '../../core/favorites.service';
import { ReturnTrip, sentFrom } from '../../core/return-trip';
import { StructuredDataService } from '../../core/structured-data.service';
import { CATEGORY_META, type Tool } from '../../tools/tool.model';
import { TOOLS } from '../../tools/tools.data';

/**
 * The masthead every tool page wears: breadcrumb, icon, title, description and
 * the favourite toggle.
 *
 * Before this existed each of the 28 tools hand-assembled the same twenty lines
 * of markup, and they had already drifted — the Code Formatter showed a
 * different icon on its own page than on its homepage card, because the two
 * were written months apart. Everything except the description is now derived
 * from the catalog entry for `slug`, so a tool has exactly one name and one
 * icon by construction.
 *
 * The description stays projected rather than pulled from the catalog on
 * purpose: the card grid needs one terse line, while the page can afford a
 * fuller sentence that mentions the privacy guarantee. They are different jobs.
 */
@Component({
  selector: 'app-tool-page',
  imports: [RouterLink, NgIcon, MatButtonModule],
  template: `
    <div class="top">
      <nav class="crumbs" aria-label="Breadcrumb">
        <ol class="breadcrumb" [class]="'cat--' + accent()">
          <li><a routerLink="/">All tools</a></li>
          <li class="breadcrumb__sep" aria-hidden="true">/</li>
          <li>
            <a class="breadcrumb__cat" routerLink="/" [queryParams]="{ category: category() }">{{
              category()
            }}</a>
          </li>
          <li class="breadcrumb__sep" aria-hidden="true">/</li>
          <li aria-current="page">{{ name() }}</li>
        </ol>
      </nav>
      @if (backTo(); as origin) {
        <button matButton class="back" (click)="back(origin.slug)">
          <ng-icon name="matArrowBackOutline" />
          Back to {{ origin.name }}
        </button>
      }
    </div>

    <header class="head" [class]="'cat--' + accent()">
      <div class="head__icon" aria-hidden="true">
        <ng-icon [name]="icon()" />
      </div>
      <div class="head__text">
        <h1 class="head__title">{{ name() }}</h1>
        <p class="head__sub"><ng-content /></p>
      </div>
      <button
        type="button"
        class="head__fav"
        [class.head__fav--on]="isFavorite()"
        [attr.aria-pressed]="isFavorite()"
        [attr.aria-label]="
          isFavorite()
            ? 'Remove ' + name() + ' from favourites'
            : 'Add ' + name() + ' to favourites'
        "
        (click)="toggleFavorite()"
      >
        <ng-icon
          aria-hidden="true"
          [name]="isFavorite() ? 'matStarOutline' : 'matStarBorderOutline'"
        />
      </button>
    </header>
  `,
  styleUrl: './tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolPage {
  private readonly favorites = inject(FavoritesService);
  private readonly trip = inject(ReturnTrip);

  /**
   * The tool that sent you here with Send to or Open in. Read after hydration:
   * the prerender has no fragment, so the button can only appear in the browser.
   */
  protected readonly backTo = signal<Tool | null>(null);

  constructor() {
    afterNextRender(() => {
      const origin = sentFrom(location.hash, this.slug());
      if (origin) {
        this.trip.arrived(this.slug(), origin.slug);
        this.backTo.set(origin);
      }
    });

    // The tool's JSON-LD is written by <app-tool-content>, which sits in a
    // hydrate-on-interaction @defer and so usually never exists on the client —
    // its own ngOnDestroy cannot be relied on to remove the prerendered schema
    // when you navigate away. The masthead always hydrates, so it does it.
    const structuredData = inject(StructuredDataService);
    inject(DestroyRef).onDestroy(() => structuredData.clear());
  }

  /** Catalog slug. Everything on show but the description comes from it. */
  readonly slug = input.required<string>();

  private readonly tool = computed(() => TOOLS.find((entry) => entry.slug === this.slug()));

  protected readonly name = computed(() => this.tool()?.name ?? '');
  protected readonly icon = computed(() => this.tool()?.icon ?? 'matBoltOutline');
  protected readonly category = computed(() => this.tool()?.category ?? 'Developer');
  /** Modifier suffix (dev/conv/doc) that hands the masthead its accent trio. */
  protected readonly accent = computed(() => CATEGORY_META[this.category()].accent);

  /**
   * Starts false on every page, matching the prerendered HTML — the service
   * only reads storage after the first render, so hydration sees the same DOM
   * the server produced and the star fills in a moment later.
   */
  protected readonly isFavorite = computed(() => this.favorites.favorites().includes(this.slug()));

  protected back(slug: string): void {
    this.trip.back(slug);
  }

  protected toggleFavorite(): void {
    this.favorites.toggle(this.slug());
  }
}
