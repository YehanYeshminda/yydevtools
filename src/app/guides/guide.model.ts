/**
 * Long-form, original editorial articles — the "Guides" section.
 *
 * These are standalone reading material, not tool widgets: each one explains a
 * concept end to end (what it is, how it works, the mistakes people make) and
 * links on to the relevant tools. That distinction is the point. A utility page
 * is thin on its own; a guide is a genuine document a search engine — and an
 * AdSense reviewer — treats as real, useful content.
 *
 * Everything here is plain data. The same fields render the visible article and
 * drive its Article / BreadcrumbList structured data, so the copy and the schema
 * can never disagree. Blocks are a small, closed set of shapes rather than raw
 * HTML: the template interpolates every string, so there is no innerHTML and no
 * injection surface, and the model stays as easy to review as the tool content.
 *
 * Keep each guide genuinely specific and self-contained. Duplicated or padded
 * prose is the exact "thin/low-value content" pattern reviewers reject — one
 * real article beats five hollow ones.
 */

/** A heading that introduces a section of the article. */
export interface GuideHeading {
  kind: 'h2' | 'h3';
  /** Used verbatim and slugified into an id, so in-page anchors work. */
  text: string;
}

/** A paragraph of body prose. */
export interface GuideParagraph {
  kind: 'p';
  text: string;
}

/** A bulleted or numbered list. */
export interface GuideList {
  kind: 'ul' | 'ol';
  items: string[];
}

/** A fixed-width code or example block, optionally captioned. */
export interface GuideCode {
  kind: 'code';
  code: string;
  caption?: string;
}

/** A highlighted aside — a tip, a caveat or a warning. */
export interface GuideCallout {
  kind: 'callout';
  tone: 'info' | 'warn';
  text: string;
}

/** An inline call-to-action linking to one of the site's tools by slug. */
export interface GuideToolCta {
  kind: 'tool';
  slug: string;
  /** Optional lead-in shown above the tool card, e.g. "Try it yourself:". */
  lead?: string;
}

export type GuideBlock =
  | GuideHeading
  | GuideParagraph
  | GuideList
  | GuideCode
  | GuideCallout
  | GuideToolCta;

export interface Guide {
  /** Matches the route slug: /guides/<slug>. */
  slug: string;
  /** The article's H1 and its <title>. */
  title: string;
  /** Meta description and the summary shown on the guides index. Under ~160 chars. */
  description: string;
  /** A short grouping label shown as an eyebrow, e.g. "Security", "Data formats". */
  category: string;
  /** Rough reading time in minutes, shown to set expectations. */
  readingMinutes: number;
  /** ISO date (YYYY-MM-DD) the article was last reviewed — drives dateModified. */
  updated: string;
  /** ISO date (YYYY-MM-DD) the article was first published — drives datePublished. */
  published: string;
  /** Lead paragraphs, shown under the title before the first heading. */
  intro: string[];
  /** The body of the article, in order. */
  blocks: GuideBlock[];
  /** Slugs of tools this guide is about, for the "Tools in this guide" footer. */
  related: string[];
  /** Slugs of other guides worth reading next. */
  relatedGuides?: string[];
}
