/**
 * The console/error bridge for the preview frame.
 *
 * A tiny script is injected at the top of the previewed document's <head> so it
 * runs before any of the page's own code. It overrides the console methods and
 * listens for uncaught errors, forwarding each to the parent with postMessage.
 * The frame keeps its null origin (the sandbox never gets `allow-same-origin`),
 * so this is the only channel out — and the parent still verifies every message
 * came from the live frame before trusting it.
 *
 * It is only injected when scripts are enabled; with scripts off nothing in the
 * frame can run, so there is nothing to capture and the markup stays pristine.
 */

/** The console levels captured, in the order they are wrapped. */
export const LOG_LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** The marker every bridge message carries, so the parent can recognise ours. */
export const CONSOLE_MESSAGE_SOURCE = 'html-preview-console';

/** Longest single message kept, in characters — a runaway log cannot flood us. */
const MAX_MESSAGE_LENGTH = 2000;

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value);
}

/**
 * The injected script, as a string. Written with plain concatenation and no
 * template literals so it is safe to embed and easy to reason about. It:
 *  - stringifies each argument defensively (strings pass through, Errors and
 *    objects are made readable, circular structures fall back to String());
 *  - wraps each console method, still calling the original;
 *  - reports `error` and `unhandledrejection` events as error lines;
 *  - posts to the parent with targetOrigin "*", which is all a null-origin frame
 *    can address — the payload is only the page's own console output.
 */
const BRIDGE_SCRIPT =
  '<script>(function(){' +
  'var MAX=' +
  MAX_MESSAGE_LENGTH +
  ';' +
  'function ser(v){' +
  'if(v===undefined)return "undefined";' +
  'if(v===null)return "null";' +
  'if(typeof v==="string")return v;' +
  'if(typeof v==="function")return "[function "+(v.name||"anonymous")+"]";' +
  'if(v instanceof Error)return (v.name||"Error")+": "+v.message;' +
  'try{var s=JSON.stringify(v,function(k,val){return typeof val==="bigint"?String(val):val;});' +
  'return s===undefined?String(v):s;}' +
  'catch(e){try{return String(v);}catch(_){return "[unserializable]";}}' +
  '}' +
  'function post(level,parts){' +
  'try{parent.postMessage({source:"' +
  CONSOLE_MESSAGE_SOURCE +
  '",level:level,text:parts.join(" ").slice(0,MAX)},"*");}catch(e){}' +
  '}' +
  'var levels=["log","info","warn","error","debug"];' +
  'for(var i=0;i<levels.length;i++){(function(m){' +
  'var orig=(console[m]||console.log).bind(console);' +
  'console[m]=function(){' +
  'var a=[];for(var j=0;j<arguments.length;j++){a.push(ser(arguments[j]));}' +
  'post(m,a);orig.apply(console,arguments);' +
  '};})(levels[i]);}' +
  'window.addEventListener("error",function(e){' +
  'var where=e.filename?" ("+(e.lineno||0)+":"+(e.colno||0)+")":"";' +
  'post("error",[(e.message||"Script error")+where]);' +
  '});' +
  'window.addEventListener("unhandledrejection",function(e){' +
  'var r=e.reason;post("error",["Uncaught (in promise) "+(r&&r.message?r.message:ser(r))]);' +
  '});' +
  '})();</script>';

/**
 * Return `html` with the bridge script inserted so it runs before the page's own
 * code: just inside <head> when there is one, otherwise before <body> or <html>,
 * and failing all of those, at the very front. Anything that keeps the document
 * a standards-mode page (never inserting ahead of an existing doctype) is worth
 * it, since injecting before the doctype would drop the preview into quirks mode
 * and change how the user's CSS renders.
 */
export function injectConsoleBridge(html: string): string {
  const head = html.match(/<head[^>]*>/i);
  if (head?.index !== undefined) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + BRIDGE_SCRIPT + html.slice(at);
  }
  const body = html.match(/<body[^>]*>/i);
  if (body?.index !== undefined) {
    return html.slice(0, body.index) + BRIDGE_SCRIPT + html.slice(body.index);
  }
  const htmlTag = html.match(/<html[^>]*>/i);
  if (htmlTag?.index !== undefined) {
    const at = htmlTag.index + htmlTag[0].length;
    return html.slice(0, at) + BRIDGE_SCRIPT + html.slice(at);
  }
  return BRIDGE_SCRIPT + html;
}
