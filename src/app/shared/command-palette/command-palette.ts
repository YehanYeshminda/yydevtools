import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { FavoritesService } from '../../core/favorites.service';
import { RecentToolsService } from '../../core/recent-tools.service';
import { NgIcon } from '@ng-icons/core';
import { PaletteItem, PaletteSection, buildSections } from './command-palette.search';

/**
 * A ⌘K / Ctrl-K "quick jump" over the whole tool catalog, mounted once in the
 * app shell so the shortcut works from every page. With an empty query it shows
 * Favourites and Recently-used shortcuts above the full list; typing filters and
 * ranks by name, then description.
 *
 * Navigation is the ARIA combobox + listbox pattern: DOM focus stays on the
 * input, and the active row is tracked with `aria-activedescendant`, so arrow
 * keys move a highlight the input owns rather than moving focus. The overlay is
 * only in the DOM while open, so it never appears in the prerendered HTML.
 */
@Component({
  selector: 'app-command-palette',
  imports: [NgIcon],
  template: `
    @if (open()) {
      <div class="cmdk" (click)="onBackdrop($event)">
        <div
          class="cmdk__panel"
          role="dialog"
          aria-modal="true"
          aria-label="Search tools"
        >
          <div class="cmdk__search">
            <ng-icon class="cmdk__search-icon" aria-hidden="true" name="matSearchOutline" />
            <input
              #searchInput
              class="cmdk__input"
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="cmdk-listbox"
              [attr.aria-activedescendant]="activeId()"
              aria-label="Search tools"
              placeholder="Search tools…"
              [value]="query()"
              (input)="onInput($event)"
              (keydown)="onInputKeydown($event)"
            />
            <kbd class="cmdk__esc" aria-hidden="true">Esc</kbd>
          </div>

          @if (flatItems().length > 0) {
            <ul id="cmdk-listbox" class="cmdk__list" role="listbox" aria-label="Tools">
              @for (section of sections(); track section.title) {
                <li class="cmdk__group" role="presentation">
                  <p class="cmdk__group-label" role="presentation">
                    <ng-icon aria-hidden="true" [name]="section.icon" />
                    {{ section.title }}
                  </p>
                  <ul class="cmdk__group-list" role="presentation">
                    @for (item of section.items; track item.tool.slug) {
                      <li
                        class="cmdk__opt"
                        [class.cmdk__opt--active]="item.index === activeIndex()"
                        role="option"
                        [id]="'cmdk-opt-' + item.index"
                        [attr.aria-selected]="item.index === activeIndex()"
                        (click)="select(item)"
                        (mousemove)="activeIndex.set(item.index)"
                      >
                        <ng-icon
                          class="cmdk__opt-icon"
                          aria-hidden="true"
                          [name]="item.tool.icon"
                        />
                        <span class="cmdk__opt-text">
                          <span class="cmdk__opt-name">{{ item.tool.name }}</span>
                          <span class="cmdk__opt-desc">{{ item.tool.description }}</span>
                        </span>
                        <span class="cmdk__opt-cat">{{ item.tool.category }}</span>
                      </li>
                    }
                  </ul>
                </li>
              }
            </ul>
          } @else {
            <p class="cmdk__empty">No tools match “{{ query() }}”.</p>
          }
        </div>
      </div>
    }
  `,
  styleUrl: './command-palette.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onGlobalKeydown($event)',
  },
})
export class CommandPalette {
  private readonly router = inject(Router);
  private readonly favorites = inject(FavoritesService);
  private readonly recents = inject(RecentToolsService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private previouslyFocused: HTMLElement | null = null;

  protected readonly sections = computed<PaletteSection[]>(() => buildSections(
    this.query(),
    this.favorites.favorites(),
    this.recents.recent(),
  ));

  protected readonly flatItems = computed<PaletteItem[]>(() =>
    this.sections().flatMap((section) => section.items),
  );

  protected readonly activeId = computed(() =>
    this.flatItems().length > 0 ? `cmdk-opt-${this.activeIndex()}` : null,
  );

  constructor() {
    // Focus the input once it renders, and lock the background scroll while open.
    effect(() => {
      if (!this.isBrowser) {
        return;
      }
      if (this.open()) {
        this.searchInput()?.nativeElement.focus();
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    });
  }

  // --- Open / close -----------------------------------------------------
  protected onGlobalKeydown(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.toggle();
    }
  }

  private toggle(): void {
    this.open() ? this.close() : this.openPalette();
  }

  /**
   * Public because the appbar's search button calls it through a template
   * reference. The shortcut is not the only way in — it cannot be, on a device
   * with no keyboard.
   */
  openPalette(): void {
    if (this.isBrowser) {
      this.previouslyFocused = document.activeElement as HTMLElement | null;
    }
    this.query.set('');
    this.activeIndex.set(0);
    this.open.set(true);
  }

  protected close(): void {
    this.open.set(false);
    this.previouslyFocused?.focus();
    this.previouslyFocused = null;
  }

  protected onBackdrop(event: MouseEvent): void {
    // Only a click on the backdrop itself, not on the panel inside it.
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  // --- Query + keyboard navigation --------------------------------------
  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }

  protected onInputKeydown(event: KeyboardEvent): void {
    const count = this.flatItems().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count > 0) {
          this.moveActive(Math.min(this.activeIndex() + 1, count - 1));
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count > 0) {
          this.moveActive(Math.max(this.activeIndex() - 1, 0));
        }
        break;
      case 'Home':
        event.preventDefault();
        this.moveActive(0);
        break;
      case 'End':
        event.preventDefault();
        this.moveActive(count - 1);
        break;
      case 'Enter': {
        event.preventDefault();
        const item = this.flatItems()[this.activeIndex()];
        if (item) {
          this.select(item);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'Tab':
        // Keep focus inside the dialog — the input is its only focus target.
        event.preventDefault();
        break;
    }
  }

  private moveActive(index: number): void {
    this.activeIndex.set(index);
    if (this.isBrowser) {
      document.getElementById(`cmdk-opt-${index}`)?.scrollIntoView({ block: 'nearest' });
    }
  }

  protected select(item: PaletteItem): void {
    this.close();
    void this.router.navigate(['/tools', item.tool.slug]);
  }
}
