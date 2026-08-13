import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';

import { FavoritesService } from '../../core/favorites.service';
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
  imports: [RouterLink, NgIcon],
  template: `
    <nav class="crumbs" aria-label="Breadcrumb">
      <ol class="breadcrumb">
        <li><a routerLink="/">All tools</a></li>
        <li class="breadcrumb__sep" aria-hidden="true">
          <ng-icon name="matChevronRightOutline" />
        </li>
        <li aria-current="page">{{ name() }}</li>
      </ol>
    </nav>

    <header class="head">
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
          isFavorite() ? 'Remove ' + name() + ' from favourites' : 'Add ' + name() + ' to favourites'
        "
        (click)="toggleFavorite()"
      >
        <ng-icon aria-hidden="true" [name]="isFavorite() ? 'matStarOutline' : 'matStarBorderOutline'" />
      </button>
    </header>
  `,
  styleUrl: './tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolPage {
  private readonly favorites = inject(FavoritesService);

  /** Catalog slug. Everything on show but the description comes from it. */
  readonly slug = input.required<string>();

  private readonly tool = computed(() => TOOLS.find((entry) => entry.slug === this.slug()));

  protected readonly name = computed(() => this.tool()?.name ?? '');
  protected readonly icon = computed(() => this.tool()?.icon ?? 'matBoltOutline');

  /**
   * Starts false on every page, matching the prerendered HTML — the service
   * only reads storage after the first render, so hydration sees the same DOM
   * the server produced and the star fills in a moment later.
   */
  protected readonly isFavorite = computed(() => this.favorites.favorites().includes(this.slug()));

  protected toggleFavorite(): void {
    this.favorites.toggle(this.slug());
  }
}
