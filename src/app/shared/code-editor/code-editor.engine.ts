/**
 * The CodeMirror 6 layer behind `<app-code-editor>`.
 *
 * It lives apart from the component for two reasons. The engine and the
 * language modes are ~200 kB together, and every one of the imports below is
 * dynamic, so the bundler emits them as their own chunks: a page that never
 * mounts an editor never pays for one, and opening the SQL formatter fetches
 * the SQL grammar but not the Markdown one.
 *
 * The second reason is that nothing above this file needs a CodeMirror type.
 * The component talks to an `EditorHandle`, so the whole library stays behind
 * one narrow, synchronous-looking interface.
 */

/** Language modes offered by the editor. `text` disables highlighting. */
export type EditorLanguage =
  | 'text'
  | 'json'
  | 'sql'
  | 'markdown'
  | 'html'
  | 'css'
  | 'javascript'
  | 'typescript'
  | 'yaml'
  | 'xml';

export interface EditorHandle {
  /** Replace the document, but only when it really differs from what is shown. */
  setValue(text: string): void;
  setLanguage(language: EditorLanguage): Promise<void>;
  setReadOnly(readOnly: boolean): void;
  setWrap(wrap: boolean): void;
  focus(): void;
  destroy(): void;
}

export interface EditorOptions {
  parent: HTMLElement;
  value: string;
  language: EditorLanguage;
  placeholder: string;
  readOnly: boolean;
  /** Accessible name for the text box — CodeMirror has no <label> to point at. */
  label: string;
  wrap: boolean;
  onChange: (value: string) => void;
}

/**
 * Everything is driven from custom properties rather than literal values, for
 * two separate reasons.
 *
 * Colours come from the `--cm-*` design tokens, so a theme switch re-paints the
 * editor with no JavaScript at all — CodeMirror injects this once as a real
 * stylesheet and the properties resolve against `:root` at paint time.
 *
 * Geometry (`--cme-*`, set by the component on its host) is the answer to a
 * subtler problem: Angular's emulated encapsulation tags only the elements it
 * renders itself, so a scoped rule in the component's stylesheet can never
 * match CodeMirror's runtime DOM. Custom properties inherit down the tree
 * regardless, which lets one shared stylesheet be reshaped per instance.
 */
const THEME_SPEC = {
  '&': {
    height: 'var(--cme-height, auto)',
    minHeight: 'var(--cme-min-height, 14rem)',
    backgroundColor: 'var(--surface)',
    color: 'var(--on)',
    borderRadius: 'var(--cme-radius, var(--r-field))',
    border: 'var(--cme-border, 1px solid var(--outline))',
    fontFamily: 'var(--mono)',
    fontSize: '0.9rem',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: 'var(--cme-focus-border, var(--primary))',
    boxShadow: 'var(--cme-focus-ring, 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent))',
  },
  '.cm-content': {
    padding: '0.85rem 0',
    caretColor: 'var(--on)',
    lineHeight: '1.5',
  },
  '.cm-line': { padding: '0 1rem' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--on)' },
  '.cm-gutters': {
    backgroundColor: 'var(--surface-1)',
    color: 'var(--on-var)',
    border: 'none',
    borderRight: '1px solid var(--outline-2)',
    borderRadius: 'var(--cme-radius, var(--r-field)) 0 0 var(--cme-radius, var(--r-field))',
  },
  '.cm-activeLine': { backgroundColor: 'var(--cm-active-line)' },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--cm-active-line)',
    color: 'var(--on)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--cm-selection)',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'color-mix(in srgb, var(--primary) 22%, transparent)',
  },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--primary) 26%, transparent)',
    outline: 'none',
  },
  '.cm-nonmatchingBracket': { color: 'var(--cm-invalid)' },
  '.cm-placeholder': { color: 'var(--on-var)' },
  '.cm-scroller': { fontFamily: 'var(--mono)' },
  '.cm-panels': {
    backgroundColor: 'var(--surface-2)',
    color: 'var(--on)',
    border: 'none',
  },
  '.cm-panels input, .cm-panels button': {
    fontFamily: 'var(--font)',
    borderRadius: '6px',
    border: '1px solid var(--outline)',
    backgroundColor: 'var(--surface)',
    color: 'var(--on)',
    padding: '0.15rem 0.4rem',
  },
  '.cm-panels button:hover': { backgroundColor: 'var(--surface-3)' },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--star) 40%, transparent)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--primary) 40%, transparent)',
  },
} as const;

