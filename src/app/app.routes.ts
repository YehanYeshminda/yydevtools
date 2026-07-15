import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home').then((m) => m.Home),
    title: 'yydevtools — Free AI & developer utilities',
  },
  {
    path: 'tools/base64-converter',
    loadComponent: () => import('./tools/base64/base64').then((m) => m.Base64Tool),
    title: 'Base64 Converter — yydevtools',
  },
  {
    path: 'tools/json-formatter',
    loadComponent: () =>
      import('./tools/json-formatter/json-formatter').then((m) => m.JsonFormatterTool),
    title: 'JSON Formatter — yydevtools',
  },
  {
    path: 'tools/markdown-editor',
    loadComponent: () =>
      import('./tools/markdown-editor/markdown-editor').then((m) => m.MarkdownEditorTool),
    title: 'Markdown Editor — yydevtools',
  },
  { path: '**', redirectTo: '' },
];
