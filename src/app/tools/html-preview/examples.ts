/**
 * The starter documents behind the "Examples" row. Each is a complete, self
 * contained page — inline CSS, no external requests — so the preview renders it
 * exactly as written. They are authored with NO backticks or `${}` so the markup
 * survives being a template literal here.
 */

export type ExampleId = 'card' | 'newsletter' | 'form';

export interface Example {
  id: ExampleId;
  label: string;
  /** Whether loading it should also switch scripts on. */
  scripts: boolean;
  html: string;
}

const CARD = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        margin: 0;
        padding: 2rem;
        background: #0f172a;
        color: #e2e8f0;
      }
      .card {
        max-width: 26rem;
        margin: 2rem auto;
        padding: 1.5rem;
        border-radius: 16px;
        background: linear-gradient(135deg, #1e293b, #334155);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
      }
      h1 {
        margin: 0 0 0.5rem;
        font-size: 1.4rem;
      }
      p {
        margin: 0 0 1rem;
        color: #94a3b8;
        line-height: 1.5;
      }
      button {
        font: inherit;
        padding: 0.6rem 1rem;
        border: 0;
        border-radius: 10px;
        background: #38bdf8;
        color: #0f172a;
        font-weight: 600;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Hello from your browser 👋</h1>
      <p>Edit the HTML on the left — this preview updates as you type. Turn on "Run scripts" to make the button work.</p>
      <button id="go">Clicked 0 times</button>
    </div>
    <script>
      var n = 0;
      var btn = document.getElementById('go');
      btn.addEventListener('click', function () {
        n++;
        btn.textContent = 'Clicked ' + n + (n === 1 ? ' time' : ' times');
      });
    </script>
  </body>
</html>
`;

const NEWSLETTER = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0; background:#f1f5f9; font-family:Arial, sans-serif; color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:#4f46e5; padding:28px 32px;">
                <h1 style="margin:0; color:#ffffff; font-size:22px;">The Weekly Build</h1>
                <p style="margin:6px 0 0; color:#c7d2fe; font-size:14px;">Issue #42 — shipping notes</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <h2 style="margin:0 0 8px; font-size:18px;">Preview HTML emails at real width</h2>
                <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#334155;">
                  This layout is a classic table-based email. Use the width selector above the preview
                  to check how it holds up on a phone versus a desktop client.
                </p>
                <a href="https://example.com" style="display:inline-block; background:#4f46e5; color:#ffffff; text-decoration:none; padding:12px 20px; border-radius:8px; font-size:15px; font-weight:bold;">
                  Read the notes
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px; background:#f8fafc; color:#64748b; font-size:12px; text-align:center;">
                You are previewing this locally — nothing was sent.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

const FORM = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        margin: 0;
        padding: 2rem 1rem;
        background: #f8fafc;
        color: #0f172a;
      }
      form {
        max-width: 28rem;
        margin: 0 auto;
        padding: 1.75rem;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
      }
      h1 {
        margin: 0 0 1.25rem;
        font-size: 1.3rem;
      }
      label {
        display: block;
        margin: 0 0 0.35rem;
        font-size: 0.9rem;
        font-weight: 600;
      }
      input,
      textarea {
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 1rem;
        padding: 0.65rem 0.75rem;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        font: inherit;
      }
      button {
        width: 100%;
        padding: 0.75rem;
        border: 0;
        border-radius: 8px;
        background: #16a34a;
        color: #ffffff;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <form onsubmit="event.preventDefault(); this.querySelector('button').textContent = 'Sent ✓';">
      <h1>Get in touch</h1>
      <label for="name">Name</label>
      <input id="name" type="text" placeholder="Ada Lovelace" />
      <label for="email">Email</label>
      <input id="email" type="email" placeholder="ada@example.com" />
      <label for="message">Message</label>
      <textarea id="message" rows="4" placeholder="Say hello…"></textarea>
      <button type="submit">Send</button>
    </form>
  </body>
</html>
`;

export const EXAMPLES: readonly Example[] = [
  { id: 'card', label: 'Card', scripts: true, html: CARD },
  { id: 'newsletter', label: 'Newsletter', scripts: false, html: NEWSLETTER },
  { id: 'form', label: 'Form', scripts: true, html: FORM },
];
