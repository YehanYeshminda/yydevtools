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
