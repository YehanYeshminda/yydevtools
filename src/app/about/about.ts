import { ChangeDetectionStrategy, Component, OnDestroy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { StructuredDataService } from '../core/structured-data.service';
import { TOOLS } from '../tools/tools.data';

/** One question/answer pair, shared by the visible FAQ and the FAQPage schema. */
interface Faq {
  q: string;
  a: string;
}

/**
 * Built from the live tool count so the copy and the structured data stay in
 * step with the catalog. The answer strings are plain text on purpose: Google
 * expects an FAQPage answer to match the text shown on the page, so the visible
 * FAQ renders these same strings verbatim.
 */
function buildFaq(total: number): Faq[] {
  return [
    {
      q: 'Is YYDevTools free?',
      a:
        'Yes. Every tool is free to use, with no limits, no trial and no paid tier. The site is ' +
        'supported by unobtrusive ads, which is why a cookie choice appears on your first visit.',
    },
    {
      q: 'Do I need to create an account?',
      a: 'No. There is nothing to sign up for and nothing to install — open any tool and start using it.',
    },
    {
      q: 'Are my files and data uploaded to a server?',
      a:
        'For most tools, no: they run entirely in your browser, so your text, code and images never ' +
        'leave your device. A few heavier PDF operations — converting to Office formats, compressing, ' +
        'and text recognition on long or non-English documents — send the file to a hosted service ' +
        'that processes it and returns the result without storing it. The Privacy page lists exactly ' +
        'which tools do which.',
    },
    {
      q: 'Which tools are available?',
      a:
        `There are ${total} tools in three groups: developer utilities such as a JSON formatter, JWT ` +
        'decoder and regex tester; converters for Base64, timestamps and images; and a full set of PDF ' +
        'tools for merging, splitting, compressing, converting and reading documents.',
    },
    {
      q: 'Is YYDevTools open source?',
      a:
        'Yes. The source code is published on GitHub, so you can read exactly how each tool works, ' +
        'report a bug or suggest a new one.',
    },
    {
      q: 'Can I request a new tool?',
      a:
        'Yes — new tools are added over time based on what people actually need. The quickest way to ' +
        'suggest one is to open an issue on GitHub or use the contact page.',
    },
  ];
}

@Component({
  selector: 'app-about',
  imports: [RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class About implements OnDestroy {
  private readonly structuredData = inject(StructuredDataService);

  protected readonly totalCount = TOOLS.length;
  protected readonly developerCount = TOOLS.filter((tool) => tool.category === 'Developer').length;
  protected readonly converterCount = TOOLS.filter((tool) => tool.category === 'Converter').length;
  protected readonly documentCount = TOOLS.filter((tool) => tool.category === 'Document').length;

  protected readonly faq = buildFaq(this.totalCount);

  constructor() {
    // Runs during the prerender pass too, so the AboutPage/FAQ JSON-LD is baked
    // into the static HTML a crawler receives.
    this.structuredData.setAboutPage(this.faq);
  }

  ngOnDestroy(): void {
    this.structuredData.clear();
  }
}
