import { describe, expect, it } from 'vitest';

import { ocrScale, tidyText } from './ocr-text';

describe('ocrScale', () => {
  it('enlarges a small screenshot, up to three times', () => {
    expect(ocrScale(750, 400)).toBe(2);
    expect(ocrScale(100, 50)).toBe(3);
  });

  it('leaves a mid-sized image alone', () => {
    expect(ocrScale(2000, 1500)).toBe(1);
  });

  it('shrinks a huge photo to 4000 px on the long edge', () => {
    expect(ocrScale(3000, 8000) * 8000).toBe(4000);
  });
});

describe('tidyText', () => {
  it('drops trailing spaces and extra blank lines, keeps paragraphs', () => {
    expect(tidyText('One  \nTwo\t\n\n\n\nThree\n')).toBe('One\nTwo\n\nThree');
  });
});
