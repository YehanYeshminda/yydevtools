export type ToolCategory = 'AI' | 'Developer' | 'Converter' | 'Document';

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
