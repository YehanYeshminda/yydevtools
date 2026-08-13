import { inputBinding, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CODE_EDITOR_ENGINE, CodeEditor, type EditorLanguage } from './code-editor';

/**
 * Component spec — run it with `npm test` (the Angular unit-test builder), not
 * with bare `npx vitest run`, which has no DOM and no initialised TestBed.
 *
 * The real CodeMirror is deliberately *not* mounted. jsdom implements no
 * layout, so CodeMirror never re-renders after a transaction: its document
 * state updates but `.cm-content` keeps showing the text it first rendered.
 * Asserting on that DOM would report a failure whether or not the component
 * works. Instead the engine is replaced through {@link CODE_EDITOR_ENGINE}
 * with a handle that records what it is told, which is precisely the boundary
 * the regression below broke.
 */
interface Recorder {
  values: string[];
  languages: string[];
  readOnly: boolean[];
}

interface Harness {
  value: WritableSignal<string>;
  language: WritableSignal<EditorLanguage>;
  readOnly: WritableSignal<boolean>;
  recorder: Recorder;
  /** Flush change detection plus anything the last write scheduled. */
  flush: () => Promise<void>;
}

/**
 * Mount the editor and wait for the async upgrade to complete.
 *
 * Bindings are supplied at creation because `TestBed.createComponent` renders
 * straight away — a `setInput` on the next line is already too late for a
 * required input.
 */
async function mount(initial = 'first'): Promise<Harness> {
  const recorder: Recorder = { values: [], languages: [], readOnly: [] };

  TestBed.configureTestingModule({
    providers: [
      {
        provide: CODE_EDITOR_ENGINE,
        useValue: async () => ({
          setValue: (text: string) => recorder.values.push(text),
          setLanguage: async (language: EditorLanguage) => void recorder.languages.push(language),
          setReadOnly: (readOnly: boolean) => recorder.readOnly.push(readOnly),
          focus: () => {},
          destroy: () => {},
        }),
      },
    ],
  });

  const value = signal(initial);
  const language = signal<EditorLanguage>('json');
  const readOnly = signal(false);

  const fixture = TestBed.createComponent(CodeEditor, {
    bindings: [
      inputBinding('label', () => 'Test editor'),
      // One-way: these tests are about the downward direction (a tool writes to
      // its signal, the editor must follow). The editor→signal direction is the
      // one that never broke.
      inputBinding('value', value),
      inputBinding('language', language),
      inputBinding('readOnly', readOnly),
    ],
  });

  const flush = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  // The upgrade is an `afterNextRender` followed by an await, so it can need
  // more than one turn of the loop before the handle exists.
  for (let attempt = 0; attempt < 20 && recorder.values.length === 0; attempt++) {
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { value, language, readOnly, recorder, flush };
}

describe('CodeEditor', () => {
  let editor: Harness;

  beforeEach(async () => {
    editor = await mount();
  });

  it('hands the editor its initial value when it mounts', () => {
    expect(editor.recorder.values).toContain('first');
  });

  /**
   * The regression this file exists for.
   *
   * The sync effects were once written `this.handle?.setValue(this.value())`.
   * Optional chaining short-circuits *argument evaluation*, so while `handle`
   * was still null — which it always is on the effect's first run, before the
   * editor chunk resolves — the effect read no signals, registered no
   * dependencies and never ran again. Typing still worked (editor → signal),
   * but every write in the other direction was silently dropped once CodeMirror
   * mounted: "Try an example", Clear, Text Diff's Swap, restoring shared state.
   */
  it('pushes a programmatic value change into the mounted editor', async () => {
    editor.recorder.values.length = 0;

    editor.value.set('second');
    await editor.flush();

    expect(editor.recorder.values).toContain('second');
  });

  it('pushes an emptying write, so Clear reaches a mounted editor', async () => {
    editor.recorder.values.length = 0;

    editor.value.set('');
    await editor.flush();

    expect(editor.recorder.values).toContain('');
  });

  it('keeps tracking after the first programmatic write', async () => {
    editor.recorder.values.length = 0;

    for (const value of ['one', 'two', 'three']) {
      editor.value.set(value);
      await editor.flush();
    }

    expect(editor.recorder.values).toEqual(expect.arrayContaining(['one', 'two', 'three']));
  });

  it('pushes a language change into the mounted editor', async () => {
    editor.recorder.languages.length = 0;

    editor.language.set('yaml');
    await editor.flush();

    expect(editor.recorder.languages).toContain('yaml');
  });

  it('pushes a read-only change into the mounted editor', async () => {
    editor.recorder.readOnly.length = 0;

    editor.readOnly.set(true);
    await editor.flush();

    expect(editor.recorder.readOnly).toContain(true);
  });
});
