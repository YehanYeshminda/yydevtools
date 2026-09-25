import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { FileHandoff } from './file-handoff';
import { ReturnTrip, fromFragment, sentFrom } from './return-trip';

describe('sentFrom', () => {
  it('names the tool the fragment says this page came from', () => {
    expect(sentFrom('#s=abc&from=json-formatter', 'toml-converter')?.name).toBe('JSON Formatter');
    expect(sentFrom(`#${fromFragment('image-ocr')}`, 'word-counter')?.slug).toBe('image-ocr');
  });

  it('ignores anything that is not another built tool', () => {
    expect(sentFrom('', 'toml-converter')).toBeNull();
    expect(sentFrom('#s=abc', 'toml-converter')).toBeNull();
    expect(sentFrom('#from=https://evil.example', 'toml-converter')).toBeNull();
    expect(sentFrom('#from=toml-converter', 'toml-converter')).toBeNull();
  });
});

describe('ReturnTrip', () => {
  function setup() {
    const navigate = vi.fn(() => Promise.resolve(true));
    const sendFile = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate } },
        { provide: FileHandoff, useValue: { sendFile } },
      ],
    });
    return { trip: TestBed.inject(ReturnTrip), navigate, sendFile };
  }

  it('goes back to a text tool plainly, so it restores from storage', () => {
    const { trip, navigate, sendFile } = setup();
    trip.leave('json-formatter', null);
    trip.back('json-formatter');
    expect(navigate).toHaveBeenCalledWith(['/tools', 'json-formatter'], { fragment: undefined });
    expect(sendFile).not.toHaveBeenCalled();
  });

  it('hands a file tool its file again, and keeps the step before it', () => {
    const { trip, navigate, sendFile } = setup();
    const file = new File(['x'], 'scan.png', { type: 'image/png' });
    trip.leave('image-ocr', file);
    trip.arrived('image-ocr', 'image-viewer');
    trip.back('image-ocr');
    expect(sendFile).toHaveBeenCalledWith(file, 'image-ocr', 'from=image-viewer');
    expect(navigate).not.toHaveBeenCalled();
  });
});
