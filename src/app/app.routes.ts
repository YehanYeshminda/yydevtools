import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home').then((m) => m.Home),
    title: 'yydevtools — Free developer utilities',
  },
  {
    path: 'about',
    loadComponent: () => import('./about/about').then((m) => m.About),
    title: 'About — yydevtools',
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
  {
    path: 'tools/jwt-decoder',
    loadComponent: () => import('./tools/jwt-decoder/jwt-decoder').then((m) => m.JwtDecoderTool),
    title: 'JWT Decoder — yydevtools',
  },
  {
    path: 'tools/image-compressor',
    loadComponent: () =>
      import('./tools/image-compressor/image-compressor').then((m) => m.ImageCompressorTool),
    title: 'Image Compressor — yydevtools',
  },
  {
    path: 'tools/pdf-merge',
    loadComponent: () => import('./tools/pdf-merge/pdf-merge').then((m) => m.PdfMergeTool),
    title: 'PDF Merge — yydevtools',
  },
  {
    path: 'tools/pdf-convert',
    loadComponent: () => import('./tools/pdf-convert/pdf-convert').then((m) => m.PdfConvertTool),
    title: 'PDF Convert — yydevtools',
  },
  {
    path: 'tools/pdf-ocr',
    loadComponent: () => import('./tools/pdf-ocr/pdf-ocr').then((m) => m.PdfOcrTool),
    title: 'PDF OCR — yydevtools',
  },
  {
    path: 'tools/pdf-compress',
    loadComponent: () =>
      import('./tools/pdf-compress/pdf-compress').then((m) => m.PdfCompressTool),
    title: 'PDF Compress — yydevtools',
  },
  {
    path: 'tools/pdf-viewer',
    loadComponent: () => import('./tools/pdf-viewer/pdf-viewer').then((m) => m.PdfViewerTool),
    title: 'PDF Viewer — yydevtools',
  },
  {
    path: 'tools/pdf-split',
    loadComponent: () => import('./tools/pdf-split/pdf-split').then((m) => m.PdfSplitTool),
    title: 'PDF Split — yydevtools',
  },
  {
    path: 'tools/hash-generator',
    loadComponent: () =>
      import('./tools/hash-generator/hash-generator').then((m) => m.HashGeneratorTool),
    title: 'Hash Generator — yydevtools',
  },
  {
    path: 'tools/uuid-generator',
    loadComponent: () =>
      import('./tools/uuid-generator/uuid-generator').then((m) => m.UuidGeneratorTool),
    title: 'UUID Generator — yydevtools',
  },
  {
    path: 'tools/timestamp-converter',
    loadComponent: () =>
      import('./tools/timestamp-converter/timestamp-converter').then(
        (m) => m.TimestampConverterTool,
      ),
    title: 'Timestamp Converter — yydevtools',
  },
  {
    path: 'tools/color-converter',
    loadComponent: () =>
      import('./tools/color-converter/color-converter').then((m) => m.ColorConverterTool),
    title: 'Color Converter — yydevtools',
  },
  { path: '**', redirectTo: '' },
];
