import type { Guide } from './guide.model';

/**
 * The catalogue of guides, in the order they appear on the index. See
 * {@link Guide} for the shape and the rules. Every entry is original prose
 * written for this site; keep it that way.
 */
export const GUIDES: Guide[] = [
  {
    slug: 'jwt-explained',
    title: 'JSON Web Tokens explained: how a JWT works, and how to keep one safe',
    description:
      'What a JWT actually is, how its header, payload and signature fit together, why decoding is not verifying, and the mistakes that let attackers forge tokens.',
    category: 'Security',
    readingMinutes: 9,
    updated: '2026-08-10',
    published: '2026-08-10',
    intro: [
      'A JSON Web Token — JWT, usually said “jot” — is the string of gibberish your app hands back after you log in, and sends up with every request after that. It looks opaque, but there is nothing secret about most of it: a JWT is just JSON that has been packed into a compact, URL-safe form and stamped with a signature. Once you can read that shape, a whole class of authentication bugs stops being mysterious.',
      'This guide walks through what is really inside a token, what the signature does and does not prove, and the handful of mistakes that turn JWTs from a convenience into a vulnerability.',
    ],
    blocks: [
      { kind: 'h2', text: 'The three parts of a token' },
      {
        kind: 'p',
        text: 'A JWT is three chunks separated by dots: header.payload.signature. The first two are Base64URL-encoded JSON — a variant of Base64 that swaps the characters that would be unsafe in a URL. Decode them and you get plain, readable JSON. The third chunk is the signature, which is binary data, also Base64URL-encoded.',
      },
      {
        kind: 'code',
        caption: 'A token, split at its dots',
        code: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9   ← header\n.eyJzdWIiOiIxMjMiLCJuYW1lIjoiQWRhIiwiZXhwIjoxNzUxMzAwMDAwfQ   ← payload\n.3Fg8...redacted...9kQ   ← signature',
      },
      {
        kind: 'p',
        text: 'The header describes the token itself. Its most important field is alg, the algorithm used to sign it — for example HS256 (an HMAC with SHA-256) or RS256 (an RSA signature). The payload holds the claims: statements about the user and the token. Some claim names are standardised — sub (subject, i.e. who the token is about), iss (issuer), aud (audience), iat (issued-at) and exp (expiry) — and you can add your own, like a role or a tenant id.',
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'The time claims iat and exp are Unix timestamps — seconds since the start of 1970 — not human dates. A decoder converts them for you, which is the quickest way to see whether a token has already expired.',
      },
      { kind: 'tool', lead: 'Paste a real token and see its claims:', slug: 'jwt-decoder' },
      { kind: 'h2', text: 'Decoding is not verifying' },
      {
        kind: 'p',
        text: 'Here is the single most important thing to understand about JWTs: anyone can read the payload. It is only Base64, not encryption. If you put a secret in a token’s claims, you have effectively published it to everyone who holds the token. The payload is visible to the browser it lives in, to any proxy it passes through, and to anyone who copies it out of a log.',
      },
      {
        kind: 'p',
        text: 'What stops someone from simply editing the payload — bumping their role from “user” to “admin” — is the signature. The signature is computed over the header and payload together using a key. Change a single character in either, and the signature no longer matches. A correct server recomputes the signature on every request and rejects the token if it does not line up. So decoding a token tells you what it claims; verifying its signature tells you whether to believe the claim.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'Never make a trust decision from a decoded payload alone. “The token says this user is an admin” means nothing until the signature has been verified against the key you control.',
      },
      { kind: 'h2', text: 'Symmetric vs asymmetric signing' },
      {
        kind: 'p',
        text: 'There are two families of signing algorithm, and the difference decides who can create a valid token.',
      },
      {
        kind: 'ul',
        items: [
          'HMAC (HS256/384/512) is symmetric: the same secret both signs and verifies. It is simple and fast, but everyone who can verify a token can also mint one. That is fine when a single service issues and checks its own tokens.',
          'RSA and ECDSA (RS/PS/ES256/384/512) are asymmetric: a private key signs, and a separate public key verifies. Only the holder of the private key can create tokens, while anyone with the public key can check them. This is what you want when one service issues tokens and many others need to trust them without being able to forge them.',
        ],
      },
      {
        kind: 'p',
        text: 'The practical upshot: if you are verifying tokens issued by an identity provider, you use their public key, and you never need — and should never hold — their private one.',
      },
      { kind: 'h2', text: 'The classic JWT attacks' },
      {
        kind: 'h3',
        text: 'The alg: none downgrade',
      },
      {
        kind: 'p',
        text: 'The JWT spec allows an algorithm literally called “none”, which produces a token with an empty signature. It exists for cases where the transport is already trusted, but it is a trap: a library that honours the alg field blindly will accept an unsigned token as valid. An attacker takes a real token, sets the header’s alg to “none”, edits the payload freely, drops the signature, and a naive verifier waves it through. Any correct verifier rejects “none” unless it has been explicitly, deliberately allowed.',
      },
      {
        kind: 'h3',
        text: 'The RS256-to-HS256 key confusion',
      },
      {
        kind: 'p',
        text: 'A subtler version: the server expects RS256 and verifies with an RSA public key, which is not secret. An attacker changes the header to HS256 and signs the token using that public key as if it were an HMAC secret. If the verifier picks the algorithm from the token’s own header instead of pinning it, it will happily verify the HMAC using the public key it already has — and the attacker has forged a valid token from public information. The fix is to pin the expected algorithm on the verifying side and refuse anything else.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'The lesson behind both attacks is the same: never let the token tell the server how to verify it. The server decides the algorithm and the key; the token only supplies data.',
      },
      {
        kind: 'p',
        text: 'You can reproduce both scenarios safely against your own service. The editor below re-signs an edited token — or emits an alg:none one — entirely in your browser, so you can confirm your backend rejects what it should.',
      },
      { kind: 'tool', lead: 'Edit and re-sign a token to test a verifier:', slug: 'jwt-editor' },
      { kind: 'h2', text: 'Practical rules of thumb' },
      {
        kind: 'ol',
        items: [
          'Treat the payload as public. Put identifiers in it, never secrets.',
          'Always verify the signature, and pin the algorithm and key on the server — do not read them from the token.',
          'Keep expiry (exp) short, and use a separate, revocable refresh token for staying logged in.',
          'Check aud and iss so a token minted for one audience cannot be replayed against another.',
          'Store tokens carefully in the browser — an HttpOnly cookie keeps a token out of reach of cross-site scripting in a way that localStorage does not.',
        ],
      },
      {
        kind: 'p',
        text: 'None of this requires trusting a remote website with your tokens. Both the decoder and the editor here run entirely on your device using the browser’s built-in Web Crypto, so you can inspect and rebuild production tokens without ever sending them anywhere.',
      },
    ],
    related: ['jwt-decoder', 'jwt-editor', 'base64-converter', 'hash-generator'],
    relatedGuides: ['base64-explained', 'hashing-vs-encryption-vs-encoding'],
  },

  {
    slug: 'base64-explained',
    title: 'Base64, explained simply: what it is, when to use it, and why it is not encryption',
    description:
      'Base64 turns binary into safe text so it can travel through systems built for text. Here is how it works, why it grows your data by a third, and what it is not.',
    category: 'Data formats',
    readingMinutes: 7,
    updated: '2026-08-10',
    published: '2026-08-10',
    intro: [
      'Base64 is one of those things you meet constantly — in data URIs, email attachments, JWT tokens, API responses — without anyone ever quite explaining it. It is not complicated once you see the idea: Base64 is a way of writing arbitrary binary data using only a small set of plain text characters, so that data can pass safely through channels that were only ever designed to carry text.',
      'This guide covers what problem it solves, roughly how the encoding works, why the output is always bigger than the input, and the single most common misunderstanding about it.',
    ],
    blocks: [
      { kind: 'h2', text: 'The problem Base64 solves' },
      {
        kind: 'p',
        text: 'Plenty of systems are text-only by design. An email body, a JSON string value, a URL, an HTTP header, an XML document — all of these expect readable characters, and many will mangle or reject raw binary bytes. But we routinely need to send binary through them: an image inside an email, a file inside a JSON field, a small icon embedded directly in a stylesheet.',
      },
      {
        kind: 'p',
        text: 'Base64 bridges that gap. It re-expresses any sequence of bytes as a string drawn from 64 safe characters — the uppercase and lowercase letters, the digits 0–9, and two symbols (usually + and /), with = as padding. Every one of those characters survives transit through text-only systems untouched, so the binary arrives intact on the other side.',
      },
      { kind: 'h2', text: 'How the encoding works' },
      {
        kind: 'p',
        text: 'The name is the recipe. “Base64” means each output character represents one of 64 possible values, which is exactly 6 bits of information (2 to the power of 6 is 64). Computers store data in 8-bit bytes. The encoder lines the input up in groups of three bytes — 24 bits — and re-slices those same 24 bits into four groups of 6. Each 6-bit group becomes one character from the alphabet.',
      },
      {
        kind: 'code',
        caption: 'Three bytes (24 bits) become four Base64 characters',
        code: 'Text:     M         a         n\nASCII:    77        97        110\nBits:     01001101  01100001  01101110\nRegroup:  010011  010110  000101  101110\nBase64:   T       W       F       u        →  "TWFu"',
      },
      {
        kind: 'p',
        text: 'When the input length is not a multiple of three, the encoder pads the final group with = signs so the output length is always a multiple of four. That is why Base64 strings so often end in one or two equals signs.',
      },
      { kind: 'h2', text: 'Why it makes data bigger' },
      {
        kind: 'p',
        text: 'Base64 always grows the data by roughly a third. The reason is right there in the grouping: three bytes of input (24 bits) turn into four characters of output, and each of those characters is itself stored as a full byte. So 3 bytes in becomes 4 bytes out — a 33% increase, before padding. This is the trade-off you accept for compatibility. Base64 is about making binary safe to transport, not about making it smaller; if anything, it costs you space.',
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'This is why you would not Base64-encode a large video to email it — the size penalty is real. It shines for small payloads where inline convenience matters, like a 2 KB icon embedded in CSS as a data URI.',
      },
      { kind: 'h2', text: 'Data URIs: Base64 you have already used' },
      {
        kind: 'p',
        text: 'A data URI packs a whole file into a single string, so it can be embedded inline instead of fetched from a separate URL. It looks like data:image/png;base64,iVBORw0KGgo… — a MIME type, the label “base64”, and then the encoded bytes. Browsers understand these directly, which is handy for tiny images and fonts that are not worth a separate network request.',
      },
      {
        kind: 'tool',
        lead: 'Encode or decode text, files and data URIs:',
        slug: 'base64-converter',
      },
      { kind: 'h2', text: 'The big misconception: Base64 is not encryption' },
      {
        kind: 'p',
        text: 'Because Base64 output looks scrambled and unreadable, people sometimes reach for it to “hide” a value. It hides nothing. Base64 is a public, reversible transformation with no key — anyone can decode it back to the original in a fraction of a second. Encoding is about representation; encryption is about secrecy. They are completely different jobs.',
      },
      {
        kind: 'ul',
        items: [
          'Encoding (Base64) changes how data is written so it can travel safely. It is reversible by anyone and keeps no secrets.',
          'Encryption scrambles data with a key so that only someone with the right key can read it. Without the key it is unreadable.',
          'Hashing turns data into a fixed-length fingerprint that cannot be reversed at all, used to verify integrity, not to recover the original.',
        ],
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'If you ever find a password or API key that is “just Base64” in a config file or request, treat it as plaintext. It is one decode away from being read.',
      },
      {
        kind: 'p',
        text: 'That distinction is worth internalising, because it explains a lot: it is why a JWT payload — which is Base64 — is readable by anyone, and why the security of a JWT comes from its signature rather than from the encoding of its claims.',
      },
    ],
    related: ['base64-converter', 'jwt-decoder', 'hash-generator'],
    relatedGuides: ['hashing-vs-encryption-vs-encoding', 'jwt-explained'],
  },

  {
    slug: 'hashing-vs-encryption-vs-encoding',
    title: 'Hashing vs encryption vs encoding: the difference that trips everyone up',
    description:
      'Three ideas people constantly mix up. Encoding is for compatibility, encryption is for secrecy, hashing is for integrity — here is how to tell them apart and when to reach for each.',
    category: 'Security',
    readingMinutes: 8,
    updated: '2026-08-10',
    published: '2026-08-10',
    intro: [
      'Encoding, encryption and hashing all take data and turn it into something that looks different, and that surface similarity causes a surprising amount of confusion — including in code that ships. But they solve three different problems, and using the wrong one is a real security bug, not a stylistic slip. “We hashed the credit card numbers” and “we encoded the passwords” are both sentences that should stop a code review.',
      'The clearest way to keep them straight is to ask what each one is for.',
    ],
    blocks: [
      { kind: 'h2', text: 'Encoding is for compatibility' },
      {
        kind: 'p',
        text: 'Encoding changes the representation of data so it can survive a particular channel — nothing more. Base64 rewrites binary as safe text; URL-encoding turns a space into %20 so it fits in an address; character sets like UTF-8 decide how letters map to bytes. Encoding uses no key and keeps no secret. It is fully reversible by anyone who knows the scheme, which is the whole point: the receiver must be able to decode it.',
      },
      {
        kind: 'ul',
        items: [
          'Goal: move or store data through a system with rules about what characters are allowed.',
          'Reversible: yes, by anyone. No key involved.',
          'Provides secrecy: no. Never use it to protect anything.',
        ],
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'If your reason for encoding something is “so people can’t read it”, you have chosen the wrong tool. Encoding is transparent by design.',
      },
      { kind: 'tool', lead: 'See encoding in action:', slug: 'base64-converter' },
      { kind: 'h2', text: 'Encryption is for secrecy' },
      {
        kind: 'p',
        text: 'Encryption scrambles data with a key so that only someone holding the right key can turn it back. Take away the key and the output is meaningless. That is what makes it suitable for protecting information — a message, a stored file, a database column of personal data. It is reversible, but only with the secret, which is precisely the property encoding lacks.',
      },
      {
        kind: 'p',
        text: 'Encryption comes in two shapes, mirroring the two families of JWT signing. Symmetric encryption uses one shared key to both lock and unlock (AES is the workhorse here). Asymmetric encryption uses a public key to lock and a private key to unlock, so anyone can send you a secret that only you can open.',
      },
      {
        kind: 'ul',
        items: [
          'Goal: keep data readable only to holders of the key.',
          'Reversible: yes, but only with the key.',
          'Provides secrecy: yes — that is the entire job.',
        ],
      },
      { kind: 'h2', text: 'Hashing is for integrity, and it is one-way' },
      {
        kind: 'p',
        text: 'A hash function takes any input and produces a fixed-length fingerprint — a digest. SHA-256 always returns 256 bits, whether you feed it one letter or a gigabyte. The defining feature is that it is one-way: you cannot run it backwards to recover the input. There is no “dehash”. A good cryptographic hash also makes it computationally infeasible to find two different inputs with the same digest, and guarantees that changing a single bit of input changes the digest completely.',
      },
      {
        kind: 'p',
        text: 'That one-way property is exactly why hashing is used where you must check data without being able to recover it:',
      },
      {
        kind: 'ul',
        items: [
          'Verifying a download: the publisher lists a SHA-256, you hash the file you received, and matching digests mean the bytes are identical.',
          'Storing passwords: a server stores the hash of a password, never the password. At login it hashes what you typed and compares. A breach leaks digests, not passwords — provided a slow, salted password hash like bcrypt or Argon2 was used rather than a plain fast SHA.',
          'Detecting change: a changed digest means the content changed, which underpins everything from Git commits to file-integrity monitoring.',
        ],
      },
      { kind: 'tool', lead: 'Compute and verify digests:', slug: 'hash-generator' },
      { kind: 'h2', text: 'Where HMAC fits in' },
      {
        kind: 'p',
        text: 'HMAC is a hash with a secret key mixed in. A plain hash proves that data has not changed, but anyone can compute it, so it does not prove who produced it. An HMAC can only be produced by someone who holds the shared secret, so it proves both integrity and authenticity — the message is intact and it came from someone who knows the key. This is what signs webhook payloads and API requests, and it is the mechanism behind the HS-family of JWT signatures.',
      },
      { kind: 'h2', text: 'A quick decision guide' },
      {
        kind: 'ol',
        items: [
          'Do I need the receiver to reliably read this through a text-only channel? Encode it.',
          'Do I need to keep this secret but recover it later? Encrypt it.',
          'Do I need to check this later without ever recovering it — a password, a checksum? Hash it.',
          'Do I need to prove a message is intact and came from a known sender? HMAC it.',
        ],
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'The tell for each: encoding has no key, encryption has a key and is reversible, hashing has no key and is not reversible. Get those three facts straight and the confusion goes away.',
      },
    ],
    related: ['hash-generator', 'base64-converter', 'jwt-decoder'],
    relatedGuides: ['base64-explained', 'jwt-explained'],
  },

  {
    slug: 'cron-expressions-guide',
    title: 'Cron expressions: a practical guide to reading and writing schedules',
    description:
      'The five fields of a cron expression, what the asterisks, slashes and ranges mean, worked examples, and the timezone gotcha that fires jobs at the wrong hour.',
    category: 'Scheduling',
    readingMinutes: 8,
    updated: '2026-08-10',
    published: '2026-08-10',
    intro: [
      'Cron expressions are how you tell a server “run this at 3am every day” or “every 15 minutes on weekdays”. They are wonderfully compact and almost impossible to read at a glance — five little fields of numbers and symbols that encode a repeating schedule. Once you know the layout, though, they are quick to write and quicker to check.',
      'This guide breaks down the five fields, the four symbols that do all the work, and the timezone mistake that catches almost everyone at least once.',
    ],
    blocks: [
      { kind: 'h2', text: 'The five fields' },
      {
        kind: 'p',
        text: 'A standard cron expression is five fields separated by spaces. Left to right, they are: minute, hour, day of month, month, and day of week.',
      },
      {
        kind: 'code',
        caption: 'The layout of the five fields',
        code: '┌───────── minute        (0–59)\n│ ┌─────── hour          (0–23)\n│ │ ┌───── day of month  (1–31)\n│ │ │ ┌─── month         (1–12)\n│ │ │ │ ┌─ day of week    (0–6, Sunday = 0)\n│ │ │ │ │\n* * * * *',
      },
      {
        kind: 'p',
        text: 'Read a real one field by field. “0 9 * * 1-5” is: minute 0, hour 9, any day of the month, any month, days of week 1 through 5 (Monday to Friday). In plain English: at 9:00 every weekday. Some systems add an optional sixth field at the front for seconds, but the classic five-field form is what you will meet most often.',
      },
      { kind: 'h2', text: 'The four symbols' },
      {
        kind: 'ul',
        items: [
          '* (asterisk) means “every value” for that field. In the minute field it means every minute; in the hour field, every hour.',
          ', (comma) lists specific values. “0,30” in the minute field means at :00 and :30.',
          '- (dash) sets a range. “1-5” in the day-of-week field means Monday through Friday.',
          '/ (slash) sets a step. “*/15” in the minute field means every 15 minutes; “0-30/10” means every 10 minutes within the first half hour.',
        ],
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'A step reads as “every N”. The most common one, */15 in the minute field, fires at :00, :15, :30 and :45 — four times an hour.',
      },
      { kind: 'h2', text: 'Worked examples' },
      {
        kind: 'code',
        caption: 'Common schedules, decoded',
        code: '*/15 * * * *    every 15 minutes\n0 * * * *       at the top of every hour\n0 9 * * 1-5     9am on weekdays\n0 0 1 * *       midnight on the 1st of every month\n30 2 * * 0      2:30am every Sunday\n0 */6 * * *     every 6 hours (00:00, 06:00, 12:00, 18:00)',
      },
      {
        kind: 'p',
        text: 'A subtle trap lives in the two “day” fields. When both day-of-month and day-of-week are restricted (neither is *), most cron implementations treat them as OR, not AND — the job runs when either matches. So “0 0 13 * 5” does not mean “Friday the 13th”; it means “every 13th of the month, and every Friday”. Getting a specific weekday-and-date combination usually needs a check inside the job itself.',
      },
      {
        kind: 'tool',
        lead: 'Turn any expression into plain English and preview its next runs:',
        slug: 'cron-explainer',
      },
      { kind: 'h2', text: 'The timezone gotcha' },
      {
        kind: 'p',
        text: 'This is the mistake that bites everyone: cron does not know or care what timezone you have in your head. It fires according to whatever clock the machine or the scheduler is set to. A great many servers run in UTC, so “0 9 * * *” on such a server means 9am UTC — which might be the middle of the night, or the previous evening, wherever you are.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'Before you trust a schedule, confirm which timezone it runs in, and picture the next few real firing times in that zone. A job that “runs at 9” is only useful if you know 9 where.',
      },
      {
        kind: 'p',
        text: 'Daylight saving time adds a second wrinkle. In a zone that shifts its clocks, a job scheduled for 2:30am can be skipped on the spring-forward night (that time never occurs) or run twice on the autumn night (it occurs twice). This is a big part of why running schedules in UTC, which has no DST, is such a common recommendation.',
      },
      { kind: 'h2', text: 'How to sanity-check a schedule' },
      {
        kind: 'ol',
        items: [
          'Read it field by field, left to right, and say it as a sentence.',
          'Look at the next few actual firing times, not just the description — a schedule that reads right can still fire far more or less often than you expected.',
          'Confirm the timezone the scheduler uses, and check the firing times in that zone.',
          'For anything tied to a wall-clock hour that matters, prefer UTC to sidestep daylight saving entirely.',
        ],
      },
      {
        kind: 'p',
        text: 'Reading the description tells you the intent; seeing the upcoming timestamps catches the mistakes. Doing both, before the schedule reaches production, is the whole discipline.',
      },
    ],
    related: ['cron-explainer', 'timestamp-converter'],
    relatedGuides: ['uuid-versions-explained'],
  },

  {
    slug: 'uuid-versions-explained',
    title: 'UUIDs explained: v4 vs v7, and choosing an identifier for your database',
    description:
      'What a UUID is, why version 4 is random, how version 7 embeds a timestamp so IDs sort by creation time, and why that matters for database index performance.',
    category: 'Databases',
    readingMinutes: 7,
    updated: '2026-08-10',
    published: '2026-08-10',
    intro: [
      'A UUID — universally unique identifier — is a 128-bit value used to label something without a central authority handing out numbers. Two machines that have never spoken can each generate one and be confident, to an overwhelming degree, that they will never collide. That property is why UUIDs are everywhere: primary keys, request ids, file names, event ids.',
      'For years “a UUID” meant the fully random version 4. Then version 7 arrived and quietly changed the best-practice answer for database keys. This guide explains the difference and why it matters more than it first appears.',
    ],
    blocks: [
      { kind: 'h2', text: 'What a UUID looks like' },
      {
        kind: 'p',
        text: 'A UUID is usually written as 32 hexadecimal digits in five dash-separated groups, like 550e8400-e29b-41d4-a716-446655440000. That is 128 bits of information. A few of those bits are reserved to record the version (how the UUID was generated) and the variant (which layout it follows); the rest carry the actual value.',
      },
      {
        kind: 'p',
        text: 'The space of 128-bit values is almost unimaginably large — on the order of 10 to the 38th. That is what lets independent systems mint identifiers freely: the probability that two randomly generated UUIDs ever coincide is so small it can be treated as zero for any real workload.',
      },
      { kind: 'h2', text: 'Version 4: fully random' },
      {
        kind: 'p',
        text: 'Version 4 fills almost all of its bits with random data (leaving just the version and variant markers). It is simple, needs no coordination, and reveals nothing about when or where it was made. For a great many uses — a random token, a correlation id, a file name — that is exactly right, and v4 remains the sensible default.',
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'For randomness you can trust, a v4 UUID should come from a cryptographically secure source. Browsers expose one through the Web Crypto API, which is what a good in-browser generator uses.',
      },
      { kind: 'h2', text: 'Version 7: time-ordered' },
      {
        kind: 'p',
        text: 'Version 7 keeps the uniqueness of v4 but arranges the bits differently: it puts a millisecond Unix timestamp in the leading bits, followed by random data. Two consequences follow. First, a v7 UUID roughly encodes when it was created. Second, and far more importantly, v7 values generated over time sort in creation order — later ids are larger than earlier ones.',
      },
      {
        kind: 'p',
        text: 'That ordering sounds like a minor nicety. For a database primary key it is the whole game.',
      },
      { kind: 'tool', lead: 'Generate v4 or v7 UUIDs, singly or in bulk:', slug: 'uuid-generator' },
      { kind: 'h2', text: 'Why ordering matters for a database key' },
      {
        kind: 'p',
        text: 'Most databases keep their primary key in a sorted structure — typically a B-tree, and in some engines the table rows are physically ordered by that key. When you insert a new row, the database has to place its key in the right sorted position.',
      },
      {
        kind: 'p',
        text: 'With random v4 keys, each new insert lands in an unpredictable spot scattered across the whole index. That scatters writes across many pages, causes those pages to split and fragment, and pushes pages in and out of the cache that holds the “hot” part of the index. Under heavy insert load this measurably slows things down and bloats the index.',
      },
      {
        kind: 'p',
        text: 'With time-ordered v7 keys, every new insert has a key larger than the last, so it lands at the end of the index — the same page you just touched, already in cache. Inserts stay sequential, page splits become rare, and the index stays compact. You keep the decentralised, collision-free nature of a UUID while getting insert behaviour much closer to a plain auto-incrementing integer.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'The trade-off: because v7 embeds a timestamp, it leaks roughly when a record was created, and consecutive ids are guessable in time order. For an internal primary key that is usually fine. For a public, unguessable token — a password-reset link, say — prefer v4.',
      },
      { kind: 'h2', text: 'Which one should you use?' },
      {
        kind: 'ul',
        items: [
          'Database primary key, especially high write volume: version 7, for the sequential-insert performance.',
          'Public or security-sensitive identifier that must not be guessable or leak timing: version 4.',
          'General-purpose id where you do not care about ordering: version 4 is the simple, safe default.',
        ],
      },
      {
        kind: 'p',
        text: 'The short version: reach for v7 when the ids will become the sort key of a large, growing table, and v4 for everything else. Both are proper UUIDs; they just make different trade-offs between unpredictability and order.',
      },
    ],
    related: ['uuid-generator', 'timestamp-converter', 'hash-generator'],
    relatedGuides: ['cron-expressions-guide'],
  },

  {
    slug: 'compress-images-for-web',
    title: 'How to compress images for the web without wrecking them',
    description:
      'Why image weight dominates page speed, JPEG vs WebP, how lossy quality settings really work, resizing before compressing, and stripping the metadata hidden in your photos.',
    category: 'Performance',
    readingMinutes: 8,
    updated: '2026-08-10',
    published: '2026-08-10',
    intro: [
      'On most web pages, images are the heaviest thing by far — routinely more bytes than the HTML, CSS and JavaScript combined. That makes image compression one of the highest-leverage things you can do for load time, and it is largely free: with sensible settings you can cut a photo to a fraction of its size with no difference a visitor would ever notice.',
      'This guide covers the choices that actually move the needle — format, quality, dimensions — and one privacy issue hiding in the files themselves.',
    ],
    blocks: [
      { kind: 'h2', text: 'Lossy vs lossless' },
      {
        kind: 'p',
        text: 'There are two ways to make an image smaller. Lossless compression stores the exact same pixels in fewer bytes; you can reconstruct the original perfectly, but the savings are modest. Lossy compression throws away information the eye is unlikely to miss — subtle colour and detail — in exchange for dramatically smaller files. For photographs on the web, lossy is almost always the right call, because the size win is enormous and, done carefully, invisible.',
      },
      {
        kind: 'p',
        text: 'The exception is images with hard edges and flat colour — logos, screenshots of text, diagrams — where lossy compression smears the edges into visible fuzz. Those belong in a format built for them (historically PNG, and increasingly lossless WebP).',
      },
      { kind: 'h2', text: 'JPEG vs WebP' },
      {
        kind: 'p',
        text: 'JPEG has been the workhorse of web photography for decades. It is lossy, universally supported, and good enough that it is still everywhere. WebP is the modern alternative: at the same visual quality it typically produces files 25–35% smaller than JPEG, and unlike JPEG it also supports transparency. Every current browser handles it.',
      },
      {
        kind: 'ul',
        items: [
          'Choose WebP for the web by default — smaller files at equal quality, and it does transparency.',
          'Choose JPEG when you need maximum compatibility with older software or systems that may not accept WebP.',
          'Keep transparency in WebP or PNG; converting a transparent image to JPEG flattens it onto a solid background, because JPEG has no alpha channel.',
        ],
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'The encoder matters, not just the format. High-quality encoders such as mozjpeg for JPEG and libwebp for WebP squeeze out noticeably smaller files than the quick built-in path many tools use.',
      },
      { kind: 'h2', text: 'What the quality slider actually does' },
      {
        kind: 'p',
        text: 'Lossy formats expose a quality setting, usually 0–100. It is not a percentage of anything intuitive — it controls how aggressively detail is discarded. The relationship is sharply non-linear: dropping from 100 to about 80 removes a lot of bytes for almost no visible change, while dropping below roughly 60 starts to show blocky artefacts and colour banding. The sweet spot for most photographs sits somewhere around 75–85.',
      },
      {
        kind: 'p',
        text: 'The only reliable way to set it is to look. Compress, then compare against the original at full size — a before-and-after slider is ideal — and back the quality off until you can just barely tell, then nudge it up a notch. Your eyes on your image beat any fixed number.',
      },
      {
        kind: 'tool',
        lead: 'Compress by quality or to a target size, with a before/after slider:',
        slug: 'image-compressor',
      },
      { kind: 'h2', text: 'Resize before you compress' },
      {
        kind: 'p',
        text: 'The biggest single mistake is serving an image far larger than it will ever be displayed. A modern phone camera produces images four or five thousand pixels wide; if that photo appears in a 800-pixel column, the browser downloads millions of pixels it immediately throws away. No quality setting fixes that — the fix is to scale the actual dimensions down to roughly what will be shown (allowing extra for high-density screens) before compressing. Resizing usually saves more than any amount of quality tuning.',
      },
      { kind: 'h2', text: 'Compress to a target size' },
      {
        kind: 'p',
        text: 'Sometimes the constraint is a hard limit — an upload form that rejects anything over 2 MB, say. Rather than guessing quality values, a target-size mode works backwards: it re-encodes the image repeatedly, homing in on the highest quality that still fits under the limit. If even the lowest usable quality is too big, that is the signal to reduce the dimensions as well.',
      },
      { kind: 'h2', text: 'The metadata hiding in your photos' },
      {
        kind: 'p',
        text: 'Photographs carry Exif metadata — camera model, settings, timestamp, and often the exact GPS coordinates where the shot was taken. That is fine on your own device and alarming on a public website, where anyone can read the location straight out of the file. It also adds weight for no visual benefit.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'Before publishing a photo, strip its metadata — or confirm your compression tool does. Most re-encoding drops Exif by default, but check, because “I posted a picture from home” has quietly shared home addresses more than once.',
      },
      { kind: 'h2', text: 'A workflow that holds up' },
      {
        kind: 'ol',
        items: [
          'Resize the image to roughly the largest size it will be displayed at.',
          'Encode to WebP (or JPEG for maximum compatibility) with a strong encoder.',
          'Set quality by eye — start around 80 and compare against the original.',
          'Confirm Exif metadata, especially GPS, has been stripped.',
          'If you must hit a fixed file size, use a target-size mode and drop the dimensions if quality alone cannot get you there.',
        ],
      },
      {
        kind: 'p',
        text: 'Do those five things and a page full of photos can drop from megabytes to a few hundred kilobytes with no visible loss — the difference between a page that feels instant and one that hangs.',
      },
    ],
    related: ['image-compressor', 'pdf-compress', 'color-converter'],
    relatedGuides: ['image-formats-explained'],
  },

  {
    slug: 'password-storage-explained',
    title: 'How passwords should be stored: hashing, salting, and why encryption is the wrong tool',
    description:
      'Why passwords are hashed rather than encrypted, what a salt actually prevents, why bcrypt and Argon2 are deliberately slow, and how to read a breach announcement.',
    category: 'Security',
    readingMinutes: 10,
    updated: '2026-08-31',
    published: '2026-08-31',
    intro: [
      'Every few months a company announces that its user database has been taken, and the announcement contains one sentence that decides how bad it really is — something about how the passwords were stored. “Encrypted” sounds reassuring and is usually the worst answer. “Hashed and salted with bcrypt” sounds like jargon and is the one you want to read.',
      'This guide explains what those words mean, why the right answer is counter-intuitive, and how to tell a serious password system from one that merely looks careful.',
    ],
    blocks: [
      { kind: 'h2', text: 'Why you never store the password' },
      {
        kind: 'p',
        text: 'A login system does not need to know your password. It only needs to answer one question: is the string this person just typed the same as the one they chose earlier? That is a narrower requirement than it first appears, and the entire design follows from taking it literally.',
      },
      {
        kind: 'p',
        text: 'A hash function turns any input into a fixed-length value, and it is one-way: trivial to compute forwards, infeasible to reverse. So the server stores the hash of your password, never the password. At login it hashes what you typed and compares the two hashes. If they match, you knew the password. If the database is stolen, the attacker has a pile of hashes rather than a pile of passwords.',
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'This is why a well-built site cannot email you your password when you forget it — it genuinely does not have it. A site that can send you your existing password has told you something important about how it stores them.',
      },
      { kind: 'tool', lead: 'See what a hash looks like for any input:', slug: 'hash-generator' },
      { kind: 'h2', text: 'Why encryption is the wrong tool here' },
      {
        kind: 'p',
        text: 'Encryption is reversible by design — that is the point of it. Encrypted data can be decrypted with the key, which means an encrypted password database is only as safe as the key sitting somewhere on the same infrastructure. An attacker who got the database very often gets the key too, and then holds every password in plain text.',
      },
      {
        kind: 'p',
        text: 'Hashing has no key and no way back. There is nothing an attacker can steal that turns the hashes back into passwords. The trade is that you lose the ability to recover a password, which for authentication is not a loss at all — you never wanted that ability, and password reset gives users a safer route to the same outcome.',
      },
      { kind: 'h2', text: 'What a salt actually prevents' },
      {
        kind: 'p',
        text: 'Plain hashing has a weakness that is easy to miss: it is deterministic. The same password always produces the same hash, so identical hashes in a stolen database reveal that those users chose the same password. Worse, an attacker can precompute hashes for millions of common passwords once and then look up every stolen hash instantly. Those precomputed tables are why unsalted hashes are effectively no protection at all for a common password.',
      },
      {
        kind: 'p',
        text: 'A salt is a random value, different for every user, mixed into the password before hashing and stored alongside the result. It does not need to be secret. What it changes is economics: because every user has a different salt, a precomputed table is useless, and the attacker must attack each password separately rather than all of them at once. Two users with the identical password now have completely different stored hashes.',
      },
      { kind: 'h2', text: 'Why the good algorithms are deliberately slow' },
      {
        kind: 'p',
        text: 'Here is the part that surprises people. SHA-256 is an excellent hash function and a poor password hash, precisely because it is fast. Modern hardware computes billions of SHA-256 hashes per second, so an attacker with a stolen database and a graphics card can try every word in a dictionary, every common password, and every short combination, in a very short time. Speed is a virtue everywhere else and a liability here.',
      },
      {
        kind: 'p',
        text: 'Password hashing functions — bcrypt, scrypt and Argon2 — are built to be slow and adjustable. They take a cost factor that controls how much work each hash requires, and it can be raised as hardware gets faster. Argon2 and scrypt additionally demand a configurable amount of memory, which blunts the advantage of specialised cracking hardware that can parallelise computation far more easily than it can parallelise memory.',
      },
      {
        kind: 'p',
        text: 'The target is usually a few hundred milliseconds per hash. Imperceptible when you log in once; ruinous for an attacker trying to work through a hundred million candidates.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'This is why “we hashed the passwords with SHA-256” in a breach notice is not the reassurance it sounds like. Without a salt and a deliberate work factor, common passwords in that database are recoverable.',
      },
      { kind: 'h2', text: 'What this means for you as a user' },
      {
        kind: 'p',
        text: 'You cannot choose how a site stores your password, which is exactly why the advice about reuse matters so much. If you use one password everywhere, its safety is set by the least careful site you ever signed up to — and you will not know which that is until the breach is announced. A unique password per site turns a total compromise into a single-site inconvenience.',
      },
      {
        kind: 'p',
        text: 'Length beats complexity. The substitutions people make to satisfy complexity rules — an @ for an a, a 3 for an e — are exactly what cracking tools try first, because everyone makes the same ones. A long passphrase of unrelated words is both far stronger and far easier to remember than a short string of punctuation.',
      },
      {
        kind: 'tool',
        lead: 'Generate a strong password or passphrase, entirely in your browser:',
        slug: 'password-generator',
      },
      { kind: 'h2', text: 'Reading a breach announcement' },
      {
        kind: 'ul',
        items: [
          '“Hashed and salted with bcrypt, scrypt or Argon2” — the best case. Change your password anyway, but strong passwords are very likely still safe.',
          '“Hashed with SHA-256” with no mention of a salt — weak. Common and short passwords should be treated as exposed.',
          '“Encrypted” — ambiguous at best, and often means the key was recoverable. Treat the passwords as exposed.',
          '“Stored in plain text” — every password in that database is known. Change it anywhere you reused it, immediately.',
          'No mention of storage at all — assume the worst, because a company that did it well says so.',
        ],
      },
      {
        kind: 'p',
        text: 'The underlying idea is worth carrying beyond passwords: good security design assumes the database will eventually be stolen and asks what the attacker gets when it is. Hashing is what makes the answer “not very much”.',
      },
    ],
    related: ['hash-generator', 'password-generator', 'jwt-decoder'],
    relatedGuides: ['hashing-vs-encryption-vs-encoding', 'https-explained'],
  },

  {
    slug: 'https-explained',
    title: 'What actually happens when you load an HTTPS page',
    description:
      'The TLS handshake in plain English: how a browser and server agree on keys, what the padlock does and does not prove, and why certificates need an authority behind them.',
    category: 'Security',
    readingMinutes: 10,
    updated: '2026-08-31',
    published: '2026-08-31',
    intro: [
      'Between typing an address and seeing a page, your browser and a server you have never contacted before agree on a shared secret in full view of anyone watching the wire, prove to each other who they are, and start encrypting — usually in well under a tenth of a second. It is one of the most quietly impressive things computers do routinely.',
      'This guide walks through what happens in that gap, in the order it happens, and what the padlock in the address bar actually certifies — which is less than most people assume.',
    ],
    blocks: [
      { kind: 'h2', text: 'The problem being solved' },
      {
        kind: 'p',
        text: 'Data sent over the internet passes through equipment you do not control: your router, your internet provider, whatever networks sit between you and the server. Without protection, all of it is readable and, worse, modifiable in transit. HTTPS has to provide three things at once — confidentiality, so nobody can read it; integrity, so nobody can change it undetected; and authenticity, so you are talking to the site you think you are.',
      },
      {
        kind: 'p',
        text: 'The third is the hard one. Encryption alone is not enough: an attacker who sits in the middle can happily encrypt a conversation with you while pretending to be your bank. Without a way to verify identity, you would have a perfectly private conversation with the wrong party.',
      },
      { kind: 'h2', text: 'Agreeing on a key in public' },
      {
        kind: 'p',
        text: 'The first puzzle is that encryption needs a shared key, but the two sides have never met and everything they send is visible. The answer is a key exchange, and the intuition is easier than the mathematics. Both sides start from a public value, each mixes in a private secret of their own, and they swap results. Each then mixes their own secret into what the other sent. Because of how the underlying maths works, both arrive at the same final value — while an observer, who saw only the exchanged intermediate values, cannot reconstruct it.',
      },
      {
        kind: 'p',
        text: 'Modern TLS uses an elliptic-curve version of this, and it is ephemeral: fresh secrets for every connection, discarded afterwards. That property is called forward secrecy, and it is why recording an encrypted session today is not made readable by stealing the server key tomorrow — the key that protected that session no longer exists anywhere.',
      },
      { kind: 'h2', text: 'Proving who you are' },
      {
        kind: 'p',
        text: "The key exchange gives both sides a shared secret but says nothing about identity. That is the certificate's job. The server sends a certificate containing its public key, the hostnames it is valid for, an expiry date, and a signature from a certificate authority. The browser checks that the certificate covers the hostname it asked for, that it has not expired, and that the signature chains up to an authority it already trusts.",
      },
      {
        kind: 'p',
        text: 'That trust is not infinite regress: your browser and operating system ship with a set of root certificates built in, and the chain must terminate in one of them. The server also proves it holds the private key matching the certificate — otherwise anyone could copy a public certificate and impersonate the site.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'The padlock means the connection is encrypted and the certificate matches the domain. It does not mean the site is honest, safe or who you think. A phishing site can obtain a valid certificate for its own lookalike domain in minutes, and it will show a padlock too. The padlock certifies the pipe, not the person at the other end.',
      },
      { kind: 'h2', text: 'What the handshake looks like in order' },
      {
        kind: 'ol',
        items: [
          'The browser says hello, listing the TLS versions and cipher suites it supports, and — in TLS 1.3 — already includes its key-exchange contribution to save a round trip.',
          'The server replies with its chosen cipher, its own key-exchange contribution and its certificate chain.',
          'The browser validates the chain against its trusted roots, checks the hostname and the expiry, and confirms the server holds the matching private key.',
          'Both sides derive the same session keys from the exchange, and switch to fast symmetric encryption for everything that follows.',
          'The encrypted HTTP request finally goes out — and only now does the server learn which page you asked for.',
        ],
      },
      {
        kind: 'p',
        text: 'TLS 1.3 completes this in a single round trip, and can resume a previous session in zero. This is why HTTPS stopped being something sites avoided for performance reasons: the cost is now close to negligible.',
      },
      { kind: 'h2', text: 'What is still visible' },
      {
        kind: 'p',
        text: 'HTTPS hides the contents of your request — the path, the headers, the body, the response. It does not hide who you are talking to. The domain name is visible to your network provider, both from the DNS lookup that preceded the connection and, historically, from the certificate exchange itself. Packet sizes and timing are visible too, and can be surprisingly revealing.',
      },
      {
        kind: 'p',
        text: 'So HTTPS means your provider knows you visited a particular site, but not which page or what you sent. That distinction matters when reasoning about privacy: encryption in transit is not anonymity.',
      },
      { kind: 'h2', text: 'Where this leaves you' },
      {
        kind: 'p',
        text: 'The practical takeaways are small but worth holding. A padlock is necessary and not sufficient — read the domain, not the icon. A certificate warning is worth stopping for, because it means the identity check failed, which is exactly the situation the whole system exists to catch. And a page delivered over HTTPS can still do anything it likes with what you type into it, which is the reason tools that keep your data on your own device are a different kind of guarantee from tools that merely transmit it securely.',
      },
    ],
    related: ['jwt-decoder', 'hash-generator', 'base64-converter'],
    relatedGuides: ['password-storage-explained', 'hashing-vs-encryption-vs-encoding'],
  },

  {
    slug: 'image-formats-explained',
    title: 'JPEG, PNG, WebP, AVIF and HEIC: what each format throws away, and when to use it',
    description:
      'How lossy compression actually decides what to discard, why PNG is huge for photographs, what WebP and AVIF changed, and why iPhone photos arrive as HEIC.',
    category: 'Images',
    readingMinutes: 11,
    updated: '2026-08-31',
    published: '2026-08-31',
    intro: [
      'Every image format is an argument about what you are willing to lose. Some lose nothing and pay in size. Some discard detail your eye was never going to notice. Understanding which is which turns format choice from guesswork into a decision you can justify.',
      'This guide covers what each of the common formats actually does to your pixels, why the same photograph can be 8 MB or 200 KB with no visible difference, and how to choose without simply defaulting to JPEG forever.',
    ],
    blocks: [
      { kind: 'h2', text: 'Lossless and lossy are two different promises' },
      {
        kind: 'p',
        text: 'A lossless format guarantees that the pixels you get back are exactly the pixels you put in. PNG works this way: it finds patterns and repetition and stores them compactly, in much the same spirit as zipping a file. Decompress it and every pixel is bit-for-bit identical.',
      },
      {
        kind: 'p',
        text: 'A lossy format makes no such promise. It discards information permanently in exchange for a much smaller file, and the craft is in discarding things human vision is bad at noticing. JPEG, WebP and AVIF are lossy by default. The result is not the image you put in — it is an image your eye struggles to distinguish from it, which for a photograph is usually the better trade by a wide margin.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'Lossy compression is not idempotent. Every time you open a JPEG and re-save it, it is decoded and re-compressed, and a little more is thrown away. Editing the same JPEG repeatedly visibly degrades it — always keep an original and export from that.',
      },
      { kind: 'h2', text: 'What JPEG actually discards' },
      {
        kind: 'p',
        text: 'JPEG exploits two facts about human vision. The first is that we perceive brightness far more precisely than colour, so JPEG separates the two and stores colour information at lower resolution — often a quarter of the pixels. This is chroma subsampling, and it is nearly invisible on photographs while removing a large fraction of the data immediately.',
      },
      {
        kind: 'p',
        text: 'The second is that we notice broad shapes more than fine high-frequency detail. JPEG divides the image into 8×8 blocks and expresses each as a combination of frequency patterns, then rounds away the high-frequency components most aggressively. The quality slider is essentially controlling how coarsely that rounding happens.',
      },
      {
        kind: 'p',
        text: "This explains JPEG's characteristic failures. Push quality too low and the 8×8 blocks become visible as squares. Sharp edges — text, logos, line art — acquire a shimmer around them, because a hard edge is exactly the high-frequency content JPEG is designed to discard. That is why a screenshot saved as JPEG looks muddy while a photograph looks fine.",
      },
      { kind: 'h2', text: 'Why PNG is enormous for photographs' },
      {
        kind: 'p',
        text: 'PNG compresses by finding predictable structure — runs of identical pixels, rows that resemble the row above. A screenshot, a logo or a diagram is full of that structure, so PNG compresses it beautifully and losslessly.',
      },
      {
        kind: 'p',
        text: 'A photograph has almost none. Every pixel differs slightly from its neighbours because of sensor noise and natural texture, so there is little for the algorithm to exploit, and PNG ends up storing something close to the raw data. This is why the same photo can be 12 MB as PNG and 400 KB as a high-quality JPEG that looks identical.',
      },
      {
        kind: 'p',
        text: "PNG's real advantage is transparency, which it handles properly with a full alpha channel — the reason it remains the right choice for logos and interface assets.",
      },
      { kind: 'h2', text: 'What WebP and AVIF changed' },
      {
        kind: 'p',
        text: 'JPEG dates from 1992. WebP and AVIF apply three decades of research since, borrowing techniques from video compression — where the same problem has had far more money spent on it. Both predict blocks from their neighbours in more sophisticated ways and use variable block sizes rather than a fixed 8×8 grid.',
      },
      {
        kind: 'p',
        text: 'In practice WebP produces files roughly 25–35% smaller than JPEG at comparable quality, and AVIF often 50% smaller than JPEG. Both also support transparency and lossless modes, so they can replace PNG as well. The costs are encoding time — AVIF is markedly slower to produce — and support, which for WebP is now universal in current browsers and for AVIF is good but not yet total.',
      },
      {
        kind: 'tool',
        lead: 'Convert between all of these in your browser, without uploading anything:',
        slug: 'image-converter',
      },
      { kind: 'h2', text: 'Why your phone gives you HEIC' },
      {
        kind: 'p',
        text: 'HEIC is what Apple devices produce by default, and it exists for the same reason AVIF does: it wraps a modern video codec around still images, roughly halving the size of an equivalent JPEG. On a phone, that is an enormous saving across thousands of photos.',
      },
      {
        kind: 'p',
        text: "The friction is everywhere else. Support outside the Apple ecosystem remains patchy, so HEIC files are routinely rejected by upload forms, refused by older software and unopenable on a colleague's machine. Converting to JPEG is the usual fix, and it is worth remembering that this is a lossy-to-lossy conversion — you are decoding one lossy image and re-encoding it as another, so keep quality high.",
      },
      { kind: 'h2', text: 'Choosing, briefly' },
      {
        kind: 'ul',
        items: [
          'Photograph on a website — WebP, with a JPEG fallback if you must support very old clients.',
          'Photograph that has to work absolutely everywhere, including old software and email — JPEG.',
          'Screenshot, logo, diagram, or anything with text or sharp edges — PNG, or WebP lossless.',
          'Anything needing transparency — PNG, WebP or AVIF; never JPEG, which has no alpha channel at all.',
          'Smallest possible file and you control the audience — AVIF.',
          'An iPhone photo you need to send someone — convert to JPEG.',
        ],
      },
      {
        kind: 'p',
        text: 'One last point that outweighs format choice more often than people expect: resize before you compress. A 4000-pixel-wide photograph displayed in a 800-pixel column is carrying five times the pixels it needs, and no amount of clever compression fixes that. Reducing the dimensions is the single largest saving available, and it costs nothing visible.',
      },
    ],
    related: ['image-converter', 'image-compressor', 'exif-viewer'],
    relatedGuides: ['compress-images-for-web', 'photo-metadata-privacy'],
  },

  {
    slug: 'photo-metadata-privacy',
    title: 'What your photos reveal: EXIF metadata, GPS coordinates and how to strip them',
    description:
      'Photos carry the camera, the exact time and often the precise coordinates where they were taken. What is in there, who can read it, and how to remove it without ruining the image.',
    category: 'Privacy',
    readingMinutes: 9,
    updated: '2026-08-31',
    published: '2026-08-31',
    intro: [
      'A photograph is not only a picture. Tucked into the file, invisible unless you go looking, is a record of the device that took it, the settings it used, the second the shutter opened and — if location services were on — the coordinates of the spot you were standing.',
      'None of this is sinister by design; it is genuinely useful for organising a photo library. It becomes a problem the moment a photo leaves your control, which is most of the time. This guide covers what is actually in there, when it survives sharing, and how to remove it properly.',
    ],
    blocks: [
      { kind: 'h2', text: 'What is actually stored' },
      {
        kind: 'p',
        text: 'The standard is called EXIF — Exchangeable Image File Format — and it is a block of structured data written into the file alongside the image itself. A typical phone photo contains the make and model of the device, the lens, the exposure time, aperture and ISO, the orientation, the software version, and a timestamp accurate to the second.',
      },
      {
        kind: 'p',
        text: 'If location services were enabled for the camera, it also contains GPS coordinates, often with altitude and sometimes a compass bearing. Those coordinates are precise to a few metres — enough to identify a specific building, not a general area.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'The combination is what matters. A single photo gives a place and a moment. A set of photos gives a pattern: where you live, where you work, when you are usually at each, and when you were away.',
      },
      {
        kind: 'tool',
        lead: 'See exactly what one of your own photos contains:',
        slug: 'exif-viewer',
      },
      { kind: 'h2', text: 'Serial numbers and the quiet identifier' },
      {
        kind: 'p',
        text: 'Less well known is that many cameras write a body serial number, and sometimes a lens serial number, into every photo. It is a stable identifier that links every image from that device, across every account and pseudonym you have ever posted under. Photos shared anonymously in one place and under your name in another can be tied together by nothing more than that field.',
      },
      {
        kind: 'p',
        text: 'Editing software adds its own traces too — the application and version, and occasionally an author or copyright field populated from whatever name the software was registered with, which is not always a name you meant to publish.',
      },
      { kind: 'h2', text: 'Does sharing strip it? Sometimes' },
      {
        kind: 'p',
        text: 'The large social platforms generally do remove metadata, because they re-encode every upload for their own purposes and the metadata does not survive. That has led to a widespread assumption that sharing is safe, and the assumption is where people get caught.',
      },
      {
        kind: 'p',
        text: 'Metadata routinely survives when a photo is emailed as an attachment, uploaded to a file-sharing service, sent through a chat app as a document rather than as a photo, posted to a smaller site that stores the original, or handed over on a USB drive. It also survives most cloud backup and sync. The rule of thumb is that anything preserving your original file preserves everything in it.',
      },
      { kind: 'h2', text: 'Removing it without wrecking the photo' },
      {
        kind: 'p',
        text: 'The obvious approach — open the photo in an editor and save a copy — does work, and it has a hidden cost. Saving a JPEG re-encodes it, which means another round of lossy compression and a slightly worse image than the one you started with. Do it a few times and the degradation becomes visible.',
      },
      {
        kind: 'p',
        text: "The better approach is to edit the container rather than the image: remove the metadata sections of the file and copy the compressed image data across untouched. For a JPEG that means dropping the segment the metadata lives in; for a PNG, the text and metadata chunks. The result is pixel-for-pixel identical to the original, just smaller by however many bytes the metadata occupied. That is what this site's EXIF tool does, and it is worth preferring wherever it is available.",
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'One caveat: removing metadata does not remove anything visible in the photograph itself. A street sign, a house number, a reflection or a screen in the background is content, not metadata, and no stripping tool will touch it.',
      },
      { kind: 'h2', text: 'Sensible habits' },
      {
        kind: 'ul',
        items: [
          'Turn off location for the camera app if you do not need it. This is the single most effective step, because metadata never written cannot leak.',
          'Strip metadata before sharing photos of your home, your children, or anywhere you spend time regularly.',
          'Be especially careful with photos sent as email attachments or as chat “documents”, which preserve the original file.',
          'Check before you post rather than after. Once a file is uploaded you cannot retrieve the copy someone else already has.',
          'Remember that screenshots carry metadata too, including the device and sometimes the software.',
        ],
      },
      {
        kind: 'p',
        text: 'The honest framing is not that metadata is dangerous — it is that it is invisible. People make sensible decisions about what a photo shows and no decision at all about what it records, because they have never been shown. Looking at one of your own photos once tends to change how you handle all of them.',
      },
    ],
    related: ['exif-viewer', 'image-converter', 'image-compressor'],
    relatedGuides: ['image-formats-explained', 'compress-images-for-web'],
  },

  {
    slug: 'regex-explained',
    title: 'Regular expressions: how to read one, write one, and know when not to',
    description:
      'How a regex engine actually matches, why greedy and lazy quantifiers differ, the pattern shape that can hang a server, and the problems a regex should not be used on.',
    category: 'Text',
    readingMinutes: 11,
    updated: '2026-09-07',
    published: '2026-09-07',
    intro: [
      'A regular expression is the densest syntax most developers use regularly. Ten characters can encode a rule that would otherwise take a paragraph of English and twenty lines of code — which is exactly why they are useful, and exactly why they are hard to review.',
      'This guide is about reading them as much as writing them: what the engine is really doing, the two or three behaviours behind most regex bugs, and the cases where reaching for a pattern is itself the mistake.',
    ],
    blocks: [
      { kind: 'h2', text: 'What the engine is actually doing' },
      {
        kind: 'p',
        text: 'A regex is a pattern the engine tries to match by walking the input one position at a time. At each position it attempts the whole pattern; if that fails, it shifts one character along and tries again. That “try, fail, shift, retry” loop explains most of what feels surprising later — why an unanchored pattern happily matches in the middle of a string, and why a badly shaped one can take an extraordinarily long time to decide it does not match.',
      },
      { kind: 'h2', text: 'The pieces worth knowing' },
      {
        kind: 'ul',
        items: [
          'Literals match themselves. Most of a useful pattern is ordinary text.',
          'Character classes match one character from a set: [aeiou], or a range like [a-z0-9]. The shorthands \\d, \\w and \\s cover digits, word characters and whitespace.',
          'Quantifiers repeat whatever precedes them: * is zero or more, + is one or more, ? is zero or one, and {2,4} is an explicit range.',
          'The dot matches any character except a newline — a default that catches people out more often than it helps.',
          'Alternation with | tries the left side, then the right.',
          'Parentheses group, and by default also capture what they matched for later use.',
        ],
      },
      {
        kind: 'code',
        caption: 'A few patterns, read piece by piece',
        code: '\\d{4}-\\d{2}-\\d{2}     an ISO-style date:  2026-09-07\n[A-Za-z]+            one or more letters\n^\\s*$                a line that is empty or only whitespace\n(cat|dog)s?          cat, cats, dog or dogs',
      },
      {
        kind: 'tool',
        lead: 'Build a pattern against real input and watch what it matches:',
        slug: 'regex-tester',
      },
      { kind: 'h2', text: 'Greedy by default, and what that costs' },
      {
        kind: 'p',
        text: 'Quantifiers are greedy: they take as much as they possibly can, then hand characters back one at a time until the rest of the pattern fits. That is why a pattern like <.+> matched against <b>hi</b> captures the entire string rather than just the opening tag — the .+ swallows everything to the end, then backtracks just far enough to find a final closing bracket.',
      },
      {
        kind: 'p',
        text: 'Adding ? makes a quantifier lazy, so it takes as little as it can get away with. Greedy and lazy are not right and wrong; they are two different intentions. Choosing between them without noticing you are choosing is where a great many almost-correct patterns come from.',
      },
      {
        kind: 'code',
        caption: 'The same input, two quantifier moods',
        code: 'input     <b>hi</b>\n\n<.+>      matches   <b>hi</b>      greedy: as much as possible\n<.+?>     matches   <b>            lazy:   as little as possible',
      },
      { kind: 'h2', text: 'Anchors, and why a validation pattern needs them' },
      {
        kind: 'p',
        text: 'Without anchors, a pattern only has to match somewhere. \\d{4} finds four digits anywhere in the input, so validating a year with it will cheerfully accept “not a year, 1999, at all”. The anchors ^ and $ tie the pattern to the start and end of the input, and ^\\d{4}$ means the whole string is exactly four digits and nothing else.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'A missing anchor is one of the most common security-adjacent regex bugs. A check for an allowed domain written without a closing $ will accept example.com.attacker.net, because the pattern matched a prefix and nothing required it to reach the end.',
      },
      { kind: 'h2', text: 'Capturing, and naming what you captured' },
      {
        kind: 'p',
        text: 'Parentheses capture. Groups are numbered left to right by their opening bracket and referred to afterwards as $1 or \\1 depending on the tool. Once a pattern has more than two of them, that numbering becomes a liability: insert a group near the front and every later reference silently shifts. Named groups — (?<year>\\d{4}) — remove the problem and document the pattern at the same time.',
      },
      {
        kind: 'p',
        text: 'When you need grouping purely for alternation or repetition and never read the captured text, (?:...) is a non-capturing group. It keeps the numbering clean, and in frequently executed code it avoids storing matches nobody will look at.',
      },
      { kind: 'h2', text: 'The pattern that hangs the server' },
      {
        kind: 'p',
        text: 'Because the engine backtracks, some patterns have a worst case that grows exponentially with the length of the input. The classic shape is a quantifier applied to something that is itself repeatable and ambiguous — (a+)+$ is the textbook example. Given a long run of a characters followed by something that cannot match, the engine explores an enormous number of ways to divide that run before concluding the whole thing fails.',
      },
      {
        kind: 'p',
        text: 'In a browser, that freezes the tab. On a server it occupies a request thread, and a handful of crafted inputs can exhaust the pool. The vulnerability class has a name, ReDoS, and it is a genuine one rather than a curiosity — it has taken down production services at companies large enough to know better.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'Be especially wary of patterns assembled from user input, and of nested quantifiers over overlapping classes such as (\\s+)+ or (\\w|\\d)*. If a pattern will run against untrusted text, test it with a long adversarial string rather than only a realistic one.',
      },
      { kind: 'h2', text: 'When a regex is the wrong tool' },
      {
        kind: 'p',
        text: 'Regular expressions match flat patterns. They are poor at anything with nesting or a real grammar, because the structure can be arbitrarily deep and the pattern cannot follow it.',
      },
      {
        kind: 'ul',
        items: [
          'HTML and XML — nested, with attributes, comments and entities. Use a parser; the XML Viewer here is one.',
          'Email addresses — the specification permits far more than people expect, and the “correct” pattern is famously enormous. Check for a plausible shape, then send a confirmation message. Delivery is the real validation.',
          'JSON, source code, and CSV with quoted fields containing commas — each has a grammar, and a parser for it already exists.',
        ],
      },
      {
        kind: 'p',
        text: 'The honest rule: a regex is excellent for finding and extracting inside text whose shape you already control, and poor as a substitute for parsing something you do not.',
      },
      { kind: 'h2', text: 'Writing one that survives a year' },
      {
        kind: 'ul',
        items: [
          'Anchor it if it is a validation, and let the variable name say that it is one.',
          'Use named groups as soon as there is more than a single capture.',
          'Use the extended or verbose flag where the language offers it, so the pattern can carry whitespace and comments.',
          'Keep two real examples beside it as a test — one that must match, one that must not.',
        ],
      },
      {
        kind: 'p',
        text: 'A regex is code with the comments stripped out. Everything you can do to put the context back — a name, a named group, an example on either side of the line — pays for itself the first time somebody has to change it under pressure.',
      },
    ],
    related: ['regex-tester', 'text-diff', 'word-counter'],
    relatedGuides: ['cron-expressions-guide', 'base64-explained'],
  },

  {
    slug: 'character-encoding-explained',
    title: 'Character encoding explained: Unicode, UTF-8, and why text turns into mojibake',
    description:
      'Why é arrives as Ã©, what a code point is, how UTF-8 stores one, and the encoding mistakes that quietly break CSV files, URLs, database columns and string comparisons.',
    category: 'Data formats',
    readingMinutes: 11,
    updated: '2026-09-07',
    published: '2026-09-07',
    intro: [
      'Text looks like the simplest kind of data right up to the moment a customer’s name comes back as “Ã©”, or an emoji disappears on its way into a database. Almost every one of those failures is the same mistake made somewhere different: bytes were read using a different rule from the one used to write them.',
      'This guide separates the layers people tend to collapse together — characters, code points and bytes — and then walks through where they get confused in practice.',
    ],
    blocks: [
      { kind: 'h2', text: 'Three layers, usually treated as one' },
      {
        kind: 'ol',
        items: [
          'A character is the abstract thing: the letter é, the emoji 🙂, the Arabic letter ب.',
          'A code point is the number Unicode assigns to it. é is U+00E9 — decimal 233. Unicode is a very large numbered catalogue of characters, and nothing more than that.',
          'An encoding is the rule for turning those numbers into bytes and back again. UTF-8 is one such rule; it is not the only one.',
        ],
      },
      {
        kind: 'p',
        text: 'Unicode says which characters exist and what number each one has. It does not say how to store them. That separation is the part most explanations skip, and treating “Unicode” and “UTF-8” as the same thing is the root of a surprising amount of confusion.',
      },
      { kind: 'h2', text: 'Why one byte was never going to be enough' },
      {
        kind: 'p',
        text: 'ASCII assigned 128 characters — English letters, digits, punctuation and control codes — into seven bits. Everything beyond that was bolted on by reusing the upper half of a byte differently in each region: one set of extra characters for Western Europe, another for Cyrillic, another for Greek. The byte 233 meant é in one and something else entirely in another, and nothing inside the file said which.',
      },
      {
        kind: 'p',
        text: 'That is the original sin of text encoding: the bytes carried no indication of how to read them. Documents were interpreted correctly by convention, configuration and luck.',
      },
      { kind: 'h2', text: 'How UTF-8 works, and why it won' },
      {
        kind: 'p',
        text: 'UTF-8 encodes a code point in one to four bytes. The first 128 code points — all of ASCII — encode as a single byte with the identical value, so every ASCII file is already valid UTF-8. Above that, the leading byte announces how many bytes follow, and each continuation byte is marked as a continuation.',
      },
      {
        kind: 'code',
        caption: 'One character, three ways of looking at it',
        code: 'char   code point   UTF-8 bytes        length\nA      U+0041       41                 1 byte\né      U+00E9       C3 A9              2 bytes\n€      U+20AC       E2 82 AC           3 bytes\n🙂     U+1F642      F0 9F 99 82        4 bytes',
      },
      {
        kind: 'p',
        text: 'That design has a property worth appreciating: it is self-synchronising. Because a continuation byte is distinguishable from a leading byte, you can drop into the middle of a UTF-8 stream and find the start of the next character without reading from the beginning. Combined with being byte-identical to ASCII for the first 128 characters, that is the real reason it won.',
      },
      {
        kind: 'tool',
        lead: 'Encode text and inspect the bytes underneath it:',
        slug: 'base64-converter',
      },
      { kind: 'h2', text: 'Mojibake: the right bytes, the wrong rule' },
      {
        kind: 'p',
        text: 'The garbled text has a name — mojibake — and the mechanism is always the same. Bytes written as UTF-8 are read as though they were a single-byte encoding. The two bytes C3 A9, which together mean é in UTF-8, are read individually as Ã and © in Latin-1. Hence the famous “Ã©”.',
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'A quick diagnostic: if you see Ã, Â or â€™ scattered through otherwise sensible text, you are almost certainly looking at UTF-8 bytes displayed as Latin-1 or Windows-1252. The stored data is usually intact and only the interpretation is wrong, which means it can often be fixed by decoding correctly rather than by retyping anything.',
      },
      {
        kind: 'p',
        text: 'The worse variant is double encoding, where already-correct text is encoded a second time. Now the corruption is baked into the stored bytes, and recovering it means reversing the exact sequence of mistakes rather than simply reading them properly.',
      },
      { kind: 'h2', text: 'Where it actually bites' },
      {
        kind: 'ul',
        items: [
          'CSV files opened in Excel. A UTF-8 CSV with no byte-order mark is often read using the machine’s legacy encoding, mangling every accented name in the file. This is the entire reason so many exports include a BOM they otherwise would not want.',
          'MySQL’s utf8. The encoding historically named utf8 in MySQL stores at most three bytes per character, so it cannot hold anything outside the Basic Multilingual Plane — which includes every emoji. The one you actually want is utf8mb4.',
          'URLs. A URL carries percent-encoded bytes, and those bytes should be UTF-8 before encoding. Percent-encoding an already-encoded string produces %25XX sequences that will not decode back to the original.',
          'Form posts and HTTP responses where the declared charset and the actual bytes disagree — the declaration wins, and the content loses.',
        ],
      },
      {
        kind: 'tool',
        lead: 'See exactly how a string becomes percent-encoded bytes:',
        slug: 'url-encoder',
      },
      { kind: 'h2', text: 'The same text, two different byte sequences' },
      {
        kind: 'p',
        text: 'Unicode allows some characters to be written more than one way. The character é can be the single code point U+00E9, or it can be a plain e followed by a combining acute accent, U+0065 U+0301. The two render identically on screen and are not equal as strings.',
      },
      {
        kind: 'p',
        text: 'Normalisation resolves this by rewriting text into a canonical form: NFC composes toward single code points, NFD decomposes toward base characters plus combining marks. It matters any time text is compared, deduplicated or used as a key. macOS historically stored filenames decomposed while Linux stored them composed, which is why two filenames could look identical and stubbornly refuse to match.',
      },
      { kind: 'h2', text: 'How long is a string?' },
      {
        kind: 'p',
        text: 'There is no single answer, and the honest question is “in what unit”. A family emoji is one thing you can see, several code points joined by zero-width joiners, and more bytes again. The length of a string can legitimately be its byte count, its code-point count, or its count of user-perceived characters — grapheme clusters — and those three disagree constantly.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'Truncating by bytes or by code points can cut through the middle of a character or split a joined emoji, producing invalid output. If a field has a limit, decide which unit that limit is in — and when the value is shown to people, truncate by grapheme clusters.',
      },
      { kind: 'h2', text: 'The habits that avoid all of this' },
      {
        kind: 'ul',
        items: [
          'Use UTF-8 everywhere, and declare it explicitly — in the HTTP header, the meta tag, the database column and the connection itself.',
          'Decode bytes into text once, at the boundary where they arrive, and encode once on the way out. Keep everything in between as text, not bytes.',
          'Never guess an encoding from content when the source is capable of telling you.',
          'Normalise before comparing, and store the form you normalised to.',
        ],
      },
      {
        kind: 'p',
        text: 'Almost every encoding bug is a missing declaration somewhere, and the fix is nearly always to be explicit one layer earlier than felt necessary at the time.',
      },
    ],
    related: ['base64-converter', 'url-encoder', 'csv-viewer'],
    relatedGuides: ['base64-explained', 'hashing-vs-encryption-vs-encoding'],
  },

  {
    slug: 'certificates-and-the-chain-of-trust',
    title: 'Certificates and the chain of trust: what a certificate authority actually vouches for',
    description:
      'What a TLS certificate contains, why the chain has intermediates, how little a CA really verifies, and what the warnings you see actually mean.',
    category: 'Security',
    readingMinutes: 10,
    updated: '2026-09-07',
    published: '2026-09-07',
    intro: [
      'The HTTPS handshake ends with your browser deciding whether to trust a certificate it has never seen, presented by a server it has never contacted. That decision rests on a chain of signatures reaching back to a small set of authorities your device already trusts.',
      'This guide is about that chain: what a certificate actually claims, who checked the claim, and what the everyday errors really mean.',
    ],
    blocks: [
      { kind: 'h2', text: 'A certificate is a signed statement' },
      {
        kind: 'p',
        text: 'Strip away the format and a certificate says one sentence: this public key belongs to whoever controls these hostnames, until this date — signed by somebody else. The signature is the only thing that makes it worth anything. Anyone can generate a key pair and write that sentence about themselves; that is a self-signed certificate, and it is exactly as trustworthy as the stranger who handed it to you.',
      },
      {
        kind: 'ul',
        items: [
          'The subject: the hostnames it covers, listed in the Subject Alternative Name extension. The older Common Name field is legacy, and browsers no longer rely on it.',
          'The public key — whose matching private key the server must separately prove it holds.',
          'A validity window: not before, not after.',
          'The issuer, and the issuer’s signature over everything above.',
        ],
      },
      { kind: 'h2', text: 'Why there is a chain rather than one signature' },
      {
        kind: 'p',
        text: 'Your browser and operating system ship with a set of root certificates. Roots are enormously valuable and effectively irreplaceable: removing one breaks every certificate beneath it, and getting a trust-store update onto billions of devices takes years. So roots are kept offline — often literally in a safe, used in ceremonies — and sign almost nothing directly.',
      },
      {
        kind: 'p',
        text: 'Intermediates do the day-to-day work. A server presents its own leaf certificate together with the intermediates needed to link it up to a root, and the browser supplies the root from its own store. If an intermediate key is ever compromised it can be revoked and replaced without disturbing the root everybody depends on.',
      },
      {
        kind: 'code',
        caption: 'The chain, from what your browser already trusts down to the site',
        code: 'Root CA           in the browser trust store · offline · lives for decades\n  └─ Intermediate  online · signs day to day · replaceable\n       └─ Leaf     yourdomain.com · valid for weeks, not years',
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'The server must send the intermediates. It should not send the root: the client already has it, and a root supplied by the server proves nothing at all — you cannot vouch for yourself by handing over your own reference.',
      },
      { kind: 'h2', text: 'What the authority actually checks' },
      {
        kind: 'p',
        text: 'Far less than most people assume. For an ordinary certificate the authority verifies exactly one thing: that whoever asked controls the domain. That is demonstrated by publishing a specific token at a specific URL on the domain, or a specific DNS record beneath it. It is called domain validation, and it says nothing whatsoever about the company behind the site, its honesty, or whether it is safe to give it your card details.',
      },
      {
        kind: 'p',
        text: 'Organisation and extended validation certificates do involve checking company records, and once bought a green company name in the address bar. Browsers removed that indicator, because studies showed users did not notice it and its absence did not deter them — it was not preventing the fraud it existed to prevent. Today an EV certificate looks identical to any other from the visitor’s side.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'A valid certificate proves the operator controlled that domain at the moment of issue. That is the whole claim. A phishing site on a lookalike domain obtains a perfectly valid certificate in minutes — the padlock is not a safety rating, and never was.',
      },
      { kind: 'h2', text: 'How issuance works now' },
      {
        kind: 'p',
        text: 'Certificates used to be a manual purchase with a manual renewal, which is why so many outages were somebody forgetting. The ACME protocol automated the whole exchange: a client requests a certificate, the authority issues a challenge, the client proves domain control by satisfying it, and the certificate is issued — with renewal running down the same automated path.',
      },
      {
        kind: 'p',
        text: 'That automation is why certificate lifetimes have collapsed from years to around ninety days, and are heading shorter still. Short lifetimes limit how long a stolen key stays useful, and they are only tolerable because nobody has to renew by hand any more.',
      },
      { kind: 'h2', text: 'Revocation, and why it is weaker than you would like' },
      {
        kind: 'p',
        text: 'If a private key leaks, the certificate ought to be revoked. In practice revocation has never worked well. Revocation lists grew large and slow to distribute. OCSP asked the authority about a specific certificate in real time, which is both a privacy leak — the authority learns which sites you visit — and a hard dependency on a third party being reachable. Browsers largely treated a failed check as success, because the alternative was breaking the web on every network hiccup.',
      },
      {
        kind: 'p',
        text: 'The industry’s practical answer has been to lean on short lifetimes instead: a certificate that expires within weeks bounds the damage without needing a reliable revocation channel at all. OCSP stapling, where the server presents a recent signed assurance itself, improves matters where it is deployed.',
      },
      { kind: 'h2', text: 'The errors you will actually meet' },
      {
        kind: 'ul',
        items: [
          'Expired — much the commonest, and almost always a renewal job that failed quietly. Monitor expiry as a metric with an alert, not as a note in somebody’s calendar.',
          'Name mismatch — the certificate does not cover the hostname that was requested. Often the apex domain is covered but www is not, or the reverse.',
          'Incomplete chain — the server did not send its intermediates. This is the genuinely confusing one, and it deserves its own paragraph below.',
          'Untrusted root — the chain terminates somewhere the client does not trust. Normal for an internal corporate CA, alarming on the public internet.',
          'Self-signed — no authority involved at all. Fine for local development, meaningless as public assurance.',
        ],
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'An incomplete chain often looks fine in a browser and fails everywhere else. Browsers cache intermediates they have seen before and can quietly fill the gap, while curl, a JVM, a mobile app or a payment provider cannot. “It works in my browser” is not a test of chain completeness — check from something that has never visited the site.',
      },
      { kind: 'h2', text: 'What to check when something breaks' },
      {
        kind: 'ol',
        items: [
          'Read the actual error rather than the icon. Expiry, hostname and chain failures look almost identical in a browser and have completely different fixes.',
          'Test from outside a browser, so a cached intermediate cannot hide an incomplete chain from you.',
          'Confirm the Subject Alternative Name list covers every hostname you serve, including both the apex and www if you use both.',
          'Confirm the server sends the full chain, leaf first and intermediates after it, with the root left out.',
        ],
      },
      {
        kind: 'p',
        text: 'The system is a chain of signatures, and its weakest property is the one people most often over-read. It establishes that you are talking to the domain you asked for, over a connection nobody in between can read or alter. It says nothing at all about whether that domain deserves what you are about to send it.',
      },
    ],
    related: ['hash-generator', 'jwt-decoder', 'base64-converter'],
    relatedGuides: ['https-explained', 'password-storage-explained'],
  },
];

/** Fast slug → guide lookup for the detail route. */
export const GUIDE_BY_SLUG: Record<string, Guide> = Object.fromEntries(
  GUIDES.map((guide) => [guide.slug, guide]),
);
