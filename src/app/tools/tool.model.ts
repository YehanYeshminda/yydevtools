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
 * How each category presents itself: the modifier suffix for its accent colour,
 * the glyph that stands for it, and the name and path of its landing page.
 *
 * It lives beside the model rather than in a component because several places
 * render categories — the homepage sections, the header's Browse menu, a tool's
 * breadcrumb and the landing pages themselves — and a category that wore
 * different icons, or linked somewhere different, in each would read as several
 * different things.
 */
export const CATEGORY_META: Record<
  ToolCategory,
  { accent: string; icon: string; heading: string; path: string }
> = {
  Developer: {
    accent: 'dev',
    icon: 'matTerminalOutline',
    heading: 'Developer tools',
    path: '/developer-tools',
  },
  Converter: {
    accent: 'conv',
    icon: 'matSyncAltOutline',
    heading: 'Converters',
    path: '/converter-tools',
  },
  Document: {
    accent: 'doc',
    icon: 'matDescriptionOutline',
    heading: 'Document tools',
    path: '/document-tools',
  },
};
