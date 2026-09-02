import type { ToolContent } from './tool-content.model';

/**
 * Long-form content for each tool, keyed by slug. See {@link ToolContent} for the
 * shape and the rules: every entry must be genuinely specific to its tool, plain
 * text only. Rendered by the ToolContent component and mirrored into the page's
 * FAQ/SoftwareApplication structured data.
 */
export const TOOL_CONTENT: Record<string, ToolContent> = {
  'json-formatter': {
    slug: 'json-formatter',
    intro: [
      'The JSON Formatter takes messy, minified or hand-edited JSON and turns it into clean, indented, readable text — or does the reverse and strips it down to the smallest valid form for shipping over the wire. It also validates as it goes, so the moment your JSON has a stray comma, an unclosed bracket or a missing quote, you get a clear message pointing at the problem instead of a silent failure.',
      'Beyond formatting, it converts between JSON and YAML in both directions and lets you pull values out of a document with a JSONPath query. All of it runs on your own device — the text you paste is never uploaded to a server — which makes it safe to use on API responses, config files and other data you would rather not send anywhere.',
    ],
    steps: [
      'Paste or type your JSON into the input area.',
      'Choose Format to pretty-print it, or Minify to compress it to a single line.',
      'Adjust the indent width, or turn on sort-keys if you want a stable, diff-friendly key order.',
      'To convert, pick To YAML or YAML to JSON; to extract values, enter a JSONPath expression such as $.items[*].id.',
      'Copy the result, or read the error message if the input is not valid JSON.',
    ],
    features: [
      'Validation with human-readable error messages, not just a red outline.',
      'JSON to YAML and YAML to JSON, honouring your indent and sort-keys choices.',
      'JSONPath queries for pulling matching nodes out of large documents.',
      'Everything runs in your browser, so sensitive payloads never leave your machine.',
    ],
    sections: [
      {
        heading: 'The JSON rules that catch people out',
        body: [
          'JSON is small enough to describe in a paragraph, which makes its strictness surprising. Keys must be double-quoted strings — single quotes are not JSON, and neither are bare keys, however much they look like JavaScript. Trailing commas are invalid. Comments do not exist. `NaN`, `Infinity` and `undefined` are not values. Numbers cannot have leading zeros or a trailing decimal point.',
          'Most "invalid JSON" errors are one of those, and most come from the same root cause: JSON looks like a JavaScript object literal but is a strictly smaller language. Something pasted from code will often be rejected for a comma or a quote that JavaScript would have accepted.',
          'The other classic is duplicate keys. The specification does not forbid them, and parsers generally keep the last occurrence silently — so a document can be technically valid and still lose data on the way in.',
        ],
      },
      {
        heading: 'Formatting, minifying, and what neither changes',
        body: [
          'Formatting and minifying only move whitespace. They do not alter a single value, and the parsed result is identical either way — which is worth remembering when a formatted file looks different enough to feel changed. Minified JSON is for transmission, where every byte is paid for on every request; formatted JSON is for reading and for diffing, because a one-property change to a minified file is a change to the only line in it.',
          'One genuine caveat: neither operation preserves key order as a guarantee. JSON objects are unordered by definition, and while most parsers happen to preserve insertion order, nothing in the format requires it. Code that depends on key order is depending on an implementation detail.',
        ],
      },
      {
        heading: 'The number problem nobody warns you about',
        body: [
          'JSON numbers have no size limit in the specification, but JavaScript parses them as IEEE 754 doubles, which hold integers exactly only up to 2^53 − 1. Beyond that, precision is silently lost — a 64-bit database identifier or a Twitter-style snowflake ID can come back as a different number than was sent, with no error anywhere.',
          'The symptom is a record that cannot be found by the ID you just received, off by one or two at the end. The fix is on the producing side: send large identifiers as strings. If you are consuming an API that does not, you need a parser that handles big integers rather than the built-in one.',
        ],
      },
    ],
    faq: [
      {
        q: 'Is my JSON uploaded anywhere?',
        a: 'No. The formatter, validator, YAML conversion and JSONPath queries all run locally in your browser. Nothing you paste is sent to a server, which is why it is safe to use on private API responses and config.',
      },
      {
        q: 'What is the difference between formatting and minifying?',
        a: 'Formatting adds indentation and line breaks so the JSON is easy to read. Minifying removes every unnecessary space and newline to make the file as small as possible, which is what you want when sending it over a network.',
      },
      {
        q: 'Why does my JSON show an error?',
        a: 'JSON is strict: keys and strings must use double quotes, there can be no trailing commas, and every bracket and brace must be closed. The error message points at what tripped the parser so you can fix it.',
      },
      {
        q: 'Can it convert JSON to YAML?',
        a: 'Yes, in both directions. It respects your indent width and the sort-keys option, and reports an error if the YAML or JSON you paste cannot be parsed.',
      },
      {
        q: 'What is JSONPath used for?',
        a: 'JSONPath is a query language for JSON, similar to what XPath is for XML. It lets you select specific nodes from a large document — for example every id inside an items array — without scrolling through the whole thing.',
      },
    ],
    related: ['json-to-types', 'code-formatter', 'base64-converter'],
  },

  'json-to-types': {
    slug: 'json-to-types',
    intro: [
      'Paste a sample JSON object and this tool generates matching type definitions in the language of your choice — TypeScript interfaces, C# classes, Python dataclasses or Pydantic models, Go structs, Rust serde structs, Kotlin and Java data classes, a Zod schema or a JSON Schema. It saves you the tedious, error-prone job of hand-typing a shape you already have an example of.',
      'The generator infers nested objects as their own named types, spots when a field is sometimes absent and marks it optional, and widens types when the same key holds different values across samples. That means the output is not a naive one-to-one mapping — it reflects how the data actually varies, which is exactly what you need when the JSON comes from a real API.',
    ],
    steps: [
      'Paste a representative JSON sample — ideally one that includes any optional fields.',
      'Pick the target language or schema from the toggle.',
      'Read the generated types; nested objects become their own named declarations.',
      'Adjust the root type name if you want something more meaningful than the default.',
      'Copy the output straight into your project.',
    ],
    features: [
      'Ten targets: TypeScript, C#, Python dataclasses, Pydantic v2, Go, Rust, Kotlin, Java, Zod and JSON Schema.',
      'Nested objects are extracted into their own named types, ordered so dependencies come first where the language requires it.',
      'Optional and nullable fields are inferred from what varies across the sample.',
      'Runs entirely in your browser — your JSON never leaves the page.',
    ],
    sections: [
      {
        heading: 'What can and cannot be inferred from a sample',
        body: [
          'Generating types from JSON is inference from evidence, and it is worth being clear about what the evidence supports. A sample proves that a field can hold a given kind of value. It cannot prove that the field is always present, that a string is always a date, that an empty array is an array of objects, or that a number is an integer rather than a float that happened to land on a round value.',
          'This is why the quality of your output depends almost entirely on the quality of your sample. One record produces types that describe one record. Paste an array of many records and the generator can see which fields vary, which are sometimes absent, and which are sometimes null — turning guesses into optional and nullable markers that actually reflect the API.',
          'The fields most often wrong are the ones that were null in your sample. Null tells you nothing about what the field holds when it is populated, so the generated type will be as vague as the evidence. Those are worth fixing by hand against the API documentation.',
        ],
      },
      {
        heading: 'Types are a claim, not a check',
        body: [
          'A TypeScript interface describing an API response is erased at compile time. It makes the compiler help you and does nothing at runtime — if the server returns a shape that contradicts it, nothing objects, and you get an undefined several layers deeper with no indication of where the assumption broke.',
          'This is the honest limitation of generated types, and the reason JSON Schema is also offered here. A schema is data rather than syntax, so it can be validated at runtime, shared with consumers in other languages, and used to reject a bad payload at the boundary. The pragmatic combination is generated types for the editor and a runtime check at the edge where data enters your system.',
        ],
      },
    ],
    faq: [
      {
        q: 'Which languages and schemas can it generate?',
        a: 'TypeScript interfaces, C# classes, Python dataclasses, Pydantic v2 models, Go structs, Rust serde structs, Kotlin data classes, Java records, a Zod schema and JSON Schema (draft 2020-12).',
      },
      {
        q: 'How does it decide which fields are optional?',
        a: 'If you paste an array of samples, a key that is missing from some of them is treated as optional. A key whose value is sometimes null is marked nullable. This is why a varied sample produces better types than a single perfect object.',
      },
      {
        q: 'Does it handle nested objects and arrays?',
        a: 'Yes. Nested objects are lifted into their own named types and referenced from the parent, and arrays take the type of their elements. Languages that cannot reference a type declared later have their definitions ordered so dependencies come first.',
      },
      {
        q: 'Is the JSON I paste kept private?',
        a: 'Yes. The inference and code generation run locally in your browser. Nothing is uploaded, so you can safely paste responses from internal or production APIs.',
      },
    ],
    related: ['json-formatter', 'code-formatter', 'jwt-decoder'],
  },

  'jwt-decoder': {
    slug: 'jwt-decoder',
    intro: [
      'A JSON Web Token looks like three chunks of gibberish separated by dots, but it is really just Base64URL-encoded JSON. This decoder splits it apart and shows you the header, the payload and every claim inside — issuer, subject, audience, and the issued-at and expiry times rendered as readable dates so you can see at a glance whether a token has expired.',
      'It can also verify the signature, which is the part that actually tells you whether a token is genuine. Paste an HMAC secret for HS256/384/512, or a PEM public key for RSA and ECDSA tokens (RS, PS and ES families), and it checks the signature with the browser Web Crypto API. Both decoding and verification happen entirely on your device, so you can inspect real production tokens without the security risk of pasting them into a remote site.',
    ],
    steps: [
      'Paste the JWT into the token field.',
      'Read the decoded header and payload; timestamp claims like exp and iat are shown as human-readable dates.',
      'To verify, choose the algorithm family and paste the shared secret (HMAC) or the public key (RSA/ECDSA).',
      'Check the verification result: verified, does not match, unsupported algorithm, or an error.',
    ],
    features: [
      'Decodes the header and payload and flags expired tokens.',
      'Verifies HS256/384/512 with a secret, and RS/PS/ES256/384/512 with a PEM public key.',
      'Uses the browser Web Crypto API — no library and no network request.',
      'Tokens and keys never leave your browser.',
    ],
    sections: [
      {
        heading: 'Decoding is not verifying',
        body: [
          'This is the distinction that matters most about JWTs, and the one that produces real vulnerabilities. Decoding a token means Base64-decoding two of its three parts to read the header and the claims. Anyone can do it, to any token, without a key — the payload is not encrypted and was never intended to be.',
          'Verifying means recomputing the signature over the header and payload with the correct key and confirming it matches. Only that step tells you the token was issued by who it claims and has not been altered. Reading a `role` claim from a decoded token and trusting it, without verifying the signature, means anyone can edit that claim to whatever they like and be believed.',
          'The practical rule: decode freely for debugging, but never let a decoded claim influence a decision on the server until the signature has been checked.',
        ],
      },
      {
        heading: 'The attacks worth knowing about',
        body: [
          'The `alg: none` downgrade is the classic. The header names its own algorithm, so an attacker rewrites it to `none`, strips the signature and sends the token. A verifier that trusts the header rather than its own configuration accepts it. The fix is to decide the expected algorithm server-side and reject anything else, rather than asking the token what to do.',
          'RS256-to-HS256 confusion is subtler and more dangerous. RS256 verifies with a public key; HS256 verifies with a shared secret. If a verifier takes the algorithm from the header and the key from configuration, an attacker can switch the header to HS256 and sign the token using the RSA public key as the HMAC secret — and the public key, being public, is something they already have. Again, pinning the algorithm defeats it.',
          'Beyond signatures, verification is not complete without checking claims: `exp` for expiry, and `iss` and `aud` to confirm the token was issued by your provider for your service. A perfectly valid token from a different application is still not a token for yours.',
        ],
      },
      {
        heading: 'What does not belong in a token',
        body: [
          'Because the payload is readable by anyone holding the token, it should carry no secrets — no passwords, no keys, no personal data beyond what the client is entitled to see. A token that travels through browsers, proxy logs and error reports should be assumed to be visible.',
          'Size is the other constraint people meet late. Tokens are sent on every request, usually in a header, and headers have limits — stuffing a long list of permissions into a JWT eventually produces requests that a proxy rejects. Keep tokens small, reference data by identifier, and remember that a JWT cannot be revoked before it expires unless you maintain a deny-list, which is why short lifetimes and refresh tokens exist.',
        ],
      },
    ],
    faq: [
      {
        q: 'Is it safe to paste a real JWT here?',
        a: 'Yes. Decoding and signature verification both run locally in your browser. The token and any key you enter are never transmitted, so inspecting a live token here does not expose it the way pasting it into a server-side tool would.',
      },
      {
        q: 'Can it verify the signature?',
        a: 'Yes. Enter the HMAC secret for HS256/384/512, or the PEM public key for the RSA (RS/PS) and ECDSA (ES) families, and it verifies the signature with Web Crypto. Without a key it still decodes and shows the claims.',
      },
      {
        q: 'Why does my token show as expired?',
        a: 'The exp claim is a Unix timestamp for when the token stops being valid. The decoder converts it to a readable date and compares it with now; if that moment has passed, the token is expired regardless of whether the signature is valid.',
      },
      {
        q: 'Does decoding a JWT mean it is trusted?',
        a: 'No. Anyone can decode the payload — it is only Base64, not encryption. A token is only trustworthy if its signature verifies against the correct key, which is what the verification step checks.',
      },
    ],
    related: ['jwt-editor', 'base64-converter', 'hash-generator'],
  },

  'jwt-editor': {
    slug: 'jwt-editor',
    intro: [
      'A JSON Web Token is signed over its header and payload, so the moment you change a claim — a role, an expiry, a subject — the original signature no longer matches and every correct verifier rejects the token. There is no way to edit a JWT and keep it valid without re-signing it, and re-signing needs the signing key. This editor does exactly that: it decodes an existing token into its header and payload, lets you edit them as JSON, and produces a fresh, correctly signed token.',
      'It signs with the browser Web Crypto API — HS256/384/512 from a shared secret, and the RSA and ECDSA families (RS, PS and ES) from a PKCS#8 private key. The token you paste, the JSON you edit and the key you supply never leave your device, so you can rebuild a test token from a real one without exposing either the token or the key to a remote server.',
    ],
    steps: [
      'Paste an existing token and choose “Load into editor” to fill the header and payload, or type them in directly.',
      'Edit the header and payload JSON — the algorithm is read from the header’s alg field.',
      'Paste the signing key: the shared secret for HS*, or a PKCS#8 private key (-----BEGIN PRIVATE KEY-----) for RS/PS/ES.',
      'Copy the freshly signed token from the result. It verifies against the matching key.',
    ],
    features: [
      'Re-signs edited HS256/384/512 tokens from a secret, and RS/PS/ES256/384/512 from a PKCS#8 private key.',
      'Reads the algorithm from the header, so editing alg switches the key it expects.',
      'Can emit an unsigned alg:none token, to test whether a server wrongly accepts one.',
      'Uses the browser Web Crypto API — no library and no network request.',
      'The token, the edited claims and the key never leave your browser.',
    ],
    faq: [
      {
        q: 'Can I change a JWT without invalidating it?',
        a: 'Not without the signing key. The signature is computed over the header and payload, so any edit to the claims breaks it. What you can do — and what this tool does — is edit the claims and then re-sign with the key, which produces a new token that is valid against that key.',
      },
      {
        q: 'Do I need the signing key?',
        a: 'Yes. For HS256/384/512 that is the shared HMAC secret; for RS, PS and ES tokens it is the PKCS#8 private key. Without the correct key you can decode and edit a token, but any token produced will be rejected by a verifier that checks the signature. This tool cannot forge a token for a key you do not have.',
      },
      {
        q: 'Why is my RSA or EC private key rejected?',
        a: 'Web Crypto imports unencrypted PKCS#8 keys — the ones that begin with “-----BEGIN PRIVATE KEY-----”. Legacy PKCS#1 (“BEGIN RSA PRIVATE KEY”) and SEC1 (“BEGIN EC PRIVATE KEY”) formats are not accepted. Convert one with: openssl pkcs8 -topk8 -nocrypt -in key.pem.',
      },
      {
        q: 'Is it safe to paste a real token and key here?',
        a: 'Editing and signing both run locally in your browser with Web Crypto. The token, the JSON you edit and the private key you enter are never transmitted. Even so, treat a private key with care and prefer a test key where you can.',
      },
      {
        q: 'What is the “alg: none” / unsigned option for?',
        a: 'Setting the header algorithm to “none” produces an unsigned token — a header and payload with an empty signature and no key. A correctly configured server rejects it outright; it is accepted only by a verifier misconfigured to allow the “none” algorithm, which is a known JWT vulnerability. The option exists so you can test your own service (or one you are authorised to test) for that flaw. It does not let you forge a valid token — a properly configured server will still reject it.',
      },
    ],
    related: ['jwt-decoder', 'hash-generator', 'json-formatter'],
  },

  'hash-generator': {
    slug: 'hash-generator',
    intro: [
      'This tool computes cryptographic and checksum digests of text or a file: MD5, CRC32, and the SHA family (SHA-1, SHA-256, SHA-384 and SHA-512). Hashes are how you fingerprint data — verifying a download matches its published checksum, comparing two files without opening them, or storing a fixed-length identifier for a piece of content.',
      'Enter an optional secret key and the output switches to keyed HMAC digests, which is what you use to sign a message so a recipient can confirm it was not tampered with. Files up to a quarter of a gigabyte are hashed on a background thread, so even a large file will not freeze the page, and nothing you hash is ever uploaded.',
    ],
    steps: [
      'Type or paste text, or drop in one or more files.',
      'Read the computed digests — CRC32, MD5 and the SHA family are shown together.',
      'To produce an HMAC instead, enter a secret key; the output switches to keyed digests.',
      'Paste a checksum you were given into the verify box to see whether anything above matches it.',
      'Copy a single digest, or export the whole batch as a checksum list.',
    ],
    features: [
      'MD5, CRC32, SHA-1, SHA-256, SHA-384 and SHA-512 in one pass.',
      'Keyed HMAC-SHA when you provide a secret key.',
      'Hashes a batch of files at once and exports a sha256sum-style checksum file.',
      'Verifies a digest you were given against everything hashed, and names the algorithm that matched.',
      'Handles files up to 250 MB on a background thread, so the UI stays responsive.',
      'All hashing is local — files are never uploaded.',
    ],
    faq: [
      {
        q: 'What is the difference between MD5, SHA and CRC32?',
        a: 'CRC32 is a fast checksum for catching accidental corruption, not an cryptographic hash. MD5 and SHA-1 are cryptographic but now considered weak against deliberate collisions. SHA-256 and above are the current recommendation for anything security-related.',
      },
      {
        q: 'When should I use HMAC instead of a plain hash?',
        a: 'Use HMAC when you need to prove a message came from someone who holds a shared secret and was not altered — for example signing an API request or a webhook payload. A plain hash proves integrity but not authenticity.',
      },
      {
        q: 'Are my files uploaded to compute the hash?',
        a: 'No. Hashing runs in your browser, on a background thread for large inputs. The file never leaves your device, so you can safely hash confidential documents.',
      },
      {
        q: 'Can I use this to verify a download?',
        a: 'Yes, and there is a dedicated box for it. Drop the downloaded file in, paste the checksum the publisher listed into the verify field, and the tool tells you whether it matches — and which algorithm produced it, so you do not have to know in advance whether you were given an MD5 or a SHA-256.',
      },
      {
        q: 'Can I checksum a whole folder at once?',
        a: 'Drop in as many files as you like and each is hashed in turn. "Download .txt" then exports them in the two-space format that sha256sum and its relatives read, so the same list can be checked on another machine with sha256sum -c.',
      },
    ],
    related: ['jwt-decoder', 'base64-converter', 'uuid-generator'],
  },

  'text-diff': {
    slug: 'text-diff',
    intro: [
      'Paste two versions of a block of text and this tool highlights exactly what changed between them, line by line. It is the same idea as a code review diff, but for anything: two drafts of an email, two config files, a copied-and-pasted log before and after, or two API responses you suspect differ in one subtle place.',
      'You can view the comparison side by side in a split layout or stacked in a unified layout, and you can tell it to ignore case or whitespace differences when those do not matter. Added, removed and unchanged lines are counted and colour-coded, so the shape of the change is obvious at a glance.',
    ],
    steps: [
      'Paste the original text on one side and the changed text on the other.',
      'Choose the split view to see the two versions next to each other, or the unified view to see them stacked.',
      'Turn on ignore-case or ignore-whitespace if those differences are noise for your comparison.',
      'Read the highlighted additions and removals, and the per-side line numbers.',
    ],
    features: [
      'Split and unified views, with a swap button to flip the two sides.',
      'Options to ignore case and whitespace.',
      'Line counts for additions, removals and unchanged lines.',
      'Runs entirely in your browser; nothing you compare is uploaded.',
    ],
    sections: [
      {
        heading: 'How a diff decides what changed',
        body: [
          'A diff is not comparing the two texts position by position. It is solving a specific problem: find the longest sequence of lines that appears in both documents in the same order. Everything in that sequence is unchanged; everything else is an insertion or a deletion. A modified line is simply a deletion and an insertion that happen to sit next to each other — which is why diffs describe changes in terms of added and removed lines rather than edited ones.',
          'This framing explains a result that often looks wrong. When you insert a line near others that look similar, the algorithm may attribute the change differently than a human would, marking a later line as added rather than the one you actually typed. Both descriptions produce the same final document, and the algorithm chose the shorter one. It is optimising for the smallest set of changes, not for matching your intent.',
        ],
      },
      {
        heading: 'Split or unified, and when each is easier',
        body: [
          'The split view puts the two versions side by side and is best for reading — you can see both states of a line at once, which suits reviewing prose, configuration or anything where the old value matters as much as the new one.',
          'The unified view interleaves both into one column with additions and removals marked. It is the format Git and code review tools use, it survives being pasted into a ticket or a chat message, and it is far easier to read on a narrow screen. That is why this tool switches to unified automatically on phones: two columns of monospace text at 375 pixels wide are roughly 25 characters each, which is unreadable.',
        ],
      },
      {
        heading: 'Whitespace, line endings and false differences',
        body: [
          'A surprising share of "everything changed" diffs are not real changes. The usual cause is line endings: Windows ends lines with a carriage return and a newline, Unix and macOS with a newline alone. Open a file on the wrong platform, save it, and every line differs by an invisible character — the content is identical and the diff is total.',
          'Trailing whitespace and tabs-versus-spaces cause the same effect in miniature, which is why editors that strip trailing spaces on save can turn a one-line change into a fifty-line diff. If a diff looks impossibly large, suspect an invisible difference before assuming the file was rewritten.',
        ],
      },
    ],
    faq: [
      {
        q: 'What is the difference between the split and unified views?',
        a: 'The split view puts the two texts side by side and lines up their changes. The unified view stacks them into one column, showing removed lines followed by the added lines that replace them — the style you see in most code review tools.',
      },
      {
        q: 'Can it ignore formatting-only differences?',
        a: 'Yes. Turn on ignore-whitespace to treat lines that differ only in spacing or indentation as identical, and ignore-case to treat upper and lower case as the same. This keeps the diff focused on meaningful changes.',
      },
      {
        q: 'Is there a size limit?',
        a: 'The comparison is designed for two revisions of a document, which it handles instantly. Extremely large inputs will still work but take longer, since comparing lines is inherently more work as the texts grow.',
      },
      {
        q: 'Is my text kept private?',
        a: 'Yes. The whole comparison runs locally in your browser. Neither block of text is uploaded, so it is safe for private documents and logs.',
      },
    ],
    related: ['code-formatter', 'json-formatter', 'markdown-editor'],
  },

  'regex-tester': {
    slug: 'regex-tester',
    intro: [
      'Build and debug a regular expression against live sample text and see every match highlighted as you type. Regex is powerful but unforgiving, and the fastest way to get one right is to watch what it actually matches — this tool shows you exactly that, including each capture group broken out by number or name.',
      'All the JavaScript flags are one click away — global, case-insensitive, multiline, dotall, unicode and sticky — so you can see how each one changes the result. It guards against the classic zero-width-match infinite loop and caps runaway patterns, so an experimental expression can never hang the page.',
    ],
    steps: [
      'Type your regular expression in the pattern field.',
      'Toggle the flags you need — g, i, m, s, u or y.',
      'Paste the text you want to test against.',
      'Watch matches highlight live, and expand a match to see its capture groups.',
    ],
    features: [
      'Live match highlighting as you edit the pattern or the text.',
      'All JavaScript flags: global, ignore-case, multiline, dotall, unicode and sticky.',
      'Per-match capture group breakdown, with named groups labelled by name.',
      'Safe against zero-width and runaway matches; everything runs in your browser.',
    ],
    sections: [
      {
        heading: 'Greedy, lazy, and why your match is too long',
        body: [
          'The single most common regex surprise is a pattern matching far more than intended. Quantifiers are greedy by default: `.*` takes as much as it possibly can, then gives characters back one at a time until the rest of the pattern fits. Run `<.*>` against `<b>bold</b>` and it matches the entire string, because the last `>` in the input satisfies the pattern just as well as the first.',
          'Adding `?` makes a quantifier lazy — `<.*?>` stops at the first `>` and matches only `<b>`. Better still is to be specific about what you will accept: `<[^>]*>` says "anything that is not a closing bracket", which cannot overrun by construction and does not rely on backtracking to correct itself.',
          'That last form is usually the right instinct. Most regex bugs come from `.` being permitted where something narrower was meant.',
        ],
      },
      {
        heading: 'Anchors, boundaries and the flags that change everything',
        body: [
          '`^` and `$` mean start and end of input — until you add the multiline flag, at which point they mean start and end of each line. That single flag changes the meaning of a great many patterns, and forgetting it is why a pattern that works on one line fails on a block of text.',
          'The dotall flag matters for the opposite reason: `.` does not match a newline by default, so a pattern intended to span lines silently fails on multi-line input. Word boundaries (`\\b`) are the other place people trip, because "word" means letters, digits and underscore, so a boundary sits in the middle of "don\'t" and beside a hyphen.',
          'The global flag has a subtler catch in JavaScript specifically: a global regex object keeps a lastIndex between calls, so reusing one across separate tests gives alternating results. If a pattern seems to work every other time, that is why.',
        ],
      },
      {
        heading: 'Catastrophic backtracking, and the limits of regex',
        body: [
          'Nested quantifiers over overlapping alternatives — the classic shape is `(a+)+b` — can make the engine explore exponentially many ways to split the input before concluding there is no match. On a short string it is instant; add thirty characters and it can hang for minutes. When such a pattern is applied to user input, that is a denial-of-service vector rather than merely a bug, which is why this tester bounds execution instead of letting the tab freeze.',
          'It is also worth knowing where regex is the wrong tool entirely. HTML and other nested structures cannot be parsed by regular expressions, because matching arbitrarily nested tags requires counting and a regular language cannot count. You can match a specific known snippet, but any pattern claiming to parse HTML in general is wrong on some input. The same applies to nested JSON, and to email addresses, where the fully correct pattern is thousands of characters long and still not what you want — sending a confirmation message tests deliverability, which a pattern never can.',
        ],
      },
    ],
    faq: [
      {
        q: 'Which regex flavour does this use?',
        a: 'It uses the JavaScript (ECMAScript) regular expression engine, the same one that runs in browsers and Node.js. Most features are shared with other flavours, but some syntax such as lookbehind or named groups can differ between languages.',
      },
      {
        q: 'What do the flags do?',
        a: 'g finds all matches instead of just the first, i ignores case, m makes ^ and $ match line boundaries, s lets a dot match newlines, u enables full unicode handling, and y anchors each match to where the last one ended.',
      },
      {
        q: 'How do I see my capture groups?',
        a: 'Each match lists its capture groups in order, and any named groups are shown by their name. This makes it easy to confirm that the parentheses in your pattern are capturing the pieces you expect.',
      },
      {
        q: 'Can a bad pattern freeze the page?',
        a: 'No. The tester caps the number of matches and guards against zero-width matches that would otherwise loop forever, so you can experiment freely without locking up your browser.',
      },
    ],
    related: ['case-converter', 'text-diff', 'json-formatter'],
  },

  'cron-explainer': {
    slug: 'cron-explainer',
    intro: [
      'Cron expressions are compact but cryptic — five or six fields of numbers, asterisks and slashes that few people can read fluently. Paste one here and it is translated into a plain-English sentence, so you can confirm at a glance that "0 9 * * 1-5" really does mean nine in the morning on weekdays and not something else.',
      'It also lists the next several times the schedule will fire, calculated from right now, so you can sanity-check the timing before you commit it to a server. A local and UTC toggle shows those upcoming runs in whichever zone matters for your deployment.',
    ],
    steps: [
      'Paste or type a cron expression, or pick one of the example presets.',
      'Read the plain-English description of what it means.',
      'Review the list of upcoming run times.',
      'Switch between local time and UTC to match your server, and refresh to re-anchor the next runs to the current moment.',
    ],
    features: [
      'Plain-English description of any standard cron expression.',
      'A preview of the next scheduled run times.',
      'Local and UTC display, so the times match your deployment.',
      'Runs in your browser with no account needed.',
    ],
    sections: [
      {
        heading: 'Reading the five fields',
        body: [
          'A cron expression is five fields separated by spaces: minute, hour, day of month, month, day of week. Each accepts a number, a list ("1,15"), a range ("9-17"), a step ("*/15"), or an asterisk meaning every value. The whole expression fires when all fields match the current time, which is the key to reading one — it is an AND across fields, not a sequence of instructions.',
          'That single rule explains most of what looks arbitrary. "0 9 * * 1-5" reads as: minute is 0, hour is 9, any day of the month, any month, and the weekday is Monday to Friday — nine in the morning on weekdays. "*/15 * * * *" is every minute divisible by 15, so four times an hour on the quarter hours, not "fifteen minutes after whenever it last ran".',
        ],
      },
      {
        heading: 'The day-of-month and day-of-week trap',
        body: [
          'There is one genuine irregularity in cron, and almost everyone meets it eventually. If both the day-of-month and day-of-week fields are restricted, cron treats them as OR rather than AND. So "0 0 13 * 5" does not mean "Friday the 13th" — it means midnight on the 13th of every month, and also midnight every Friday.',
          'Expressing "Friday the 13th" in cron alone is not possible. The usual approach is to run daily and check the date inside the job. This is worth knowing before you rely on a schedule that quietly fires far more often than intended.',
        ],
      },
      {
        heading: 'Time zones, drift and the missing hour',
        body: [
          'Cron has no notion of a time zone; it fires on whatever clock the machine is set to. Most servers run on UTC, which is why a job scheduled for "9am" often runs at a time that surprises whoever wrote it. This tool shows the next runs in both your local time and UTC precisely so that mismatch is visible before deployment rather than after.',
          'Daylight saving is the sharper edge. On a machine running local time, the spring transition skips an hour entirely — a job scheduled inside it may not run at all that day — and the autumn transition repeats an hour, so a job may run twice. Anything where a duplicate run would be harmful should either be scheduled in UTC or made idempotent, so that running twice does the same thing as running once.',
          'Finally, cron guarantees when a job starts, not that it finished. If a job scheduled every five minutes takes seven, you will eventually have several copies running at once unless the job takes a lock.',
        ],
      },
    ],
    faq: [
      {
        q: 'What do the five fields in a cron expression mean?',
        a: 'From left to right they are minute, hour, day of month, month and day of week. An asterisk means every value, a slash sets a step (every N), a dash sets a range, and a comma lists specific values.',
      },
      {
        q: 'Does it support seconds?',
        a: 'It handles the common five-field format and also reads a six-field form where the leading field is seconds, describing whichever it is given and previewing the resulting run times.',
      },
      {
        q: 'Why are the next run times important?',
        a: 'Reading the description tells you the intent, but seeing the actual upcoming timestamps catches mistakes — like a schedule that fires far more or less often than you expected — before it reaches production.',
      },
      {
        q: 'Local time or UTC — which should I use?',
        a: 'Most servers run cron in UTC, so if your job runs on a server, preview in UTC. Use local time when you are reasoning about when the job lands in your own day.',
      },
    ],
    related: ['timestamp-converter', 'regex-tester', 'uuid-generator'],
  },

  'qr-generator': {
    slug: 'qr-generator',
    intro: [
      'Build a QR code that phones act on rather than just read. Pick what it should hold — a link, a Wi-Fi network, a contact card, an email, a text message, a phone number, a map location or a calendar event — fill in the fields, and the right payload is assembled for you.',
      'That distinction matters. A QR code only ever carries a string; what makes a phone offer to join a network or save a contact is writing that string in the exact format the camera recognises, including escaping the characters that would otherwise cut the payload short. Typing those formats by hand is where most hand-made codes go wrong.',
      'You control the size, the error-correction level and the foreground and background colours, then download the result as a crisp PNG or as a scalable SVG for print. The code is generated on your device, so whatever you encode — including a private network password — stays with you.',
    ],
    steps: [
      'Choose what the code should hold: a link, Wi-Fi, contact, email, SMS, phone, location or event.',
      'Fill in that type’s fields — the payload is built and the preview updates as you type.',
      'Set the size and pick an error-correction level (higher tolerates more damage but packs the code more densely).',
      'Adjust the foreground and background colours if you need to match a brand.',
      'Download the QR code as PNG for screens or SVG for print.',
    ],
    features: [
      'Nine payload types, including Wi-Fi credentials, vCard contacts and calendar events.',
      'Characters that would break a payload — semicolons in a network name, commas in a contact — are escaped correctly.',
      'Adjustable size, quiet-zone margin and colours.',
      'Four error-correction levels (L, M, Q, H).',
      'Exports to PNG or SVG; generated entirely in your browser.',
    ],
    faq: [
      {
        q: 'What does the error-correction level change?',
        a: 'Higher levels add redundant data so the code still scans even if part of it is dirty, damaged or covered by a logo. The trade-off is that the pattern becomes denser, so for a plain on-screen link a lower level is usually fine. A long payload such as a full contact card is already dense, so a lower level keeps it readable.',
      },
      {
        q: 'Should I download PNG or SVG?',
        a: 'Use PNG for screens, chat and documents where a fixed-size image is fine. Use SVG for anything printed or resized, because it is vector-based and stays sharp at any scale.',
      },
      {
        q: 'How do I make a QR code for Wi-Fi?',
        a: 'Choose Wi-Fi, enter the network name and password, and pick the security type — WPA for almost every modern network. Scanning the code offers to join the network without anyone typing the password. Tick "Hidden network" if the network does not broadcast its name, as phones need telling that explicitly.',
      },
      {
        q: 'Why does my network name with a semicolon still work?',
        a: 'The Wi-Fi format uses semicolons and colons as separators, so a network name or password containing one would truncate the payload and produce a code that fails or joins the wrong network. Those characters are escaped for you, which is a common failure of codes generated by hand.',
      },
      {
        q: 'Will a contact card QR code work on both iPhone and Android?',
        a: 'Yes. The contact type emits a vCard 3.0 payload, which is the version both platforms’ cameras handle most consistently — scanning it offers to create a new contact with the details you entered.',
      },
      {
        q: 'Is what I encode kept private?',
        a: 'Yes. The QR code is rendered locally in your browser, so the text, link or password you encode is never sent anywhere.',
      },
    ],
    related: ['base64-converter', 'color-converter', 'uuid-generator'],
  },

  'case-converter': {
    slug: 'case-converter',
    intro: [
      'Convert a word or phrase between every naming convention at once — camelCase, PascalCase, snake_case, CONSTANT_CASE, kebab-case, Title Case, sentence case, plain lower and upper case, and a URL-friendly slug. Instead of retyping an identifier in a different style, you paste it once and copy whichever form you need.',
      'The clever part is how it splits your input into words: it understands camelCase humps, runs of capitals in acronyms like HTTPServer, and separators such as spaces, hyphens and underscores. Because every case is just a different way of re-joining those words, the conversions stay correct even on awkward mixed input.',
    ],
    steps: [
      'Type or paste your text — a variable name, a title, or a phrase.',
      'See every case rendered at once.',
      'Click the copy button next to the form you want.',
    ],
    features: [
      'Ten conversions plus a URL slug, all shown simultaneously.',
      'Smart word splitting that handles camelCase, acronyms and mixed separators.',
      'One-click copy for each result.',
      'Runs in your browser with no sign-up.',
    ],
    sections: [
      {
        heading: 'The conventions, and where each one belongs',
        body: [
          'Naming conventions are not decoration; each exists because some language or system needed a way to join words where spaces were not allowed. camelCase and PascalCase came from case-sensitive languages that wanted names to read as prose. snake_case came from environments where case was unreliable — early filesystems, SQL identifiers, C libraries — so an underscore was the only dependable separator. kebab-case belongs where the text ends up in a URL or a CSS selector, where underscores are awkward to type and easy to lose beneath an underline.',
          'Which to use is usually decided for you by convention rather than taste. JavaScript and Java use camelCase for variables and PascalCase for types and classes. Python and Ruby use snake_case for functions and variables. CSS classes, HTML attributes and URL slugs use kebab-case. Environment variables and constants use CONSTANT_CASE, historically because shells treated uppercase as the convention for exported values. Going against the local convention is not an error, but it makes your code look foreign in its own repository.',
        ],
      },
      {
        heading: 'Why converting case is harder than it looks',
        body: [
          'The difficult part is not writing the words out again — it is working out where the words are. Splitting "parseHTMLDocument" correctly means recognising that a run of capitals is an acronym, and that the last capital in the run begins the next word, giving "parse", "HTML", "Document" rather than "parse", "H", "T", "M", "L", "Document". Handle that wrongly and every acronym in your codebase turns to gravel.',
          'Numbers are the other place tools quietly disagree. Is "utf8Decode" two words or three? Should "v2Api" become "v2-api" or "v-2-api"? There is no universal answer, only a consistent one, which is why converting the same input twice should always produce the same output.',
          'Slugs add a further step, because they have to survive being a URL. Accented characters are folded to their nearest ASCII equivalent, punctuation is dropped rather than percent-encoded, and runs of separators collapse to one — so "Crème Brûlée: a Recipe!" becomes "creme-brulee-a-recipe" rather than a string full of escapes.',
        ],
      },
    ],
    faq: [
      {
        q: 'What is the difference between camelCase and PascalCase?',
        a: 'Both join words with no separators and capitalise each word, but camelCase leaves the first word lowercase (myVariableName) while PascalCase capitalises it too (MyVariableName). camelCase is common for variables, PascalCase for types and classes.',
      },
      {
        q: 'How does it split HTTPServer correctly?',
        a: 'It recognises a run of capital letters as an acronym, so HTTPServer splits into "HTTP" and "Server" rather than one letter at a time. That means snake_case gives http_server, not h_t_t_p_server.',
      },
      {
        q: 'What is a slug?',
        a: 'A slug is a lowercase, hyphen-separated version of text that is safe to put in a URL — for example "My Blog Post!" becomes "my-blog-post". Punctuation is stripped and spaces become hyphens.',
      },
      {
        q: 'Is my text uploaded?',
        a: 'No. The conversion is pure string manipulation that runs entirely in your browser, so nothing you type is sent anywhere.',
      },
    ],
    related: ['regex-tester', 'json-to-types', 'code-formatter'],
  },

  'sql-formatter': {
    slug: 'sql-formatter',
    intro: [
      'Paste a cramped, one-line or inconsistently indented SQL query and get back a clean, aligned statement that is actually readable. Well-formatted SQL is far easier to review, debug and share, and this formatter understands the syntax of a dozen popular dialects so it lays out clauses, joins and sub-queries correctly rather than just re-wrapping text.',
      'You choose the dialect — Postgres, MySQL, SQL Server, SQLite, BigQuery and more — along with keyword casing, indent width and whether to use tabs. The query is reformatted as you type, entirely in your browser, so even confidential queries that reference internal schemas stay private.',
    ],
    steps: [
      'Paste your SQL statement.',
      'Select the dialect that matches your database.',
      'Choose keyword case (upper, lower or preserve) and the indentation you prefer.',
      'Copy the formatted query.',
    ],
    features: [
      'Eleven SQL dialects, so keywords and syntax are handled correctly.',
      'Configurable keyword case, indent width and tabs.',
      'Reformats live as you edit.',
      'Runs in your browser; queries are never uploaded.',
    ],
    sections: [
      {
        heading: 'Why SQL formatting is not just indentation',
        body: [
          'Most languages have a settled house style. SQL never did. It arrived before anyone agreed on conventions, it is written by application developers and analysts and DBAs who each learned it somewhere different, and it is often generated by ORMs that emit one enormous line. The result is that a codebase can contain the same query written five ways, and reviewing a change means reading past the formatting to find the logic.',
          'A formatter fixes that by throwing away how the query was typed and re-emitting it from its parsed structure. That is the important part: it parses first. It is not applying regular expressions to text, which is why it can put each column of a SELECT on its own line without being confused by a comma inside a string literal, or a keyword appearing inside an identifier.',
          'The practical payoff shows up in code review. Once every query in a repository is formatted the same way, a diff shows the clause that actually changed instead of a wall of re-wrapped lines, and a subtle edit — an AND that became an OR, a join condition that lost a predicate — stops hiding in the noise.',
        ],
      },
      {
        heading: 'Dialects are not cosmetic',
        body: [
          'Choosing the right dialect matters more than it looks. SQL is a family of languages that agree on the middle and disagree at the edges, and the disagreements are exactly where a formatter can go wrong. T-SQL uses square brackets for identifiers; MySQL uses backticks; PostgreSQL uses double quotes. PostgreSQL has dollar-quoted strings, where $$ opens a literal that runs until the matching $$ and may contain anything at all. A formatter that does not know it is reading PostgreSQL will treat the contents of that block as code and mangle it.',
          'The same applies to functions and operators that only exist in one dialect — PostgreSQL casts with ::, Oracle has CONNECT BY, BigQuery has array and struct syntax that looks like nothing else. Picking the dialect you actually use is the difference between a formatter that tidies your query and one that quietly breaks it.',
        ],
      },
      {
        heading: 'What a formatter will not tell you',
        body: [
          'Formatting is not validation, and this is worth being clear about. A query can be beautifully laid out and still be wrong: it can reference a table that does not exist, join on the wrong key, or return a Cartesian product because a condition was forgotten. The formatter only knows the shape of the language, not the shape of your database.',
          'It also will not make a slow query fast. Nothing here changes the execution plan, and re-indenting a query has no effect on how the database runs it. If a query is slow, formatting it is a good first step only because a readable query is far easier to reason about — the formatter makes the problem visible, not absent.',
        ],
      },
    ],
    faq: [
      {
        q: 'Which SQL dialects are supported?',
        a: 'A curated set of the most-used dialects including PostgreSQL, MySQL, MariaDB, SQL Server (T-SQL), SQLite, BigQuery and standard SQL. Picking the right one ensures dialect-specific keywords and syntax are formatted correctly.',
      },
      {
        q: 'Does formatting change what my query does?',
        a: 'No. Formatting only changes whitespace, line breaks and keyword capitalisation. The logic of the statement is untouched, so it returns exactly the same results.',
      },
      {
        q: 'Should keywords be uppercase?',
        a: 'It is a style choice. Uppercase keywords (SELECT, FROM, WHERE) are a long-standing convention that makes them stand out from table and column names, but you can also lowercase them or preserve whatever you typed.',
      },
      {
        q: 'Is my query kept private?',
        a: 'Yes. Formatting happens locally in your browser, so a query that references internal tables or data never leaves your machine.',
      },
    ],
    related: ['code-formatter', 'json-formatter', 'text-diff'],
  },

  'code-formatter': {
    slug: 'code-formatter',
    intro: [
      'A one-stop beautifier for the languages you deal with every day — HTML, CSS, SCSS, LESS, JavaScript, TypeScript, JSON, Markdown, YAML, GraphQL and XML. It is powered by Prettier, the widely used opinionated formatter, so the output matches what most modern projects already produce, with consistent indentation, wrapping and spacing.',
      'Pick the language, set your indent width and, for the JavaScript family, your semicolon and quote preferences, and the code is reformatted in place. The Prettier engine and each language plugin are only downloaded when you first format that language, and everything runs on your device — your code is never sent to a server.',
    ],
    steps: [
      'Paste your code.',
      'Select the language it is written in.',
      'Set the indent width, and for JS/TS choose semicolons and quote style.',
      'Copy the formatted result.',
    ],
    features: [
      'Eleven languages: HTML, CSS, SCSS, LESS, JavaScript, TypeScript, JSON, Markdown, YAML, GraphQL and XML.',
      'Powered by Prettier for output that matches common project setups.',
      'Options for indent width, tabs, semicolons and quote style.',
      'Plugins load on demand and formatting runs locally — nothing is uploaded.',
    ],
    sections: [
      {
        heading: 'What an opinionated formatter is for',
        body: [
          'Prettier, which powers this tool, is deliberately opinionated: it offers very few options and makes most decisions for you. That sounds like a limitation and is in fact the entire point. A formatter with a hundred settings simply relocates the argument — instead of debating where the brace goes, a team debates the config file.',
          'The mechanism is worth understanding, because it explains what the tool will and will not preserve. Prettier parses your code into a syntax tree, throws your formatting away entirely, and prints the tree back out according to its own rules, breaking lines to fit the print width. It is not adjusting your whitespace; it is regenerating the text from the structure. Your code\'s meaning is preserved exactly, its appearance is not preserved at all.',
          'That is also why formatting is safe in a way that find-and-replace is not. Because the input must parse before anything is printed, a formatter cannot silently corrupt a string literal or a comment — and if the code does not parse, you get a syntax error with a position rather than a mangled file.',
        ],
      },
      {
        heading: 'The one setting that matters, and the one that does not',
        body: [
          'Print width is the setting worth thinking about. It is not a hard maximum; it is the width Prettier tries to stay within when deciding whether an expression fits on one line or should be broken across several. Raising it produces longer lines and fewer breaks, lowering it produces more vertical code. Eighty is a common default inherited from terminals; many teams now prefer 100 or 120 on wide screens.',
          'Tabs versus spaces, by contrast, is the argument least worth having. Both work, neither is measurably better for correctness, and the only real consideration is that tabs let readers choose their own indent width, which matters to people using large text for accessibility. Pick one, apply it everywhere, and move on.',
        ],
      },
      {
        heading: 'Formatting is not linting',
        body: [
          'These get conflated constantly and they solve different problems. A formatter cares only about appearance: line breaks, indentation, quote style, trailing commas. A linter cares about substance: an unused variable, a missing await, a comparison that is always true, a dependency array that will cause a re-render loop.',
          'Running a formatter will not find a single bug. What it does is remove formatting from the set of things anyone has to think about or comment on in review, which leaves attention available for the things a linter and a human reviewer are actually good at.',
        ],
      },
    ],
    faq: [
      {
        q: 'Which languages can it format?',
        a: 'HTML, CSS, SCSS, LESS, JavaScript, TypeScript, JSON, Markdown, YAML, GraphQL and XML. Each uses the appropriate Prettier plugin, which is fetched only the first time you format that language.',
      },
      {
        q: 'Will it change my code, or just its layout?',
        a: 'It only reformats — indentation, line breaks, quotes and spacing. It does not rewrite logic, rename anything or change behaviour, so the formatted code is functionally identical.',
      },
      {
        q: 'Is this the same as running Prettier locally?',
        a: 'It uses the same Prettier engine, so the results line up closely with a local Prettier run using default options. It is handy when you want a quick tidy-up without setting up tooling.',
      },
      {
        q: 'Is my code private?',
        a: 'Yes. Formatting runs entirely in your browser. Your source is never uploaded, so proprietary code is safe to paste.',
      },
    ],
    related: ['sql-formatter', 'json-formatter', 'json-to-types'],
  },

  'uuid-generator': {
    slug: 'uuid-generator',
    intro: [
      'Generate universally unique identifiers on demand — random version 4 UUIDs, or time-ordered version 7 UUIDs, one at a time or in bulk. UUIDs are the standard way to label a record, a request or a file without a central authority handing out numbers, because the chance of two ever colliding is vanishingly small.',
      'The values come from your browser cryptographic randomness, so they are suitable for real use, not just placeholders. Version 7 is worth knowing about: it embeds a timestamp in the leading bits, so the identifiers sort in roughly the order they were created — which keeps database indexes far happier than the fully random version 4.',
    ],
    steps: [
      'Choose version 4 (fully random) or version 7 (time-ordered).',
      'Set how many you want to generate.',
      'Generate, then copy a single UUID or the whole batch.',
    ],
    features: [
      'Random v4 and time-ordered v7 UUIDs.',
      'Single or bulk generation.',
      'Backed by the browser cryptographic random source.',
      'Runs locally; no request is made to any server.',
    ],
    sections: [
      {
        heading: 'Why v4 is random and why that is enough',
        body: [
          'A version 4 UUID is 122 bits of randomness with six bits spent on version and variant markers. It contains no timestamp, no machine identifier and no counter — nothing that could collide by coincidence of two machines doing the same thing at the same moment, because nothing about the machine or the moment goes into it.',
          'People reasonably ask whether random values can collide. They can, in principle. The useful way to hold the number is this: you would need to generate roughly a billion UUIDs per second for about 85 years before reaching a 50% chance of a single duplicate. Every practical system will fail in a dozen other ways long before that becomes the problem.',
          'The one caveat that matters is the source of randomness. A v4 UUID is only as unpredictable as the generator behind it, which is why these are produced with the browser\'s crypto.getRandomValues rather than Math.random. Math.random is fast, deterministic in structure and predictable enough that values derived from it should never be treated as unguessable.',
        ],
      },
      {
        heading: 'What v7 fixes, and when to prefer it',
        body: [
          'Version 7 puts a millisecond timestamp in the leading bits and fills the rest with randomness. The result still looks like a UUID and is still effectively unique, but it sorts chronologically: sort v7 identifiers as text and you get them in creation order.',
          'That property solves a real and expensive database problem. A B-tree index keyed on random values scatters every insert across the whole index, so pages are constantly split and the working set that must stay in memory is the entire index. Keys that increase over time append to the same region instead, which keeps inserts cheap and the hot pages few. On a large, write-heavy table the difference is substantial rather than theoretical.',
          'The trade-off is that v7 leaks the creation time of the record. That is usually harmless and occasionally not — if identifiers are public and knowing when a row was created reveals something, v4 is the safer choice. As a rule: v7 for database primary keys, v4 for anything exposed where unpredictability matters.',
        ],
      },
      {
        heading: 'A UUID is not a secret',
        body: [
          'This is the mistake worth avoiding. A UUID is unique, which is not the same as unguessable in the sense security requires. A v4 UUID does have enough entropy to resist guessing, but UUIDs travel in URLs, appear in logs, get copied into support tickets and sit in browser history — so treating one as an access token means your access control is "whoever has seen this link".',
          'Version 1 UUIDs are worse still: they encode the timestamp and historically the network MAC address of the machine that created them, which makes them both predictable and identifying. If you need a secret, generate a secret; a UUID is a name, not a password.',
        ],
      },
    ],
    faq: [
      {
        q: 'What is the difference between UUID v4 and v7?',
        a: 'v4 is entirely random. v7 puts a millisecond timestamp in its leading bits followed by random data, so v7 values are still unique but sort in creation order, which is much better for database primary keys and indexes.',
      },
      {
        q: 'Are these UUIDs safe to use in production?',
        a: 'Yes. They are generated from the browser cryptographically secure random source, the same quality of randomness used for other security-sensitive values, so they are not merely for mock data.',
      },
      {
        q: 'Can two generated UUIDs ever be the same?',
        a: 'In practice, no. The space of possible values is so large that the probability of a collision is negligible even across enormous numbers of identifiers, which is the whole point of the format.',
      },
      {
        q: 'Why choose v7 for a database key?',
        a: 'Because its values increase over time, new rows are inserted near the end of the index rather than scattered randomly through it. That reduces index fragmentation and tends to improve write performance compared with v4.',
      },
    ],
    related: ['hash-generator', 'timestamp-converter', 'jwt-decoder'],
  },

  'password-generator': {
    slug: 'password-generator',
    intro: [
      'Generate a strong password or a memorable passphrase, and see honestly how strong it is. Password mode builds a random string from the character sets you choose — lower case, upper case, digits and symbols — at any length up to 128. Passphrase mode strings together random words from the Electronic Frontier Foundation 7,776-word list, producing something like correct-battery-house-staple that is far easier to type on a phone or read aloud down a phone line, while still being genuinely random.',
      'The important word in both cases is random. Passwords people invent themselves cluster in predictable ways: a capital at the front, a digit and an exclamation mark at the end, a name or a date in the middle. Cracking tools model those habits directly, which is why a password that looks complicated to a human can fall in seconds. Every value here is drawn from your browser cryptographic random source, with the byte-to-character conversion done by rejection sampling so that no character is even slightly more likely than another.',
      'Nothing you generate is transmitted or stored. The page makes no network request when you press Generate, so the secret exists only in your browser and on your clipboard until you paste it somewhere. That is also why there is no history: closing the tab is the only cleanup required.',
    ],
    steps: [
      'Pick Password for a random string, or Passphrase for random words.',
      'For a password, set the length and switch the character sets on or off; for a passphrase, set the number of words and the separator.',
      'Optionally turn on no look-alikes to drop I, l, 1, |, O and 0, which are easy to confuse when reading a password aloud or copying it by hand.',
      'Press Generate for a fresh value, or raise How many to produce a batch at once.',
      'Copy the result, and read the strength meter and crack-time estimates below it.',
    ],
    features: [
      'Random passwords from 4 to 128 characters, with per-set control and an option to guarantee one character from each set.',
      'EFF passphrases of 3 to 12 words, with a choice of separator, optional capitalisation and an optional digit.',
      'Entropy in bits, plus a strength score and estimated crack times from the zxcvbn analyser.',
      'Bulk generation of up to 50 values, with copy-all and download.',
      'Runs entirely in your browser; no password is uploaded, logged or stored.',
    ],
    faq: [
      {
        q: 'Are these passwords actually random?',
        a: 'Yes. They are drawn from your browser cryptographically secure random source, the same one used for encryption keys, rather than an ordinary random number function. Bytes are converted into characters using rejection sampling, which avoids the subtle bias that the simpler modulo approach introduces when the character pool does not divide evenly into 256.',
      },
      {
        q: 'Is my password sent to a server?',
        a: 'No. Generation, the strength check and the crack-time estimates all run locally in your browser, and the page makes no network request when you generate. Nothing is stored either, so there is no history to clear beyond closing the tab.',
      },
      {
        q: 'Which is better, a password or a passphrase?',
        a: 'Per character a random password is stronger, so it is the better choice for anything a password manager will remember for you. A passphrase is far easier to type accurately on a phone, a TV remote or a games console and easier to read aloud, and it can match a password for strength if you use enough words. Five EFF words is about 64 bits, six is about 78.',
      },
      {
        q: 'How long should my password be?',
        a: 'For a random password with mixed character sets, 16 characters is a sensible floor for important accounts and 20 or more is comfortably future-proof. Length helps far more than exotic symbols do: adding characters multiplies the search space, while swapping a for @ barely changes it because cracking tools try those substitutions automatically.',
      },
      {
        q: 'What does the strength meter measure?',
        a: 'Two different things. Entropy in bits is arithmetic: it describes how large the space of possible values the generator could have produced is. The score and crack times come from zxcvbn, which looks for dictionary words, names, dates, keyboard patterns, repeats and letter-for-symbol substitutions. For a value generated here the two agree; for a password a person invented, zxcvbn is the more honest of the two.',
      },
      {
        q: 'What is the EFF wordlist?',
        a: 'A list of 7,776 words published by the Electronic Frontier Foundation for building passphrases by rolling dice. The words were chosen to be common, easy to spell and hard to confuse with one another, and no word is a prefix of another. Because 7,776 is six to the fifth power, each word represents exactly five dice rolls, or about 12.9 bits of entropy.',
      },
      {
        q: 'Why do the same options sometimes give a different strength reading?',
        a: 'The entropy figure depends only on your settings, so it does not move. The zxcvbn score looks at the actual characters produced, and occasionally a random value happens to contain a real word or a keyboard run, which it rightly penalises. Generating again gives you a different value.',
      },
      {
        q: 'Should I reuse a generated password?',
        a: 'No. Reuse is the single most common way accounts are compromised, because a password exposed in one service breach is then tried everywhere else. Generate a separate password for every account and let a password manager remember them, which is also what makes long random strings practical.',
      },
    ],
    related: ['hash-generator', 'uuid-generator', 'jwt-decoder'],
  },

  'color-converter': {
    slug: 'color-converter',
    intro: [
      'Convert a colour between every format you are likely to need — HEX, RGB, HSL, and the perceptual spaces OKLCH and CIELAB — and see all of them update together as you change the input. The modern OKLCH and LAB spaces matter because they describe colour the way the eye perceives it, which is what makes them so useful for building palettes that look evenly spaced.',
      'From any starting colour it also builds a ten-step tint and shade ramp whose lightness is stepped in OKLCH, so the result reads as one coherent family rather than a naive lighten-and-darken. A set of harmonies — complementary, analogous and triadic — is generated by rotating the hue, and every swatch is clickable. A built-in WCAG contrast check tells you whether a pairing is readable enough to meet accessibility standards.',
    ],
    steps: [
      'Enter a colour in any supported format (for example #3b82f6, rgb(...), hsl(...), oklch(...) or lab(...)).',
      'Read the equivalent value in every other format.',
      'Explore the generated tint/shade ramp and the colour harmonies; click any swatch to load it.',
      'Check the WCAG contrast ratio to confirm a foreground and background pairing is accessible.',
    ],
    features: [
      'HEX, RGB, HSL, OKLCH and CIELAB, converted in every direction.',
      'A perceptual ten-step tint and shade ramp built in OKLCH.',
      'Complementary, analogous and triadic harmonies.',
      'WCAG contrast checking; everything runs in your browser.',
    ],
    sections: [
      {
        heading: 'Why HSL is easier to think in than HEX',
        body: [
          'HEX and RGB describe a colour by how much red, green and blue light to mix. That matches how a screen works and matches how people think about colour not at all — given #3A7BD5, almost nobody can say whether it is light or dark, or what a slightly lighter version would be.',
          'HSL rearranges the same information into hue, saturation and lightness. Hue is the position on the colour wheel in degrees, saturation is how vivid it is, lightness is how close to white or black. Now the questions become answerable: a lighter version is the same hue and saturation with higher lightness, and a colour scheme is a set of hues at consistent saturation and lightness. This is why design systems are usually authored in HSL even when they ship as HEX.',
        ],
      },
      {
        heading: 'What OKLCH fixes',
        body: [
          'HSL has a real flaw: its lightness does not match perceived brightness. Pure yellow and pure blue at the same HSL lightness look nothing alike — the yellow appears far brighter, because human vision is much more sensitive to green-yellow wavelengths. Build a palette by holding HSL lightness constant and the colours will not feel like they belong to one family.',
          'OKLCH is built on a model of human perception rather than on display hardware. Its lightness value corresponds to what the eye actually reports, so two colours with the same L genuinely look equally bright. That makes it possible to generate a set of accent colours that feel consistent, or to darken a colour for a hover state without it also appearing to change hue. It also reaches colours outside the sRGB range for modern wide-gamut displays, which HEX cannot express at all.',
        ],
      },
      {
        heading: 'Contrast is a requirement, not a preference',
        body: [
          'WCAG AA asks for a contrast ratio of at least 4.5:1 between text and its background, or 3:1 for large text — roughly 24px, or 19px bold. AAA raises that to 7:1. The ratio is computed from relative luminance, which weights the channels according to the eye\'s sensitivity, so it is not something you can judge reliably by looking, particularly on a bright screen.',
          'Two things are worth knowing. Light grey text on white is the most common accessibility failure on the web, and it is almost always introduced deliberately in the name of a softer look. And contrast requirements apply to interface components too — a form field border or a focus ring below 3:1 against its surroundings is a failure even if the text inside is fine.',
        ],
      },
    ],
    faq: [
      {
        q: 'Why use OKLCH or LAB instead of HSL?',
        a: 'HSL is easy but perceptually uneven — two colours with the same lightness value can look very different in brightness. OKLCH and LAB are built around how humans actually perceive colour, so equal steps look equal, which makes them far better for generating consistent palettes.',
      },
      {
        q: 'What is a WCAG contrast ratio?',
        a: 'It is a measure of how readable text is against its background. WCAG AA generally requires a ratio of at least 4.5:1 for normal text. The checker computes the ratio for your foreground and background so you know whether it passes.',
      },
      {
        q: 'How is the tint and shade ramp generated?',
        a: 'Rather than blending toward white and black in RGB, it sets each step lightness in OKLCH. That keeps the hue stable and the steps perceptually even, so the ramp looks like a single well-designed colour scale.',
      },
      {
        q: 'Is any of this sent to a server?',
        a: 'No. All the conversions, palette generation and contrast checks run locally in your browser.',
      },
    ],
    related: ['image-compressor', 'qr-generator', 'code-formatter'],
  },

  'base64-converter': {
    slug: 'base64-converter',
    intro: [
      'Base64 encodes binary data as plain ASCII text so it can travel safely through systems that only handle text — email, JSON payloads, data URIs and HTTP headers. This converter goes both ways: encode text or an entire file into Base64, or decode Base64 (including a full data URI) back into the original text, image or document, with a live preview of the result.',
      'Everything is processed on a background thread in your browser, which is what lets it handle large files and long strings without freezing, and means your data is never uploaded. It even sniffs the decoded content type, so a decoded image or PDF is previewed rather than left as a wall of bytes.',
    ],
    steps: [
      'Choose the Text tab to convert a string, or the Encode/Decode file tabs for a file.',
      'To encode, paste text or drop a file; optionally include the data-URI prefix.',
      'To decode, paste Base64 or a full data URI and render the preview.',
      'Copy the result, or download the decoded file with a sensible name.',
    ],
    features: [
      'Encode and decode both text and files, including data URIs.',
      'Live preview of decoded images, PDFs and text.',
      'Handles large inputs on a background thread so the page stays responsive.',
      'Runs entirely in your browser — nothing is uploaded.',
    ],
    sections: [
      {
        heading: 'What Base64 is for, and the 33% you pay for it',
        body: [
          'Base64 solves one problem: moving binary data through a channel that only reliably carries text. Email bodies, JSON string values, URLs, HTTP headers, XML documents and source files all expect readable characters, and many will mangle or reject arbitrary bytes. Base64 re-expresses any byte sequence using 64 characters that survive all of them.',
          'The mechanism explains the cost. Three bytes — 24 bits — are regrouped into four 6-bit chunks, and each chunk becomes one character. Four characters for every three bytes is a 33% increase in size, always, plus padding. That is the price of passing through a text-only pipe, and it is why Base64 is the right answer for a small icon inlined in a stylesheet and the wrong one for a 20 MB video.',
          'The `=` characters at the end are padding, present only to round the output to a multiple of four. One `=` means the final group held two bytes, two means it held one.',
        ],
      },
      {
        heading: 'Base64 is not encryption, and this matters',
        body: [
          'This is the single most consequential misunderstanding about the format, and it appears in real systems regularly. Base64 is an encoding, not a cipher. There is no key, nothing is secret, and reversing it requires no more than a decoder — this page will do it instantly. Anything you can Base64-encode, anyone else can read.',
          'The confusion is understandable, because encoded text looks scrambled. But scrambled-looking is not protection. Credentials placed in a config file "encoded for safety", or a JWT payload assumed to be private because it is Base64, are exposed to anyone who copies the string. A JWT\'s signature proves the token was not tampered with; it does nothing to hide the claims inside, which are readable by design.',
          'If the goal is confidentiality, you need encryption. Encoding and encrypting are answers to different questions: encoding asks "will this survive the journey", encryption asks "can anyone else read it".',
        ],
      },
      {
        heading: 'URL-safe Base64, and the padding question',
        body: [
          'Standard Base64 uses `+` and `/`, both of which have meaning in a URL — `+` may be read as a space in query strings and `/` as a path separator. The URL-safe variant substitutes `-` and `_`, and usually drops the padding, because `=` needs escaping too. This is the form used by JWTs and by most APIs that pass encoded values in a path or query.',
          'The variants are not interchangeable: feeding standard Base64 to a decoder expecting the URL-safe alphabet produces an error or garbage. If a token decodes everywhere except in one system, mismatched alphabets is the first thing to check.',
        ],
      },
    ],
    faq: [
      {
        q: 'What is Base64 actually for?',
        a: 'It represents binary data using only text characters, so binary content can be embedded in places that expect text — a JSON field, an email attachment, a CSS data URI or an HTTP header — without being corrupted along the way.',
      },
      {
        q: 'Does Base64 make my data smaller?',
        a: 'No, the opposite. Base64 grows the size by about a third, because it uses four text characters to represent every three bytes. It is about compatibility, not compression.',
      },
      {
        q: 'What is a data URI?',
        a: 'A data URI packs a file directly into a string, like data:image/png;base64,.... It lets you embed a small image or file inline instead of linking to a separate URL. This tool can add that prefix when encoding and strip it when decoding.',
      },
      {
        q: 'Is it safe for sensitive files?',
        a: 'Yes. Encoding and decoding run on your device, so the file or text is never sent to a server. Base64 is not encryption, though — it is trivially reversible, so it is not a way to hide data.',
      },
    ],
    related: ['hash-generator', 'jwt-decoder', 'image-compressor'],
  },

  'url-encoder': {
    slug: 'url-encoder',
    intro: [
      'A URL can only carry a limited set of characters, so anything else — a space, an ampersand, an accented letter, a slash inside a value — has to be written as a percent-escape like %20. This tool does that conversion both ways: encode text into the %XX form that is safe to drop into a link or query string, or decode a percent-encoded string back into the plain text it stands for.',
      'It also parses a complete URL into its parts — protocol, host, port, path, fragment and every query parameter — with the parameter values already decoded, so you can read at a glance what a long tracking link actually contains. Encoding uses UTF-8, matching exactly what a browser produces, and all of it runs on your device, so the URLs you paste are never uploaded.',
    ],
    steps: [
      'Choose Encode or Decode.',
      'Pick the scope: Component escapes everything for a single value, while Whole URL keeps the : / ? & = delimiters intact.',
      'Paste your text or URL into the input.',
      'Copy the result, or press Swap to feed it back in and convert the other way.',
      'If the input is a complete URL, read its parts and query parameters in the breakdown below.',
    ],
    features: [
      'Encode and decode at either component or whole-URL scope.',
      'A breakdown of any absolute URL, with query values already decoded.',
      'UTF-8 encoding that matches what browsers generate.',
      'Clear errors for malformed percent-encoding instead of silent mangling.',
      'Runs entirely in your browser — nothing is uploaded.',
    ],
    sections: [
      {
        heading: 'Encoding a whole URL versus encoding one value',
        body: [
          'This is the distinction the two modes exist for, and getting it wrong is the source of most URL bugs. Encoding a component escapes everything that has structural meaning — `/`, `?`, `&`, `=`, `:` and `#` all become percent sequences, because inside a single parameter value those characters are data, not syntax. Encoding a full URL leaves them alone, because there they are doing their job.',
          'Use component encoding on each value you place into a query string, and full-URL encoding only when you have a complete address containing spaces or non-ASCII characters that you need to make safe. Encoding a whole URL as a component gives you `https%3A%2F%2F…`, which is correct precisely when that URL is itself a parameter — a redirect target, for instance — and wrong everywhere else.',
        ],
      },
      {
        heading: 'The plus-sign problem',
        body: [
          'A space can be encoded two ways, and the two are not interchangeable. In a query string, the historical HTML form encoding writes a space as `+`. In a URL path, and under the modern percent-encoding rules, a space is `%20` and a `+` means a literal plus character.',
          'The consequence bites real systems: an email address like `user+tag@example.com` sent through a query string may arrive as `user tag@example.com`, because something decoded the plus as a space. Encoding the plus as `%2B` is what prevents it. If addresses with tags mysteriously fail to match, this is almost always why.',
        ],
      },
      {
        heading: 'Double encoding, and reading a URL that has been through the wringer',
        body: [
          'Because `%` is itself escaped as `%25`, encoding an already-encoded string produces `%2520` where `%20` was meant. Decode that once and you get `%20` rather than a space, which is the signature of double encoding — and it usually means two layers of code each helpfully encoded the same value.',
          'The rule that avoids it: encode exactly once, at the point where a value is placed into a URL, and never on a string that already came out of one. When debugging, decoding repeatedly until the output stops changing tells you how many layers were applied.',
        ],
      },
    ],
    faq: [
      {
        q: 'What is the difference between encoding a component and a whole URL?',
        a: 'Encoding a component (with encodeURIComponent) escapes every reserved character, including / ? : & =, because the text is a single value such as one query parameter. Encoding a whole URL (with encodeURI) leaves those delimiters alone so the address still works — it only escapes characters that are never allowed, like spaces.',
      },
      {
        q: 'Why did my accented characters turn into several % codes?',
        a: 'Percent-encoding works on bytes, and non-ASCII characters are stored as multiple UTF-8 bytes. The letter é, for example, is two bytes and becomes %C3%A9. This is the same output a browser produces, so it will decode correctly everywhere.',
      },
      {
        q: 'Why do I get an error when decoding?',
        a: 'Decoding fails when the input is not valid percent-encoding — usually a lone % that is not followed by two hex digits, or an incomplete sequence like %E0%A4%A. Fix or remove the stray % and it will decode.',
      },
      {
        q: 'Is a space encoded as %20 or +?',
        a: 'This tool uses %20, which is valid anywhere in a URL. The + shorthand for a space is only valid in the query string of form submissions (application/x-www-form-urlencoded); using %20 avoids that ambiguity.',
      },
      {
        q: 'Is percent-encoding a form of security?',
        a: 'No. It is a transport format, not encryption — it is fully reversible, as the decode direction shows. It keeps data intact as it travels through a URL; it does not hide or protect it.',
      },
    ],
    related: ['base64-converter', 'json-formatter', 'timestamp-converter'],
  },

  'word-viewer': {
    slug: 'word-viewer',
    intro: [
      'Open a Word document and actually read it — headings, tables, lists, images, headers and footers, laid out roughly as Word would lay them out — without Word, without an account, and without uploading the file anywhere. Drop a .docx in and it renders in the page, with the text available to copy out or save as plain text.',
      'The reason to do this in the browser rather than on a website that uploads is the same reason people are careful with these files: .docx is what contracts, invoices, CVs, medical letters and internal reports arrive as. Opening one should not mean giving a copy to a stranger.',
    ],
    steps: [
      'Drop a .docx file onto the page, or click to choose one.',
      'Read it in place — pages, tables and images are rendered as they appear in Word.',
      'Copy the text out, or download it as a plain .txt file.',
      'Use Print if you want a paper copy or a PDF, which prints the document alone rather than the page around it.',
    ],
    features: [
      'Renders .docx with its real layout: headings, tables, lists, images, headers and footers.',
      'Page, word and paragraph counts for the document.',
      'Copy the whole text, or download it as .txt.',
      'Print the document on its own, without the site around it.',
      'Runs entirely in your browser — the file is unzipped and rendered in the tab, never uploaded.',
    ],
    sections: [
      {
        heading: 'What a .docx file actually is',
        body: [
          'A .docx is a zip archive. Rename one to .zip, open it, and you will find a small filesystem inside: an XML document describing the text and its structure, separate XML parts for styles, numbering, headers, footers and footnotes, a relationships file tying them together, and a media folder holding the images verbatim.',
          'That design is why reading one in a browser is possible at all. The work is unzipping the archive, parsing the XML, resolving the style definitions — which cascade, much like CSS — and turning the result into HTML. No Microsoft software is involved, and nothing about the file needs to leave your machine.',
          'It also explains the difference between .docx and .doc. The older .doc is a binary format from a different era, undocumented for most of its life and genuinely difficult to parse. Browsers cannot read it and neither can this tool; converting it to .docx in Word or LibreOffice first is the only practical route.',
        ],
      },
      {
        heading: 'Why it will not look pixel-identical to Word',
        body: [
          'A viewer reproduces a Word document; it does not run Word. The gap shows up in a few predictable places, and knowing them saves confusion.',
          'Fonts are the biggest one. A .docx usually names its fonts rather than embedding them, so if the document was written in a typeface your device does not have, the browser substitutes something else — and different letter widths mean different line breaks, which can shift where pages divide. Complex floating layouts, text boxes anchored to particular positions, and drawings built from Office shapes are also approximated rather than reproduced exactly.',
          'Anything requiring Word to compute a value will not update either: field codes, automatic cross-references and page-number fields render as whatever value was last saved into the file. For reading a document, none of this matters much. For checking that a layout is exactly right before printing, open it in a word processor.',
        ],
      },
      {
        heading: 'Reading a document without handing it over',
        body: [
          'Word documents are unusually sensitive as a category. They are the default container for employment contracts, invoices, legal drafts, medical letters and CVs — and, unlike a photo, their whole content is text that is trivially searchable once someone else has a copy.',
          'This tool never transmits the file. It is read with the browser\'s own file API, unzipped in memory and rendered into the page, which you can verify by loading the page, disconnecting from the internet and opening a document anyway.',
          'One thing worth knowing about the documents themselves: .docx files carry metadata of their own — author, organisation, the time the file was created and last edited, and often revision history or tracked changes that were never accepted. A document forwarded outside your organisation may say more than its visible text does, and that is worth checking before sending rather than after.',
        ],
      },
    ],
    faq: [
      {
        q: 'Is my document uploaded anywhere?',
        a: 'No. The file is opened with the browser\'s file API, unzipped in memory and rendered in the page. Nothing is sent to a server, which you can confirm by disconnecting from the internet after the page loads and opening a document anyway.',
      },
      {
        q: 'Why will it not open my .doc file?',
        a: 'Because .doc is the older binary Word format, quite different from .docx, and browsers have no way to read it. Open it in Word, LibreOffice or Google Docs and save it as .docx, and it will work here.',
      },
      {
        q: 'Why does it look slightly different from Word?',
        a: 'Mostly fonts. Word documents name their fonts rather than embedding them, so if the typeface is not on your device the browser substitutes another, and the different letter widths change where lines and pages break. Floating shapes, text boxes and field codes such as automatic page references are also approximated rather than recalculated.',
      },
      {
        q: 'Can I edit the document here?',
        a: 'No — this is a viewer. It renders the document and lets you copy the text out, but it does not write .docx files. For editing you need a word processor; for pulling the content into something else, the copy and download-as-text options are usually what people actually want.',
      },
      {
        q: 'Does it handle tables, images, headers and footnotes?',
        a: 'Yes. Tables, lists, embedded images, headers, footers and footnotes all render. Tracked changes appear in their current state rather than as editable revision marks, and comments are not shown.',
      },
      {
        q: 'What about a password-protected document?',
        a: 'It cannot be opened. A protected .docx is encrypted, so there is nothing to unzip until it is decrypted with the password — remove the protection in Word first, then open the resulting file here.',
      },
    ],
    related: ['pdf-convert', 'pdf-viewer', 'word-counter'],
  },

  'xml-viewer': {
    slug: 'xml-viewer',
    intro: [
      'Paste or drop XML and read it properly: indented and syntax-highlighted, as a collapsible tree you can filter, or as the target of an XPath query. It tells you immediately whether the document is well-formed, and if it is not, exactly which line and column the parser gave up at — which is usually all you need to find a missing closing tag in a file of several thousand lines.',
      'XML is what configuration files, invoices, sitemaps, RSS feeds, SVG images and exported records tend to arrive as, so it is often something you were sent rather than something you wrote. That makes reading it — quickly, and without handing it to a stranger — the actual job. Everything here runs in your browser using its own XML engine.',
    ],
    steps: [
      'Paste XML into the editor, or drop an .xml file onto the page.',
      'Read the status line: it confirms the document is well-formed, or gives the line and column where parsing failed.',
      'Press Format to indent a minified or messy document.',
      'Explore the tree, filtering by tag, attribute or text — or switch to XPath and query it.',
      'Copy the result or download it as a file.',
    ],
    features: [
      'Well-formedness checking with the exact line and column of the first error.',
      'A tree view showing elements, attributes, comments and CDATA, with a live filter.',
      'XPath queries against the parsed document, with the matches listed.',
      'Formatting powered by Prettier, so minified XML becomes readable.',
      'A count of elements, distinct tag names, attributes and nesting depth.',
      'No upload and no third-party XML library — your browser already has both a parser and an XPath engine.',
    ],
    sections: [
      {
        heading: 'Well-formed and valid are two different things',
        body: [
          'These words get used interchangeably and mean quite different things. Well-formed means the document obeys XML\'s syntax rules: one root element, every tag closed, tags nested rather than overlapping, attributes quoted, and the handful of reserved characters escaped. Any XML parser can check this, and it is what this tool reports.',
          'Valid means something stronger — that the document also matches a schema, an XSD or DTD saying which elements may appear, in what order, how many times, and what types their values take. A document can be perfectly well-formed and completely wrong for its purpose: an invoice with the customer inside the line items rather than beside them breaks no syntax rule at all.',
          'The distinction matters when something rejects your file. "Not well-formed" is a typing mistake and the parser will point at it. "Invalid" means the structure is legal XML but not the shape the recipient expects, and no amount of staring at brackets will show it — you need the schema.',
        ],
      },
      {
        heading: 'The five characters that cause most XML errors',
        body: [
          'XML reserves a small set of characters, and almost every hand-authored breakage involves one of them. A bare `&` is the most common: XML reads it as the start of an entity, so a URL containing `?a=1&b=2` dropped into an element makes the document unparseable. It has to be written `&amp;`. The same applies to `<`, which must be `&lt;` in text — `>` is only strictly required in one edge case but is conventionally escaped as `&gt;` anyway. Inside attribute values, quotes need escaping too, as `&quot;` and `&apos;`.',
          'This is what CDATA sections are for. Wrapping content in `<![CDATA[ … ]]>` tells the parser to take everything inside literally, which is why they are used for embedded HTML, code samples and anything with a lot of ampersands. The one thing a CDATA section cannot contain is the sequence `]]>` itself.',
          'A second recurring problem is invisible: a byte-order mark or stray whitespace before the XML declaration. The declaration must be the very first thing in the file, so a single blank line above it makes an otherwise perfect document fail — and it looks fine on screen, which is why the reported line number can seem to point at nothing wrong.',
        ],
      },
      {
        heading: 'XPath, briefly',
        body: [
          'XPath is a small query language for selecting parts of a document, and a handful of patterns cover most real use. `/catalog/book` selects book elements that are direct children of the root catalog. `//title` selects every title anywhere in the document, at any depth. `//book[@id="bk101"]` filters by attribute, and `//price/@currency` selects the attributes themselves rather than the elements holding them.',
          'Predicates in square brackets do the filtering, and they can test position as well as content: `//book[1]` is the first book, `//book[last()]` the last, and `//book[price > 9]` those whose price element exceeds nine. Note that XPath positions count from one, not zero, which trips up almost everyone arriving from a programming language.',
          'One thing to watch: namespaces. If a document declares a default namespace — common in SVG, SOAP and Office formats — then a plain `//title` matches nothing, because the elements are not in the empty namespace your expression is implicitly asking for. That is not a bug in your query; it is the most common reason an XPath that "should obviously work" returns nothing.',
        ],
      },
    ],
    faq: [
      {
        q: 'Is my XML uploaded anywhere?',
        a: 'No. Parsing, validation, formatting and XPath all run in your browser — the document is never sent to a server. You can check this by loading the page, disconnecting from the internet, and using the tool anyway. That matters more than usual here, because XML files are so often invoices, exports and configuration containing real data.',
      },
      {
        q: 'What does "not well-formed" actually mean?',
        a: 'It means the file breaks XML\'s syntax rules, so no parser can read it. The usual causes are a tag that is never closed, tags that overlap instead of nesting, an unescaped & or < in text, a missing quote around an attribute value, or more than one root element. The tool reports the line and column where the parser stopped, which is where the problem was detected — occasionally a little after where it was introduced.',
      },
      {
        q: 'Why does my XPath expression return nothing?',
        a: 'The most common reason by far is namespaces. If the document declares a default namespace — as SVG, SOAP envelopes and Office files do — then an unprefixed expression like //title looks for a title in no namespace and finds nothing. Other causes are simpler: XPath is case-sensitive, and positions count from one rather than zero.',
      },
      {
        q: 'Can it validate against an XSD or DTD schema?',
        a: 'No. This checks that a document is well-formed, not that it conforms to a schema. Browsers do not ship an XSD validator, and adding one would mean a large library for a comparatively rare need. If you need schema validation, a dedicated XML editor or a command-line tool such as xmllint is the right choice.',
      },
      {
        q: 'Will it handle a large file?',
        a: 'Files up to 10 MB are accepted. Everything is held in memory and the whole tree is built at once, so a very large document will use a noticeable amount of it — and a document with hundreds of thousands of nodes will make the tree view slow to scroll, since every node becomes an element on the page.',
      },
      {
        q: 'Does it work with SVG, RSS or HTML?',
        a: 'SVG, RSS, Atom, XSD and XSL are all XML, so they parse and explore normally. HTML generally does not: browsers are deliberately forgiving about unclosed tags in HTML and strict about them in XML, so a typical HTML page is not well-formed XML. Use the HTML Preview tool for that instead. XHTML, which is HTML written to XML rules, does work here.',
      },
    ],
    related: ['code-formatter', 'json-formatter', 'html-preview'],
  },

  'image-converter': {
    slug: 'image-converter',
    intro: [
      'Convert images from one format to another — HEIC to JPEG, PNG to WebP, anything to AVIF — a whole batch at a time. The most common reason to need this is an iPhone: photos come off it as HEIC, which saves space on the phone but which plenty of websites, form uploads and older programs simply refuse to open. Converting them to JPEG makes them work everywhere again.',
      'What makes this different from most converters is where the work happens. Your photos are decoded and re-encoded by WebAssembly codecs running inside this browser tab, so no image is ever sent to a server. That matters more than it sounds: a photo is not just a picture, it is also a record of the camera that took it and, very often, the exact coordinates it was taken at. Uploading holiday pictures to an unknown converter hands all of that to a stranger.',
    ],
    steps: [
      'Drop your images in, or click to choose them — up to 30 at a time.',
      'Pick the format you want out: JPEG, PNG, WebP or AVIF.',
      'Adjust the quality if the format is a lossy one, and watch the new size update.',
      'Download the results one by one, or all together as a zip.',
    ],
    features: [
      'Reads HEIC and HEIF straight off an iPhone, plus JPEG, PNG, WebP, AVIF and GIF.',
      'Writes JPEG and WebP with the mozjpeg and libwebp encoders, which beat the browser at any given quality.',
      'Writes PNG losslessly, and AVIF wherever the browser supports it.',
      'Batch conversion with a single zip download.',
      'Runs entirely on your device — no upload, no account, no watermark.',
    ],
    faq: [
      {
        q: 'How do I convert HEIC photos from my iPhone to JPEG?',
        a: 'Drop the .heic files in and choose JPEG as the output format. The photos are decoded in your browser and converted straight away, then you can download them individually or as a zip. Nothing is uploaded, which is worth caring about given how much personal information a phone photo carries.',
      },
      {
        q: 'Which format should I choose?',
        a: 'JPEG if the image has to work everywhere — email attachments, older software, upload forms that reject anything unusual. WebP if it is going on a website, since it is roughly 30% smaller than JPEG at the same visual quality and every current browser reads it. PNG when you need transparency or a pixel-exact copy. AVIF gives the smallest files of all but is slower to make and not yet readable everywhere.',
      },
      {
        q: 'Does converting lose quality?',
        a: 'Converting to PNG does not — it is lossless, so every pixel survives exactly. JPEG, WebP and AVIF are lossy formats, so some detail is discarded to save space; the quality slider controls how much. Converting a JPEG to another lossy format re-compresses it, so going back and forth repeatedly will slowly degrade an image. Convert from the original whenever you can.',
      },
      {
        q: 'Why is AVIF sometimes missing from the list?',
        a: 'AVIF is only offered when your browser can actually create AVIF files, which is checked by encoding a test pixel when the page loads. Rather than show an option that would fail, the tool hides it. Chrome and Edge can generally write AVIF; some other browsers can display it but not produce it.',
      },
      {
        q: 'Is the metadata kept when I convert?',
        a: 'Where the target format can hold it, yes — converting is a format change, not a clean-up, so the Exif is carried across into JPEG output. If you want it gone, the EXIF Viewer tool shows you exactly what is in there and removes it without re-compressing the picture.',
      },
      {
        q: 'Are my images uploaded anywhere?',
        a: 'No. The decoding and encoding both run in your browser using WebAssembly, so the files never leave your device. You can confirm it by opening this page, disconnecting from the internet, and converting an image anyway — it still works.',
      },
    ],
    related: ['image-compressor', 'exif-viewer', 'image-pdf'],
  },

  'exif-viewer': {
    slug: 'exif-viewer',
    intro: [
      'Every photo carries more than the picture. Cameras and phones quietly write a block of metadata into the file — the make and model that took it, the lens, the exposure, the exact second the shutter opened and, if location services were on, the precise coordinates you were standing at. This tool reads all of it back out and shows it to you, grouped so it can actually be read rather than dumped as a wall of tag names.',
      'Then it removes it. The usual way to strip metadata is to open the photo and re-save it, which works but re-compresses the image and leaves it visibly worse than the original. This tool edits the file container instead — a JPEG loses its Exif segment, a PNG loses its text chunks — and copies the compressed image data across byte for byte. The clean copy you download is pixel-identical to the one you put in.',
    ],
    steps: [
      'Drop in a photo — JPEG, PNG, HEIC, WebP, AVIF or TIFF.',
      'Read the summary of what the file gives away, including any GPS coordinates.',
      'Scroll the grouped tables to see every field the file contains.',
      'Download a clean copy with the metadata removed, or copy the details out as text.',
    ],
    features: [
      'Shows every readable field, grouped into camera, exposure, location, dates and authoring.',
      'Flags the identifying parts explicitly: location, serial numbers, author names and timestamps.',
      'Converts GPS tags into real decimal coordinates, signed for the southern and western hemispheres.',
      'Strips JPEG and PNG metadata losslessly — no re-compression, no quality loss.',
      'Reads HEIC photos straight from an iPhone.',
      'Runs entirely on your device — the file, and the location inside it, are never uploaded.',
    ],
    faq: [
      {
        q: 'What is EXIF data?',
        a: 'EXIF (Exchangeable Image File Format) is a block of information a camera writes into a photo alongside the image itself. It typically records the camera make and model, the lens, the shutter speed, aperture and ISO, the orientation, the date and time to the second, and — if the device had location services enabled — the GPS coordinates where the photo was taken.',
      },
      {
        q: 'Does a photo really contain my location?',
        a: 'Often, yes. Phones embed GPS coordinates by default unless you have turned location off for the camera. The coordinates are precise enough to identify a specific building, so a photo taken at home and posted publicly can reveal where you live. This tool shows you the exact coordinates if they are present, so you can see for yourself before sharing.',
      },
      {
        q: 'Do social networks remove EXIF for me?',
        a: 'Most large platforms do strip metadata when they re-encode an upload, but you should not rely on it. It varies by platform and by how the file was sent — a photo attached to an email, uploaded to a file-sharing service, posted to a smaller site, or sent as a "document" rather than a photo in a chat app frequently keeps everything intact.',
      },
      {
        q: 'Will removing the metadata damage my photo?',
        a: 'No. The image data is copied across untouched — only the metadata sections of the file are dropped — so the clean copy is pixel-identical to the original. That is different from tools that re-save the image, which decompress and recompress it and leave visible artefacts.',
      },
      {
        q: 'Why can it not strip metadata from every format?',
        a: 'Lossless stripping means editing the file container directly, which this does for JPEG and PNG. WebP, AVIF and HEIC store metadata differently, and removing it there without re-encoding the image is not something the tool will fake. For those, convert the image to JPEG or PNG first, then strip it here.',
      },
      {
        q: 'Are the GPS coordinates sent to a map service?',
        a: 'No. The coordinates are shown on this page and can be copied to your clipboard, but they are never sent anywhere — deliberately, because embedding a map would mean handing the exact place your photo was taken to a third party, which is the opposite of what this tool is for.',
      },
    ],
    related: ['image-converter', 'image-compressor', 'pdf-viewer'],
  },

  'image-compressor': {
    slug: 'image-compressor',
    intro: [
      'Shrink JPEG, PNG and HEIC images by re-encoding them as efficient JPEG or modern WebP, and see the exact size you saved. Smaller images mean faster pages, quicker uploads and less storage — and for most photos and screenshots you can cut the file size dramatically with no visible loss of quality.',
      'Drop in a whole folder at once and every image is compressed with the same settings, then downloaded together as a single zip. You can compress by quality, or give a target file size and let the tool find the best quality that fits under it — useful when a form will only accept an image under a fixed limit.',
      'All of it runs on your own device using the mozjpeg and libwebp encoders compiled to WebAssembly — the same encoders Squoosh uses, which beat what a browser produces on its own. Nothing is uploaded, so a private photo stays private.',
    ],
    steps: [
      'Drop in one or more images — JPEG, PNG, WebP or HEIC from an iPhone.',
      'Pick the output format — JPEG or WebP.',
      'Choose how the size is decided: a quality setting, or a target size in kilobytes.',
      'Drag the comparison slider to check the result against the original.',
      'Download a single image, or the whole batch as a zip.',
    ],
    features: [
      'Compresses JPEG, PNG, WebP and HEIC to JPEG or WebP.',
      'Batch mode: many images at once, downloaded as one zip.',
      'Target-size mode finds the best quality that fits under a size you name.',
      'Before-and-after slider over the two images at full resolution.',
      'Shows the Exif metadata in the original — including any GPS location — and removes it unless you ask to keep it.',
      'Runs entirely in your browser; images are never uploaded.',
    ],
    faq: [
      {
        q: 'JPEG or WebP — which should I pick?',
        a: 'WebP usually produces a smaller file than JPEG at the same visual quality and is supported by all modern browsers, so it is the better choice for the web. Use JPEG when you need maximum compatibility with older software.',
      },
      {
        q: 'Will compression ruin the quality?',
        a: 'At sensible quality settings the difference is hard to see, while the file gets much smaller. Drag the comparison slider across the image to judge it for yourself, and back the quality off if you can spot artefacts.',
      },
      {
        q: 'Is my image uploaded?',
        a: 'No. The encoders run inside your browser as WebAssembly, so the image is read from your device, compressed in memory and handed straight back. Nothing is sent to a server at any point, which makes this safe for confidential or personal photographs.',
      },
      {
        q: 'How do I get an image under a specific file size?',
        a: 'Switch "Size by" to Target size and enter the limit in kilobytes. The tool repeatedly re-encodes the image, narrowing in on the highest quality that still fits under your limit. If even the lowest usable quality is too big it tells you, and resizing the image as well will usually get you there.',
      },
      {
        q: 'Does it remove the GPS location from my photos?',
        a: 'Yes, by default. Photographs from a phone often record the exact coordinates where they were taken, and compressing an image here drops all of that metadata unless you turn on "Keep Exif". You can expand the metadata panel first to see precisely what the original contains.',
      },
      {
        q: 'Can it open HEIC photos from my iPhone?',
        a: 'Yes. HEIC and HEIF files are decoded in your browser and can be converted to JPEG or WebP, which is the usual reason for wanting to — most software outside the Apple ecosystem cannot open HEIC at all.',
      },
      {
        q: 'Can it compress a transparent PNG?',
        a: 'A PNG with transparency is best kept as WebP, which supports an alpha channel. Converting it to JPEG would flatten the transparency onto a solid background, since JPEG has no transparency.',
      },
    ],
    related: ['pdf-compress', 'color-converter', 'base64-converter'],
  },

  'timestamp-converter': {
    slug: 'timestamp-converter',
    intro: [
      'Unix timestamps — the number of seconds since the start of 1970 — are everywhere in logs, databases and APIs, but no human reads them at a glance. This converter turns a timestamp into a readable date and time, and turns a date back into a timestamp, in both directions and in either local time or UTC.',
      'That makes it the tool you reach for when a log line shows 1700000000 and you need to know what actually happened when, or when you are constructing a query and need the timestamp for a specific date. It handles both seconds and milliseconds, which is the difference that trips people up most often.',
    ],
    steps: [
      'Enter a Unix timestamp to convert it to a date, or enter a date to get the timestamp.',
      'Choose whether to read and write the date in local time or UTC.',
      'Copy the converted value.',
    ],
    features: [
      'Converts Unix timestamps to dates and back again.',
      'Local time and UTC, in both directions.',
      'Handles both seconds and milliseconds.',
      'Runs in your browser with no sign-up.',
    ],
    sections: [
      {
        heading: 'What a Unix timestamp really counts',
        body: [
          'A Unix timestamp is the number of seconds since midnight UTC on 1 January 1970. Its appeal is that it is a single integer with no time zone, no locale and no formatting — two timestamps can be compared, subtracted and sorted arithmetically, which is why nearly every system stores time this way and formats it only at the edges.',
          'One detail is genuinely strange and worth knowing: Unix time pretends leap seconds do not exist. Every day is defined as exactly 86,400 seconds, so when a leap second is inserted the same timestamp value is used twice. This means the difference between two timestamps is not quite the number of seconds that physically elapsed. For essentially all software this is the right trade — it keeps the arithmetic simple — but it does mean Unix time is not a true count of elapsed seconds.',
        ],
      },
      {
        heading: 'Seconds or milliseconds, and how to tell',
        body: [
          'The most common bug in this area is a factor of a thousand. Unix time is defined in seconds, and most languages follow that — but JavaScript\'s Date.now(), and therefore a great deal of web code, works in milliseconds. Mixing the two puts a date in 1970 or somewhere in the year 56000.',
          'The quick way to tell them apart is length. A current timestamp in seconds is 10 digits; in milliseconds it is 13. If a date comes out as 1970-01-01 you almost certainly passed milliseconds to something expecting seconds; if it lands tens of thousands of years in the future, you did the reverse. This tool accepts both and tells you which it detected.',
        ],
      },
      {
        heading: 'The 2038 problem, and storing time properly',
        body: [
          'Systems that store Unix time in a signed 32-bit integer run out of room at 03:14:07 UTC on 19 January 2038, when the value overflows and wraps to a negative number — a date in 1901. This is not hypothetical: embedded devices, older file formats and legacy database columns still carry 32-bit time fields. Modern systems use 64-bit values, which push the limit far beyond any horizon worth worrying about.',
          'The related everyday mistake is storing local time instead of an instant. A timestamp is unambiguous; "2026-03-29 01:30" is not, because in some time zones that moment happened twice and in others it never happened at all. Store instants in UTC, keep the user\'s time zone as separate data if you need to display or schedule in it, and convert only when showing the value to a person.',
        ],
      },
    ],
    faq: [
      {
        q: 'What is a Unix timestamp?',
        a: 'It is the number of seconds that have elapsed since midnight UTC on 1 January 1970, a fixed reference point known as the epoch. Because it is a single number in a universal time zone, it is a convenient, unambiguous way for computers to record a moment.',
      },
      {
        q: 'Seconds or milliseconds — how do I tell?',
        a: 'A seconds timestamp for a recent date is about 10 digits; a milliseconds timestamp is about 13. JavaScript uses milliseconds while many databases and APIs use seconds, so mismatching them is a common source of dates that land in 1970 or the far future.',
      },
      {
        q: 'Why does the same timestamp show a different time for me?',
        a: 'A timestamp is a fixed instant, but it is displayed in a time zone. The same value shows as different clock times in local time versus UTC, or for people in different zones. Switch to UTC when you need a value everyone will read the same way.',
      },
      {
        q: 'Is my data uploaded?',
        a: 'No. The conversion is a local calculation in your browser; nothing is sent anywhere.',
      },
    ],
    related: ['cron-explainer', 'uuid-generator', 'json-formatter'],
  },

  'markdown-editor': {
    slug: 'markdown-editor',
    intro: [
      'Write Markdown on the left and watch it render live on the right. Markdown is the lightweight formatting syntax behind README files, GitHub issues, documentation and countless note apps — a few symbols for headings, lists, links, code and emphasis that stay readable even as plain text.',
      'The side-by-side preview means you never have to guess how your formatting will look: headings, tables, code blocks and links appear exactly as they will elsewhere. It is a fast, distraction-free place to draft a README or a comment, and everything you type stays in your browser.',
    ],
    steps: [
      'Type or paste Markdown in the editor pane.',
      'Watch the formatted result render live in the preview pane.',
      'Refine the source until the preview looks right.',
      'Copy the Markdown, or export the result.',
    ],
    features: [
      'Live, side-by-side preview as you type.',
      'Supports the common Markdown syntax you use for READMEs and issues.',
      'Distraction-free, no account needed.',
      'Runs in your browser; your writing is never uploaded.',
    ],
    sections: [
      {
        heading: 'Why Markdown won',
        body: [
          'Markdown was written in 2004 on a simple premise: a plain-text document should be readable as plain text. Every other lightweight markup language of the era asked you to learn syntax that looked like markup. Markdown borrowed what people were already doing in email — asterisks around emphasis, hyphens for bullets, a blank line between paragraphs — and made those the language.',
          'That decision is why it ended up everywhere. Your notes stay readable in a terminal, a diff, a chat window or a text editor from 1985. Because it is plain text it works with version control properly: a change to one sentence is a change to one line, reviewable in a pull request, unlike a binary word-processor file where the whole document is one opaque blob.',
          'The cost is that Markdown was never fully specified, so dialects diverged. Tables, footnotes, task lists and fenced code blocks are not in the original — they come from later extensions such as GitHub Flavored Markdown. This is why a document can render perfectly in one tool and imperfectly in another, and why it is worth knowing which flavour your destination speaks.',
        ],
      },
      {
        heading: 'The syntax that actually trips people up',
        body: [
          'Three things account for most Markdown confusion. The first is that a single newline does not start a new paragraph — Markdown joins consecutive lines into one, which is deliberate, so that you can hard-wrap your source without affecting output. A blank line is the paragraph separator; two trailing spaces force a line break within one.',
          'The second is indentation inside lists. Continuation text and nested content have to line up with the parent item\'s text, not its bullet, and getting this wrong is the usual reason a nested list flattens or a code block escapes its bullet.',
          'The third is that Markdown permits raw HTML, which is a strength and a trap. It means you can drop in a table or an anchor when the syntax cannot express what you need. It also means that a stray < in your prose may be read as the start of a tag, which is why comparisons and generics sometimes vanish from rendered output.',
        ],
      },
    ],
    faq: [
      {
        q: 'What is Markdown?',
        a: 'Markdown is a plain-text formatting syntax that converts to rich text. You write # for a heading, * for a bullet or emphasis, and [text](url) for a link, and it renders as formatted output. It is the standard for READMEs, issues and many note-taking apps.',
      },
      {
        q: 'Does the preview match GitHub?',
        a: 'It renders the common Markdown features the same way you would see them on most platforms — headings, lists, links, emphasis, code and tables. Some sites add their own extensions, so a niche feature may differ slightly.',
      },
      {
        q: 'Is my writing saved on a server?',
        a: 'No. The editor and preview run entirely in your browser, so your draft never leaves your device.',
      },
      {
        q: 'Can I use it to learn Markdown?',
        a: 'Yes. Because the preview updates instantly as you type, it is a good way to experiment and see exactly what each piece of syntax produces.',
      },
    ],
    related: ['code-formatter', 'text-diff', 'json-formatter'],
  },

  'html-preview': {
    slug: 'html-preview',
    intro: [
      'Write or paste HTML on the left and see it rendered live on the right. It is the quickest way to check what a snippet actually looks like — a marketing email, a chunk of markup copied from a page, a hand-written layout — without creating a file, opening an editor and refreshing a browser tab. The preview updates as you type, and it understands full documents and loose fragments alike, along with any inline CSS.',
      'The preview renders inside a sandboxed frame with its own separate origin, so the page you are previewing cannot reach this site, its cookies or its storage. JavaScript is switched off until you choose to turn it on, which keeps pasted markup from doing anything unexpected. Everything happens on your own device — the HTML is never uploaded.',
    ],
    steps: [
      'Type or paste your HTML into the editor pane, or load one of the examples.',
      'Watch it render live in the preview below — press Format to tidy the markup first.',
      'Switch the preview between phone, tablet and full width to check a responsive layout.',
      'Turn on "Run scripts" if your HTML includes JavaScript you want to run.',
      'Expand to full screen, then download the result as an .html file or copy a share link.',
    ],
    features: [
      'Live preview as you type, for whole documents or bare fragments.',
      'Phone, tablet and full-width preview, with a full-screen mode.',
      'A one-click Format button that beautifies the markup with Prettier.',
      'A light or dark backdrop, so transparent pages read either way.',
      'A console panel that captures the page\'s console output and uncaught errors.',
      'A sandboxed, separate-origin frame that cannot touch this page.',
      'Scripts are off by default and opt-in, never same-origin.',
      'Runs entirely in your browser — nothing is uploaded.',
    ],
    faq: [
      {
        q: 'Is my HTML uploaded anywhere?',
        a: 'No. The editor and the preview both run in your browser, so the markup you write or paste never leaves your device. That is also why a share link carries the HTML in the part of the URL after the # — the fragment, which browsers never send to a server.',
      },
      {
        q: 'Why does JavaScript in my HTML not run?',
        a: 'Scripts are off by default so pasted markup cannot do anything unexpected. Turn on the "Run scripts" toggle to let the page\'s own JavaScript run. Even then the preview stays a separate, sandboxed origin, so it cannot read this site\'s cookies or storage.',
      },
      {
        q: 'Can I see console output and errors from my script?',
        a: 'Yes. With "Run scripts" on, a console panel appears below the preview and captures everything the page logs — console.log, warnings, errors — along with any uncaught exception or rejected promise, so a snippet that fails silently tells you why. It works by forwarding the output from the sandboxed frame; the frame still cannot reach this page.',
      },
      {
        q: 'My layout looks wrong but nothing errors — why?',
        a: 'A browser silently recovers from malformed HTML — an unterminated tag, a stray bracket — and never reports it, which is why a broken layout can look like "nothing happened". The panel below the preview flags these structural problems with a line and column as you type, even with scripts off. Pressing Format runs the same check and reports the first issue it hits.',
      },
      {
        q: 'Can I preview a fragment, or does it need to be a full page?',
        a: 'Either works. You can paste a complete document starting with <!doctype html>, or just a loose fragment like a <div> with some inline styles — the browser renders both.',
      },
      {
        q: 'How accurate is the phone and tablet width preview?',
        a: 'The width buttons pin the preview frame to a phone (390px) or tablet (768px) width so your CSS media queries and responsive layout react exactly as they would on a device of that size. It is a real narrowing of the viewport, not a scaled-down picture, so what you see is what a browser at that width renders.',
      },
      {
        q: 'Do external stylesheets, images and fonts load?',
        a: 'Anything referenced by an absolute URL that allows it will load, just as it would in a normal page. Relative paths have nothing to resolve against in the preview, so use absolute URLs for external resources.',
      },
      {
        q: 'Is this an HTML validator?',
        a: 'No — it shows you how the browser renders your HTML, which is the most honest test of what a visitor would see, but it does not check the markup against the HTML specification or flag standards violations.',
      },
    ],
    related: ['code-formatter', 'markdown-editor', 'url-encoder'],
  },

  'pdf-convert': {
    slug: 'pdf-convert',
    intro: [
      'Turn a PDF into an editable document — Word, Excel, PowerPoint or rich text — so you can actually change the content instead of fighting a fixed-layout file. It is what you need when someone sends a PDF you have to update, or when you want to lift a table out of a report into a spreadsheet.',
      'Because faithfully reconstructing an editable document from a PDF is genuinely hard, this runs on a processing service rather than in the browser: your file is sent over HTTPS, converted, and returned, then deleted straight after. There is a monthly free allowance and no account is required.',
    ],
    steps: [
      'Choose the PDF you want to convert.',
      'Select the output format — Word, Excel, PowerPoint or rich text.',
      'Start the conversion and wait for it to process.',
      'Download the editable document.',
    ],
    features: [
      'Converts to Word, Excel, PowerPoint and rich-text formats.',
      'Preserves text and structure so the result is genuinely editable.',
      'A monthly free allowance, with no account needed.',
      'Files are processed over HTTPS and deleted after conversion.',
    ],
    sections: [
      {
        heading: 'Why converting a PDF back is genuinely hard',
        body: [
          'A PDF does not store a document in the sense a word processor does. It stores the finished appearance: this glyph at this coordinate, in this font, at this size. The paragraph that produced those glyphs is gone. There are no paragraphs in the file, no headings, often not even spaces — word gaps are frequently just horizontal position changes between characters.',
          'Converting back means reconstructing structure that was thrown away. The converter has to look at glyph positions and infer that this run of characters is a word, these words are a line, these lines are a paragraph, this larger bold line is a heading, and these aligned columns of text are a table rather than six unrelated paragraphs. It is inference, and inference is sometimes wrong.',
          'This is why results vary so much by document. A PDF exported cleanly from Word converts back almost perfectly, because the structure it is being asked to rebuild is exactly the structure that produced it. A magazine layout with text in irregular columns over images converts badly, because there is no clean reading order to recover.',
        ],
      },
      {
        heading: 'Why this one is not done in your browser',
        body: [
          'Nearly every other tool on this site runs entirely on your device, and this is one of three that does not. The honest reason is that faithful conversion needs a full office-document engine — LibreOffice, in this case — which is hundreds of megabytes of software and far outside what a browser tab can reasonably load.',
          'So this tool is explicit about the trade: your file is sent over HTTPS to a self-hosted service, converted, returned, and deleted straight afterwards. It is not passed to a third-party API. If a document is sensitive enough that this is unacceptable, the right answer is to convert it locally in LibreOffice yourself, and the tool would rather tell you that than pretend the upload is not happening.',
        ],
      },
      {
        heading: 'Getting a better result',
        body: [
          'Two things predict conversion quality more than anything else. First, whether the PDF has a real text layer: if you cannot select text in the PDF Viewer, the file is a scan, and conversion will produce a document containing a picture of your text rather than editable words. Run it through OCR first.',
          'Second, how the PDF was produced. Files exported from a word processor carry more recoverable structure than files produced by a design tool or a print driver. Where a choice exists, converting from the original source document beats converting from the PDF every time — this tool is for when the original is gone.',
        ],
      },
    ],
    faq: [
      {
        q: 'Which formats can I convert to?',
        a: 'A PDF can be converted to an editable Word document, an Excel spreadsheet, a PowerPoint presentation or rich text, depending on which best suits the content you need to work with.',
      },
      {
        q: 'Why is my file uploaded for this tool?',
        a: 'Reconstructing a fully editable document from a PDF is too heavy to do reliably in a browser, so the file is sent to a processing service. It is converted and returned to you, then deleted — it is not retained or read.',
      },
      {
        q: 'Will the formatting be preserved?',
        a: 'The conversion aims to keep text, tables and layout intact. Results are excellent for text-based PDFs; very complex or scan-based layouts can need some cleanup afterwards.',
      },
      {
        q: 'Do I need an account?',
        a: 'No. There is a monthly free allowance you can use without signing up.',
      },
    ],
    related: ['pdf-ocr', 'pdf-compress', 'pdf-viewer'],
  },

  'pdf-ocr': {
    slug: 'pdf-ocr',
    intro: [
      'A scanned PDF is really just images of pages — you can see the text but you cannot select, search or copy it. OCR (optical character recognition) fixes that by reading the words in the images and adding a real, invisible text layer, so the document becomes searchable and its text selectable, without changing how it looks.',
      'This is essential for making scanned contracts, receipts and old documents usable and findable. There are two ways to do it here, and the tool picks the sensible one for your document.',
      'Short English documents are recognised in your browser: the Tesseract engine is downloaded once, runs on your own machine, and the file is never uploaded at all. That is the option to want for a payslip, a medical letter or anything else you would rather not send anywhere. Longer documents and other languages go to our own hosted service, which has a machine to itself and is much faster — your file is sent over HTTPS, processed, returned and deleted.',
    ],
    steps: [
      'Choose the scanned PDF you want to make searchable.',
      'Pick the document language, and whether to run it in your browser or on the hosted service.',
      'Start the text recognition and wait while it processes.',
      'Download the new PDF, which now has a selectable, searchable text layer.',
    ],
    features: [
      'Adds a real text layer to scanned PDFs without altering their appearance.',
      'Makes the document searchable and its text selectable and copyable.',
      'In-browser recognition for short English documents — nothing leaves your device.',
      'A hosted service for longer documents and fifteen languages, with a monthly free allowance and no account.',
      'Files sent to the hosted service are processed over HTTPS and deleted afterward.',
    ],
    faq: [
      {
        q: 'What does OCR do to my PDF?',
        a: 'It recognises the text in the page images and adds an invisible, selectable text layer behind them. The page looks identical, but you can now search, select and copy the words, and other software can read them too.',
      },
      {
        q: 'When do I need this?',
        a: 'Whenever a PDF was created by scanning or photographing paper. Those pages are images with no underlying text, so search and copy do nothing until OCR has added a text layer.',
      },
      {
        q: 'Can I do this without uploading my file?',
        a: 'Yes, for English documents of up to twenty pages. Choose "In your browser" and recognition runs entirely on your own machine — the file is never sent anywhere. The engine is about a 7 MB download the first time, which your browser then keeps, and recognition takes a few seconds per page.',
      },
      {
        q: 'Why is the hosted service ever needed then?',
        a: 'Speed and coverage. It has a machine to itself, so a long document finishes far sooner, and it carries fifteen language packs where the in-browser engine ships only English. It also straightens rotated pages first, which matters for scans that came out of the feeder sideways — the in-browser path declines those and points you here instead.',
      },
      {
        q: 'How accurate is it?',
        a: 'Accuracy is very high on clean, clearly printed scans and lower on faint, skewed or handwritten pages. Better source quality gives a better text layer. Both paths use Tesseract, so their reading is comparable; the difference between them is speed and language coverage, not quality.',
      },
      {
        q: 'Does the document change?',
        a: 'No. The original pages are copied across untouched and the recognised words are added as text that draws nothing at all, so the file renders pixel for pixel as it did before. Nothing is re-compressed and no image is re-rendered.',
      },
    ],
    related: ['pdf-convert', 'pdf-viewer', 'pdf-compress'],
  },

  'pdf-compress': {
    slug: 'pdf-compress',
    intro: [
      'Large PDFs are usually large because of the images inside them. This tool shrinks a PDF by downsampling those images to a sensible resolution, cutting the file size while keeping the document perfectly usable — ideal when a file is too big to email or upload, or when you just want it to take less space.',
      'It reports the real, measured saving so you can see exactly what you gained. The image processing runs on a service: your PDF is sent over HTTPS, compressed and returned, then deleted straight afterward. A monthly free allowance covers casual use with no account.',
    ],
    steps: [
      'Choose the PDF you want to make smaller.',
      'Start the compression and let the images be downsampled.',
      'Compare the original and new sizes.',
      'Download the smaller PDF.',
    ],
    features: [
      'Reduces file size by downsampling embedded images.',
      'Shows the real before-and-after size difference.',
      'Keeps the document readable and intact.',
      'A monthly free allowance; files are deleted after processing.',
    ],
    sections: [
      {
        heading: 'Where the size in a PDF actually comes from',
        body: [
          'Before compressing anything it is worth knowing what is heavy. In almost every oversized PDF, the answer is images. Text is astonishingly cheap — a hundred pages of prose is a few hundred kilobytes, because the file stores characters and font outlines rather than pixels. A single photograph at full camera resolution can outweigh all of it.',
          'The usual culprit is a scanner or a phone app producing 300 or 600 dpi images of pages that will only ever be read on a screen at roughly 100 dpi, or a report where someone dropped in press-resolution photographs and let the layout tool shrink them on the page. The picture is displayed two inches wide and stored at 4000 pixels across.',
          'That is why compression here works by downsampling images rather than by squeezing the whole file. Reducing a 600 dpi scan to 150 dpi removes three quarters of the pixels and is invisible on screen, while the text layer is left completely alone — it stays sharp and selectable at any zoom, because it was never an image to begin with.',
        ],
      },
      {
        heading: 'Choosing a level, and when compression will not help',
        body: [
          'The presets map to how the document will be used. The lightest setting targets around 300 dpi and is for something that may still be printed. The middle setting targets roughly 150 dpi, which is the right default for a document meant to be read on screen or emailed. The strongest targets about 72 dpi, small enough for an upload limit, at the cost of visible softness if anyone zooms in.',
          'Compression cannot help every file, and it is better to know why in advance. A text-only PDF is already small and will barely shrink, because there are no images to downsample. A file that has already been compressed once will not shrink much again — the pixels are gone and cannot be removed twice. And a PDF that is large because it embeds full font families rather than subsets needs a different fix entirely.',
          'If a file refuses to get smaller, the honest answer is usually that its size is not where you think it is.',
        ],
      },
    ],
    faq: [
      {
        q: 'How does PDF compression work here?',
        a: 'Most of a heavy PDF is its embedded images. The tool downsamples those images to a reasonable resolution, which is where the big savings come from, while leaving the text and structure of the document alone.',
      },
      {
        q: 'Will the document still look fine?',
        a: 'For reading and sharing on screen, yes. The images are reduced to a resolution that still looks good at normal viewing sizes; if you need print-quality images, keep the original.',
      },
      {
        q: 'Why does this tool upload my file?',
        a: 'The image processing is done by a service, so the PDF is sent securely, compressed and returned, then deleted. It is not stored or read afterwards.',
      },
      {
        q: 'How much smaller will my PDF get?',
        a: 'It depends entirely on how image-heavy the original is. Scan-based or photo-rich PDFs can shrink a great deal; a text-only PDF is already small and will change little. The tool shows you the actual result.',
      },
    ],
    related: ['image-compressor', 'pdf-convert', 'pdf-split'],
  },

  'pdf-viewer': {
    slug: 'pdf-viewer',
    intro: [
      'Open and read a PDF right in your browser, with page thumbnails to jump around, in-document search to find a word, and zoom to get in close. It is a quick way to look at a PDF without downloading it into a separate app — and, crucially, the file is rendered entirely on your device and never uploaded.',
      'That privacy matters for anything sensitive: a contract, a statement, a private report. Because the rendering happens locally, you can inspect a confidential document with the confidence that it is not being sent anywhere.',
    ],
    steps: [
      'Choose or drop in the PDF you want to read.',
      'Use the thumbnails to jump to any page.',
      'Search within the document to find a word or phrase.',
      'Zoom in and out to read comfortably.',
    ],
    features: [
      'Page thumbnails for quick navigation.',
      'Full-text search within the document.',
      'Zoom for close reading.',
      'The file is rendered locally and never uploaded.',
    ],
    sections: [
      {
        heading: 'What a PDF viewer is actually doing',
        body: [
          'Opening a PDF is closer to running a program than to opening a photograph. The file describes a page as a sequence of drawing instructions — move here, set this font, show this text, fill this path — and a viewer executes them onto a canvas. That is why the same document looks identical everywhere, and also why a PDF can take a moment to appear: the page is being drawn, not decoded.',
          'This viewer is Mozilla\'s pdf.js, the same engine built into Firefox, running here in your browser. It brings its own toolbar, text selection, search, thumbnail sidebar, rotation and zoom, because it is the full viewer rather than a minimal render of the first page.',
          'One consequence worth knowing: because the page is drawn from instructions, text in a normal PDF is real text. You can select it, copy it and search it. If you cannot, the document is almost certainly a scan — a photograph of a page wrapped in a PDF container, with no text layer at all. That is what the OCR tool is for.',
        ],
      },
      {
        heading: 'Fonts, and why a document sometimes looks wrong elsewhere',
        body: [
          'A PDF can either embed the fonts it uses or merely name them and hope the reader has them. Embedding is what makes the format dependable, and most well-made PDFs embed a subset — only the characters actually used — which is why a document using one obscure typeface does not carry the entire font.',
          'When a PDF only names its fonts, the viewer substitutes something metrically similar, and that is when a document opens with subtly wrong spacing, overlapping text or the wrong characters entirely. If a file looks correct on the machine that made it and wrong everywhere else, unembedded fonts are the usual culprit, and the fix belongs in whatever produced the PDF rather than in the viewer.',
        ],
      },
      {
        heading: 'Reading a document without handing it over',
        body: [
          'The reason to read a PDF in a tool like this rather than an upload-based one is the same reason people are careful with these files in the first place: PDFs are what contracts, payslips, medical results, tax returns and identity documents arrive as. Opening one on a website that uploads it means giving a copy of it to a stranger.',
          'Here the bytes are handed to pdf.js inside the page through a blob URL that never leaves the browser. Nothing is transmitted, and the viewer keeps working with the network disconnected once the page has loaded.',
        ],
      },
    ],
    faq: [
      {
        q: 'Is my PDF uploaded to view it?',
        a: 'No. The viewer renders the file entirely in your browser, so a confidential document such as a contract or statement stays on your device and is never transmitted.',
      },
      {
        q: 'Can I search inside the PDF?',
        a: 'Yes, as long as the PDF has a real text layer. You can search for a word or phrase and jump to it. A scanned PDF with no text layer needs OCR first before its contents are searchable.',
      },
      {
        q: 'Do I need a plugin or app?',
        a: 'No. It runs in the browser with no plugin, download or account, so you can open a PDF and read it immediately.',
      },
      {
        q: 'What if my scanned PDF is not searchable?',
        a: 'Scanned pages are images with no underlying text, so search finds nothing. Run the PDF through the OCR tool first to add a searchable text layer, then view it here.',
      },
    ],
    related: ['pdf-ocr', 'pdf-merge', 'pdf-split'],
  },

  'pdf-organizer': {
    slug: 'pdf-organizer',
    intro: [
      'The PDF Organizer shows you every page of a document at once and lets you rearrange it by hand. Drag a page to move it, spin a sideways scan the right way up, throw out the blank sheet the scanner picked up, drop a second PDF in to combine them, and save the result as a single file.',
      'It is the tool to reach for when the problem is "this document is nearly right". Merging and splitting both assume you already know what you want — a file order, a page range. Organizing is for when you need to see the pages before you can say.',
      'Everything happens on your own device. The pages are rendered locally and the finished PDF is assembled in your browser, so a contract, a medical letter or a bank statement is never uploaded anywhere.',
    ],
    steps: [
      'Drop in a PDF — or several, if you want to combine them.',
      'Drag pages into the order you want, or use the arrows on each page.',
      'Rotate or delete individual pages, or tick several and act on them together.',
      'Add a blank page or reverse the whole order if you need to.',
      'Save the result as a single PDF.',
    ],
    features: [
      'Every page as a thumbnail, so you can see what you are rearranging.',
      'Drag to reorder, with arrow buttons that do the same thing from the keyboard.',
      'Rotate in 90° steps — stored as an instruction in the file, so no image quality is lost.',
      'Delete pages, insert blank ones, and reverse the whole document.',
      'Combine several PDFs and interleave their pages freely.',
      'Runs entirely in your browser; nothing is uploaded.',
    ],
    faq: [
      {
        q: 'How is this different from PDF Merge and PDF Split?',
        a: 'Merge joins whole files end to end, and Split pulls out page ranges you name in advance. The Organizer is visual: it shows every page so you can decide by looking, and it does both jobs at once — combine two documents, drop the pages you do not want and reorder what is left, in a single pass.',
      },
      {
        q: 'Does rotating a page reduce its quality?',
        a: 'No. The rotation is written into the PDF as a property of the page, exactly as a scanner would record it, rather than by re-drawing the image at an angle. The page data is copied across untouched, so text stays selectable and images stay as sharp as they were.',
      },
      {
        q: 'Can I reorder pages without a mouse?',
        a: 'Yes. Every page has arrow buttons that move it one position earlier or later, and they are reachable by keyboard in the normal tab order. Dragging is offered as well, but nothing depends on it.',
      },
      {
        q: 'Can I combine pages from two different PDFs?',
        a: 'Yes. Add as many files as you like and their pages all join the same grid, where you can interleave them in any order. Each page keeps a label showing which document it came from.',
      },
      {
        q: 'Is there a limit on document size?',
        a: 'One session holds up to 300 pages across up to 10 files, and each file can be up to 100 MB. The page limit is there because every page is rendered as a preview and held in memory — for pulling a range out of a much longer document, PDF Split is the better fit.',
      },
      {
        q: 'Are my documents uploaded?',
        a: 'No. The previews are rendered by your browser and the finished PDF is assembled there too. Nothing is sent to a server at any point, which is what makes this safe for documents you would not email.',
      },
    ],
    related: ['pdf-merge', 'pdf-split', 'pdf-compress'],
  },
  'pdf-merge': {
    slug: 'pdf-merge',
    intro: [
      'Combine several PDF files into a single document, in whatever order you choose. It is the everyday task of stitching things together — merging scanned pages into one file, bundling a cover letter with a CV, or assembling separate chapters into a finished report.',
      'The merge happens entirely in your browser, so your files never leave your device. You add the PDFs, arrange them into the order you want, and download the combined result, with nothing uploaded at any point.',
    ],
    steps: [
      'Add the PDF files you want to combine.',
      'Drag them into the order you want them to appear.',
      'Merge them into a single document.',
      'Download the combined PDF.',
    ],
    features: [
      'Combines any number of PDFs into one file.',
      'Reorder the files before merging.',
      'Runs entirely in your browser — nothing is uploaded.',
      'Free, with no account.',
    ],
    sections: [
      {
        heading: 'What merging actually does to your files',
        body: [
          'A PDF is not really one flowing document. It is a collection of page objects plus a catalogue that says what order they come in, and a pile of shared resources — fonts, embedded images, colour profiles — that the pages point at. Merging copies the page objects out of each source file, rewrites the internal references so they still point at the right resources, and builds one new catalogue listing everything in the order you chose.',
          'That matters because it means merging is not a re-rendering. Nothing is converted to an image, nothing is re-compressed, and no text is redrawn. A page that arrives as crisp vector text leaves as crisp vector text, selectable and searchable exactly as it was. This is the difference between a tool that merges PDFs and one that prints them to a new PDF: the second flattens everything and quietly destroys the text layer.',
          'It also explains the one surprise people hit: the merged file is usually a little smaller than the sum of its parts, because fonts and images shared between the sources get stored once instead of several times. Occasionally it is slightly larger, when the sources had nothing in common and each brought its own font subsets along.',
        ],
      },
      {
        heading: 'What survives the merge, and what does not',
        body: [
          'Page content, text, vector graphics, images, page sizes and rotation all carry across untouched. Pages of different dimensions stay at their own dimensions — merging an A4 report with a US Letter invoice gives you a document with both sizes in it, rather than stretching either to match.',
          'Some things do not survive, and it is better to know before you need them. Form fields, digital signatures, embedded attachments and document-level JavaScript are dropped. Signatures in particular cannot be preserved by definition: a signature attests to one specific file, so the moment its pages are combined with others the signature no longer describes what you are holding, and keeping it would be a lie about the document. Bookmarks and internal links pointing between pages may not survive either, since the page numbers they refer to have changed.',
          'If you need any of those preserved, merge first and then re-apply them to the finished document, rather than expecting them to come through.',
        ],
      },
      {
        heading: 'Why doing this in the browser matters',
        body: [
          'Merging is the operation people most often reach for with documents they should not be uploading: signed contracts, medical letters, bank statements, scans of passports and ID. The usual online merger takes all of that onto a server owned by someone you have never heard of, in a jurisdiction you did not choose, and asks you to trust a promise about deletion that you cannot verify.',
          'This tool never sends the files anywhere. The merge runs inside the browser tab using the pdf-lib library, which is why the whole thing still works if you disconnect from the internet after the page has loaded — a test worth trying once, because it settles the question far better than any privacy policy can.',
        ],
      },
    ],
    faq: [
      {
        q: 'Are my files uploaded to merge them?',
        a: 'No. Merging happens locally in your browser, so the documents you combine never leave your device. That makes it safe for private or sensitive files.',
      },
      {
        q: 'Can I control the page order?',
        a: 'Yes. You arrange the files into the order you want before merging, so the pages end up in exactly the sequence you intend.',
      },
      {
        q: 'Is there a limit on how many PDFs I can combine?',
        a: 'You can merge several files at once. Because it all runs in your browser, very large combined documents are limited only by your device memory.',
      },
      {
        q: 'Do I need to install anything?',
        a: 'No. It works in the browser with no software to install and no account to create.',
      },
    ],
    related: ['pdf-organizer', 'pdf-split', 'pdf-compress'],
  },

  'pdf-split': {
    slug: 'pdf-split',
    intro: [
      'Pull specific pages out of a PDF, or split one document into a separate file for every page. It is the counterpart to merging: when you only need a few pages from a long file, or you want to break a bundle back into individual documents, this does it cleanly.',
      'Like the other in-browser PDF tools, the whole operation runs on your device — the PDF is never uploaded. You choose the pages or the split, and download the result, keeping even confidential documents entirely private.',
    ],
    steps: [
      'Choose or drop in the PDF you want to split.',
      'Select the pages to extract, or choose to split into one file per page.',
      'Run the split.',
      'Download the extracted pages or the individual files.',
    ],
    features: [
      'Extract selected pages, or split into one file per page — delivered as a single zip.',
      'Runs entirely in your browser; the PDF is never uploaded.',
      'Keeps confidential documents private.',
      'Free, with no sign-up.',
    ],
    sections: [
      {
        heading: 'Splitting is extraction, not deletion',
        body: [
          'It helps to think of splitting as building a new document rather than cutting up the old one. The tool reads the pages you asked for, copies those page objects along with the fonts and images they depend on, and writes them into a fresh PDF. Your original file is never modified — it is still sitting there, complete, whatever you do here.',
          'That framing explains a question people often ask: why is a five-page extract from a 200-page report not exactly one fortieth of the size? Because each page drags its dependencies with it. Pull out five pages that all use the same embedded font and you carry one copy of that font into the new file. Pull out five pages that each contain a full-page scan and you carry five large images. Size follows what is on the pages, not how many there are.',
        ],
      },
      {
        heading: 'Choosing pages without getting the ranges wrong',
        body: [
          'Page ranges are one-based and inclusive, which is to say they work the way people count rather than the way arrays do. "1-5" gives you five pages including both the first and the fifth. "3" on its own gives you a single page. Combining them with commas — "1-3, 7, 12-14" — builds one document from several stretches, in the order you wrote them.',
          'The order genuinely is the order you wrote. Asking for "5, 1, 3" gives you a three-page document beginning with page five, which is occasionally exactly what you want and occasionally a surprise. If you meant to reorder a whole document rather than extract from it, the PDF Organizer is the better tool: it shows you every page as a thumbnail and lets you drag them.',
          'Splitting into one file per page is the other common need — usually because a scanner produced a single PDF containing twenty unrelated receipts, or because a system on the other end will only accept one document at a time. Every page comes back as its own numbered file in a zip.',
        ],
      },
      {
        heading: 'A note on what splitting cannot do',
        body: [
          'Extracting pages does not remove information from the pages you keep. If page four contains a name you wanted gone, splitting it out of the document does not redact it — the name is still on page four, now in a smaller file. Genuine redaction means removing the underlying content, not covering it, and a black rectangle drawn over text in most editors leaves the text sitting underneath it, selectable and copyable.',
          'Likewise, splitting does not decrypt. A password-protected PDF has to be unlocked before any tool can read its pages, this one included.',
        ],
      },
    ],
    faq: [
      {
        q: 'Can I extract just a few pages?',
        a: 'Yes. Select the specific pages you want and the tool produces a new PDF containing only those, leaving the original untouched.',
      },
      {
        q: 'Can I split a PDF into single pages?',
        a: 'Yes. Choose the split-into-one-file-per-page option and each page becomes its own separate PDF, which is handy when a scanner has bundled many documents into one file. They arrive together in a single zip, so a hundred-page document is still one download rather than a hundred.',
      },
      {
        q: 'Is my PDF uploaded?',
        a: 'No. Splitting runs locally in your browser, so the document stays on your device — safe for private and sensitive files.',
      },
      {
        q: 'Does splitting change the original file?',
        a: 'No. It creates new files for the pages you extract; your original PDF is left exactly as it was.',
      },
    ],
    related: ['pdf-organizer', 'pdf-merge', 'pdf-viewer'],
  },

  'image-pdf': {
    slug: 'image-pdf',
    intro: [
      'This tool converts in both directions between images and PDF. Drop in a set of JPG, PNG or WebP images and it combines them into a single PDF — one image per page, in the order you arrange them — which is exactly what you need to turn photographed receipts, scanned pages or screenshots into one document you can email or file. Or drop in a PDF and it turns every page back into a PNG or JPG image, ready to embed in a slide, a document or a web page.',
      'Both directions run entirely on your device. The images and PDFs you pick are never uploaded to a server, so it is safe to use on receipts, contracts, ID scans and anything else you would rather not send anywhere. There is no watermark, no sign-up and no file-count paywall.',
    ],
    steps: [
      'Choose a direction: “Images to PDF” or “PDF to images”.',
      'For images to PDF, drop in your JPG, PNG or WebP files and drag them into the order you want.',
      'Pick the page size (fit-to-image, A4 or Letter), orientation and margin, then save the PDF.',
      'For PDF to images, drop in a PDF and choose PNG or JPG and a resolution.',
      'Convert — a single page downloads on its own, and several pages arrive together as one zip.',
    ],
    features: [
      'JPG and PNG are embedded into the PDF without re-encoding, so no quality is lost; WebP, GIF, BMP and AVIF are converted to lossless PNG inside the document.',
      'Reorder images by dragging, or with the arrow buttons on each card for keyboard access.',
      'Fit-to-image sizing keeps each page exactly the shape of its photo, with no white borders.',
      'Rasterise a PDF at 96, 150 or 300 DPI — screen resolution through to print quality.',
      'Everything runs in your browser; your files never leave your device.',
    ],
    faq: [
      {
        q: 'How do I convert JPG images to a PDF?',
        a: 'Open the tool on “Images to PDF”, drop in your JPG files, drag them into the order you want, then choose a page size and save. Each image becomes one page of a single PDF, and nothing is uploaded — the whole conversion happens in your browser.',
      },
      {
        q: 'How do I convert a PDF to JPG or PNG images?',
        a: 'Switch to “PDF to images”, drop in your PDF, and choose PNG (sharpest, lossless) or JPG (smaller files) along with a resolution. Each page is rendered to an image; a one-page PDF downloads a single image, and a multi-page PDF gives you one zip containing them all.',
      },
      {
        q: 'Are my images and PDFs uploaded anywhere?',
        a: 'No. Both directions run locally in your browser using your device’s own graphics and PDF engine. Nothing is sent to a server, which is why it is safe for receipts, contracts, ID scans and other private documents.',
      },
      {
        q: 'Does combining images into a PDF reduce their quality?',
        a: 'JPG and PNG images are embedded byte-for-byte, so they keep exactly the quality of the original file. Other formats (WebP, GIF, BMP, AVIF) are converted to a lossless PNG inside the PDF, which also preserves any transparency.',
      },
      {
        q: 'What resolution should I choose when converting a PDF to images?',
        a: '96 DPI is fine for on-screen use and gives the smallest files. 150 DPI is a good general-purpose middle ground. 300 DPI matches print quality and produces the largest, crispest images — choose it when you intend to print or zoom in.',
      },
      {
        q: 'Can I control the page size and margins for images-to-PDF?',
        a: 'Yes. “Fit to image” makes each page exactly the shape of its image with no borders. A4 and Letter place the image on a standard page, centred, and let you pick portrait, landscape or automatic orientation plus a small or large margin.',
      },
      {
        q: 'Is there a limit on how many files I can convert?',
        a: 'You can combine up to 50 images into one PDF, and rasterise up to 200 pages of a PDF at a time. Because everything is processed in memory on your device, these limits keep a very large job from exhausting the browser’s memory.',
      },
      {
        q: 'Can I reorder the images before saving the PDF?',
        a: 'Yes. Drag any image to a new position, or use the left and right arrows on each card, which do the same thing from the keyboard. The pages of the finished PDF follow the order shown.',
      },
    ],
    related: ['pdf-organizer', 'image-compressor', 'pdf-merge'],
  },
  'word-counter': {
    slug: 'word-counter',
    intro: [
      'The Word & Character Counter tells you how long a piece of writing is, and it updates as you type. It counts words, characters with and without spaces, sentences, paragraphs and lines, and turns the word count into an estimated reading time and speaking time — the two numbers you actually need when a piece has to fit a word limit, a meta description, or a five-minute slot.',
      'It also shows which words you lean on most. The density table ranks the words that appear most often and shows each one as a share of the total, which is useful for spotting unintentional repetition in an essay and for checking that a page about a topic actually mentions that topic. Everything runs on your own device, so drafts, cover letters, student work and unpublished writing are never uploaded anywhere.',
    ],
    steps: [
      'Type or paste your text into the box — the counts update immediately.',
      'Read the summary for words, characters, sentences, paragraphs, lines, reading time and speaking time.',
      'Scroll to “Most used words” to see which words you repeat, and how often.',
      'Turn off “Hide common words” if you want words like “the” and “and” included in that table.',
      'Use Copy summary to put the whole set of counts on your clipboard.',
    ],
    features: [
      'Live counts for words, characters, characters without spaces, sentences, paragraphs and lines.',
      'Reading time at 238 words per minute and speaking time at 140, so you can size a page or a talk.',
      'Keyword density with a common-word filter, ranked and shown as a percentage.',
      'Correct counting for Chinese, Japanese and Thai, which are written without spaces between words.',
      'Runs entirely in your browser — nothing you paste is uploaded.',
    ],
    faq: [
      {
        q: 'Is my text uploaded anywhere?',
        a: 'No. Every count is calculated locally in your browser as you type. Nothing you paste is sent to a server, which is why it is safe to use on unpublished drafts, coursework and confidential documents.',
      },
      {
        q: 'How is reading time calculated?',
        a: 'Reading time is the word count divided by 238 words per minute, a widely cited average for silent reading of ordinary prose. Speaking time uses 140 words per minute, which is a comfortable pace for reading aloud. Both are estimates — dense or technical writing is read more slowly.',
      },
      {
        q: 'Does the character count include spaces?',
        a: 'Both numbers are shown. The headline figure includes spaces, punctuation and line breaks; underneath it you get the count without any whitespace. Social posts and meta descriptions are normally measured with spaces included.',
      },
      {
        q: 'How are words counted in Chinese or Japanese?',
        a: 'Correctly, which most counters do not manage. Those scripts do not put spaces between words, so a tool that splits on spaces reports a whole article as one word. This one uses your browser’s Unicode segmentation to find real word boundaries in the text’s own script.',
      },
      {
        q: 'What counts as a sentence?',
        a: 'Sentence boundaries come from your browser’s Unicode segmentation rather than a simple full-stop count, so common abbreviations and decimal numbers do not each end a sentence. It is still an estimate: unusual punctuation can shift the number by one or two.',
      },
      {
        q: 'What is keyword density and what should it be?',
        a: 'It is how often a word appears as a share of all the words counted. There is no target worth chasing: search engines have not rewarded a particular density for many years. It is most useful for catching a word you have accidentally used ten times in three paragraphs.',
      },
      {
        q: 'Why are “the” and “and” missing from the most-used words?',
        a: 'They are filtered out by default, because otherwise they would take every top slot in every text. Turn off “Hide common words” to include them.',
      },
      {
        q: 'How does it count emoji and accented letters?',
        a: 'An emoji or an accented letter counts as one character rather than the two units it may occupy internally, which matches what you see on screen.',
      },
    ],
    related: ['case-converter', 'markdown-editor', 'text-diff'],
  },
};
