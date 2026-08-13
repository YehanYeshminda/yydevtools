export type ToolCategory = 'Developer' | 'Converter' | 'Document';

export interface Tool {
  /** Stable slug used for routing, e.g. /tools/json-formatter */
  slug: string;
  name: string;
  description: string;
  /** Material Icons ligature name */
  icon: string;
  category: ToolCategory;
  /** Whether the tool page is built yet. Cards for unbuilt tools show a "Soon" badge. */
  ready: boolean;
}

/**
 * How each category presents itself: the modifier suffix for its accent colour
 * and the glyph that stands for it.
 *
 * It lives beside the model rather than in a component because two places now
 * render categories — the homepage sections and the header's Browse menu — and
 * a category that wore different icons in the menu and on the page it links to
 * would read as two different things.
 */
export const CATEGORY_META: Record<ToolCategory, { accent: string; icon: string }> = {
  Developer: { accent: 'dev', icon: 'matTerminalOutline' },
  Converter: { accent: 'conv', icon: 'matSyncAltOutline' },
  Document: { accent: 'doc', icon: 'matDescriptionOutline' },
};