export async function createEditor(options: EditorOptions): Promise<EditorHandle> {
  const [view, state, commands, language, search, highlight] = await Promise.all([
    import('@codemirror/view'),
    import('@codemirror/state'),
    import('@codemirror/commands'),
    import('@codemirror/language'),
    import('@codemirror/search'),
    import('@lezer/highlight'),
  ]);

  const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
    drawSelection, rectangularSelection, crosshairCursor, placeholder } = view;
  const { EditorState, Compartment } = state;
  const { tags } = highlight;

  const highlightStyle = language.HighlightStyle.define([
    { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--cm-comment)', fontStyle: 'italic' },
    { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.moduleKeyword], color: 'var(--cm-keyword)' },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--cm-string)' },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--cm-number)' },
    { tag: [tags.variableName, tags.propertyName, tags.function(tags.variableName)], color: 'var(--cm-name)' },
    { tag: [tags.typeName, tags.className, tags.namespace, tags.tagName], color: 'var(--cm-type)' },
    { tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket], color: 'var(--cm-operator)' },
    { tag: [tags.meta, tags.attributeName, tags.annotation, tags.processingInstruction], color: 'var(--cm-meta)' },
    { tag: [tags.heading], color: 'var(--cm-keyword)', fontWeight: 'bold' },
    { tag: [tags.link, tags.url], color: 'var(--cm-name)', textDecoration: 'underline' },
    { tag: [tags.emphasis], fontStyle: 'italic' },
    { tag: [tags.strong], fontWeight: 'bold' },
    { tag: [tags.invalid], color: 'var(--cm-invalid)' },
  ]);

  const languageSlot = new Compartment();
  const readOnlySlot = new Compartment();
  const wrapSlot = new Compartment();

  const extensions = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    rectangularSelection(),
    crosshairCursor(),
    commands.history(),
    language.bracketMatching(),
    language.foldGutter(),
    language.indentOnInput(),
    language.syntaxHighlighting(highlightStyle),
    search.highlightSelectionMatches(),
    EditorState.allowMultipleSelections.of(true),
    // Deliberately no `indentWithTab`: binding Tab inside the editor traps
    // keyboard users, who then cannot move past it. CodeMirror's default —
    // Tab moves focus, Ctrl-Shift-K and friends still edit — is the
    // WCAG-conformant behaviour, and it is worth more than tab-to-indent.
    keymap.of([...commands.defaultKeymap, ...commands.historyKeymap, ...search.searchKeymap]),
    placeholder(options.placeholder),
    EditorView.contentAttributes.of({ 'aria-label': options.label }),
    EditorView.theme(THEME_SPEC),
    wrapSlot.of(options.wrap ? EditorView.lineWrapping : []),
    readOnlySlot.of(EditorState.readOnly.of(options.readOnly)),
    languageSlot.of([]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onChange(update.state.doc.toString());
      }
    }),
  ];

  const editor = new EditorView({
    state: EditorState.create({ doc: options.value, extensions }),
    parent: options.parent,
  });

  const setLanguage = async (id: EditorLanguage): Promise<void> => {
    const support = await loadLanguage(id);
    editor.dispatch({ effects: languageSlot.reconfigure(support ?? []) });
  };

  await setLanguage(options.language);

  return {
    setValue(text: string): void {
      // Guarding on equality is what stops the round trip — component writes to
      // the signal, the signal writes back here — from moving the cursor to the
      // end of the document on every keystroke.
      if (text === editor.state.doc.toString()) {
        return;
      }
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: text },
      });
    },
    setLanguage,
    setReadOnly(readOnly: boolean): void {
      editor.dispatch({ effects: readOnlySlot.reconfigure(EditorState.readOnly.of(readOnly)) });
    },
    setWrap(wrap: boolean): void {
      editor.dispatch({ effects: wrapSlot.reconfigure(wrap ? EditorView.lineWrapping : []) });
    },
    focus: () => editor.focus(),
    destroy: () => editor.destroy(),
  };
}

/** Fetches one language mode. Unknown or plain text highlights nothing. */
async function loadLanguage(id: EditorLanguage) {
  switch (id) {
    case 'json':
      return (await import('@codemirror/lang-json')).json();
    case 'sql':
      return (await import('@codemirror/lang-sql')).sql();
    case 'markdown':
      return (await import('@codemirror/lang-markdown')).markdown();
    case 'html':
      return (await import('@codemirror/lang-html')).html();
    case 'css':
      return (await import('@codemirror/lang-css')).css();
    case 'javascript':
      return (await import('@codemirror/lang-javascript')).javascript();
    case 'typescript':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true });
    case 'yaml':
      return (await import('@codemirror/lang-yaml')).yaml();
    case 'xml':
      return (await import('@codemirror/lang-xml')).xml();
    default:
      return null;
  }
}
