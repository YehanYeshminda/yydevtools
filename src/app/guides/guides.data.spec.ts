import { describe, expect, it } from 'vitest';

import { TOOLS } from '../tools/tools.data';
import { GUIDES } from './guides.data';

/**
 * Every slug a guide points at must exist. A dangling reference renders as a
 * dead card or a 404 on a page whose whole job is to send people somewhere.
 */
const toolSlugs = new Set(TOOLS.map((tool) => tool.slug));
const guideSlugs = new Set(GUIDES.map((guide) => guide.slug));

describe('guides', () => {
  it('have unique slugs and valid dates', () => {
    expect(guideSlugs.size).toBe(GUIDES.length);
    for (const guide of GUIDES) {
      expect(guide.published, guide.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(guide.updated >= guide.published, guide.slug).toBe(true);
    }
  });

  it('only reference tools and guides that exist', () => {
    for (const guide of GUIDES) {
      for (const slug of guide.related) {
        expect(toolSlugs.has(slug), `${guide.slug} → tool ${slug}`).toBe(true);
      }
      for (const slug of guide.relatedGuides ?? []) {
        expect(guideSlugs.has(slug), `${guide.slug} → guide ${slug}`).toBe(true);
      }
      for (const block of guide.blocks) {
        if (block.kind === 'tool') {
          expect(toolSlugs.has(block.slug), `${guide.slug} → cta ${block.slug}`).toBe(true);
        }
      }
    }
  });
});
