/**
 * Long-form, human-written content shown below each tool's widget.
 *
 * This is what turns a bare utility page into something a search engine — and an
 * AdSense reviewer — treats as a real, useful document: unique prose explaining
 * what the tool does, how to use it, the questions people actually ask, and links
 * on to related tools. The same data drives the FAQ/SoftwareApplication/breadcrumb
 * structured data, so the visible copy and the schema can never disagree.
 *
 * Keep every field genuinely specific to its tool. Duplicated or generic copy is
 * worse than none — it is the exact "thin/low-value content" pattern reviewers
 * reject. Plain strings only (no HTML): the same text is emitted into JSON-LD.
 */
export interface FaqItem {
  q: string;
  a: string;
}

export interface ToolContent {
  /** Matches the tool's route slug and its entry in tools.data.ts. */
  slug: string;
  /** One or two paragraphs introducing the tool and when to reach for it. */
  intro: string[];
  /** Ordered "how to use" steps, rendered as a numbered list. */
  steps: string[];
  /** Optional "good to know" bullets — capabilities, limits, privacy notes. */
  features?: string[];
  /** Questions people search for, each with a self-contained answer. */
  faq: FaqItem[];
  /** Slugs of related tools, for internal linking. */
  related: string[];
}
