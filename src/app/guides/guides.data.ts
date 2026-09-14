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
  {
    slug: 'pdf-internals-explained',
    title: 'What is actually inside a PDF, and why that explains its quirks',
    description:
      'A PDF is a set of drawing instructions, not a document. That single fact explains broken text extraction, why pages rearrange cheaply, where the size goes, and why black boxes do not redact.',
    category: 'Documents',
    readingMinutes: 11,
    updated: '2026-09-11',
    published: '2026-09-11',
    intro: [
      'Almost every complaint about PDFs — copied text arriving as gibberish, a two-page file weighing nine megabytes, a redaction that turned out not to be one — comes from the same misunderstanding. People expect a PDF to be a document, a structured thing made of words and paragraphs. It is not. It is closer to a program that describes how to paint a page.',
      'This guide is about what is really in the file, and how each of those familiar annoyances falls out of it.',
    ],
    blocks: [
      { kind: 'h2', text: 'A file of objects, not a stream of text' },
      {
        kind: 'p',
        text: 'A PDF is a collection of numbered objects: dictionaries, arrays, numbers, strings and streams of compressed data. Pages are objects that point at other objects for their content, fonts and images. At the end of the file sits a cross-reference table giving the byte offset of every object, and after that a trailer saying where the catalogue begins. A reader does not read a PDF front to back — it jumps to the end, reads the table, and then seeks directly to whatever it needs.',
      },
      {
        kind: 'code',
        caption: 'A page object, pointing at everything it needs',
        code: '3 0 obj\n<< /Type /Page\n   /Parent 2 0 R\n   /MediaBox [0 0 595 842]     % A4, in points\n   /Resources << /Font << /F1 5 0 R >> >>\n   /Contents 4 0 R            % the drawing instructions\n>>\nendobj',
      },
      {
        kind: 'p',
        text: 'That structure is why a PDF opens instantly at page 400 of 500 without reading the first 399, and it is also the root of everything below.',
      },
      { kind: 'h2', text: 'Why copied text so often comes out wrong' },
      {
        kind: 'p',
        text: 'The content stream does not contain sentences. It contains instructions of the form "select this font, move to this coordinate, draw these glyph codes". There are no words, no lines, no paragraphs and no reading order — only marks placed at positions. What looks like a column of prose to you is, to the file, a few hundred independent placements that happen to line up.',
      },
      {
        kind: 'p',
        text: 'Extracting text therefore means reconstructing something the file never recorded. A reader groups glyphs by position, guesses where the spaces are from the gaps, and guesses the reading order from the layout — which is why text copied out of a two-column paper interleaves the columns, and why tables paste as a run of numbers.',
      },
      {
        kind: 'p',
        text: 'There is a second failure underneath that one. The glyph codes in the stream are indices into a font, not characters. A PDF can include a ToUnicode map saying which character each glyph index corresponds to, and when that map is missing or wrong — common with subsetted fonts, and with files produced by some typesetting tools — extraction produces confident nonsense. That is the origin of the classic symptom where a PDF looks perfect and copies out as garbage.',
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'It is worth knowing which of the two you are looking at. If text is selectable but pastes as the wrong characters, the ToUnicode map is the problem and no amount of better software will fix that file. If nothing is selectable at all, the page is an image and what you want is OCR.',
      },
      { kind: 'tool', lead: 'Open a PDF and see what is actually selectable:', slug: 'pdf-viewer' },
      { kind: 'h2', text: 'Cheap to rearrange, expensive to edit' },
      {
        kind: 'p',
        text: 'Because a page is an object and a document is a list of references to pages, reordering, rotating, deleting, splitting and merging are all shallow operations. Nothing about the drawing instructions changes; only the list and the cross-reference table are rewritten. This is why those operations are fast, lossless, and can run entirely in a browser.',
      },
      {
        kind: 'p',
        text: 'Editing the text on a page is the opposite. There is no paragraph to re-flow — changing a word means recomputing glyph positions, and if the replacement is wider, deciding what moves. Editors that offer it are reconstructing a layout the file never described, which is why the results are so often subtly wrong. The reliable path for real edits is to change the source document and export again.',
      },
      {
        kind: 'tool',
        lead: 'Reorder, rotate or delete pages without touching their content:',
        slug: 'pdf-organizer',
      },
      { kind: 'h2', text: 'Where the megabytes actually are' },
      {
        kind: 'p',
        text: 'Text is tiny. A page of prose is a few kilobytes of instructions. When a PDF is large, the weight is almost always in one of three places.',
      },
      {
        kind: 'ul',
        items: [
          'Images. A scan at 600 dpi carries roughly four times the pixels of one at 300, for no readability gain on screen. Photographs stored without JPEG compression are the single most common cause of an alarming file size.',
          'Fonts. An embedded font can be subsetted to the glyphs actually used, or embedded whole. Whole copies of several weights of a family add up quickly, and a file that embeds fonts it never draws is not unusual.',
          'Everything that was never removed. Duplicate copies of the same logo on every page, thumbnails, and the older revisions described below.',
        ],
      },
      {
        kind: 'tool',
        lead: 'See where the size is going, and recompress what is worth recompressing:',
        slug: 'pdf-compress',
      },
      { kind: 'h2', text: 'Incremental updates, and the redaction that is not one' },
      {
        kind: 'p',
        text: 'A PDF can be modified by appending to it. The original bytes stay exactly where they were, a new set of objects is added at the end, and a new cross-reference table points at the newer versions. This is what makes signing possible — the signed bytes are still intact and verifiable — and it is also why a file can grow every time it is touched, carrying its own history with it.',
      },
      {
        kind: 'p',
        text: 'The consequence people meet the hard way concerns redaction. Drawing a black rectangle over a name adds a rectangle. It does not remove the text underneath, which is still an object in the file, still selectable, and still extractable by anyone who asks the file rather than looking at it. Genuine redaction removes the underlying content and rewrites the file without it.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'This has caused real disclosures in court filings, government releases and corporate reports — repeatedly, over many years, by organisations with lawyers. If you black something out, verify by selecting and copying the area afterwards, or by extracting the text of the finished file and searching it.',
      },
      { kind: 'h2', text: 'Scanned pages are pictures of documents' },
      {
        kind: 'p',
        text: 'A scan produces one image per page wrapped in PDF. Nothing in it is text: it cannot be searched, selected or extracted, and its size is the size of the images. OCR addresses this by recognising the shapes and adding an invisible text layer positioned over the picture, so the page looks identical and is now searchable.',
      },
      {
        kind: 'p',
        text: 'That layer is a best guess, and it is worth treating as one. Recognition errors are invisible precisely because the visible page is unchanged — the text you search is not the text you see.',
      },
      { kind: 'h2', text: 'What to carry away' },
      {
        kind: 'ul',
        items: [
          'Expect page operations to be fast and faithful, and text edits to be neither.',
          'If extraction misbehaves, work out first whether the page is text or an image; the two have completely different remedies.',
          'Look for size in the images before anywhere else, and scan at a resolution matched to how the file will be read.',
          'Never trust a drawn rectangle as redaction. Verify by extracting, not by looking.',
        ],
      },
    ],
    related: ['pdf-viewer', 'pdf-organizer', 'pdf-compress'],
    relatedGuides: ['compress-images-for-web', 'image-formats-explained'],
  },

  {
    slug: 'colour-on-the-web-explained',
    title: 'Colour on the web: hex, HSL, OKLCH, and why blends turn muddy',
    description:
      'What a hex code really is, why averaging two colours in sRGB looks wrong, why HSL lightness lies across hues, and what OKLCH fixes for palettes and contrast.',
    category: 'Design',
    readingMinutes: 10,
    updated: '2026-09-11',
    published: '2026-09-11',
    intro: [
      'Picking colours on the web is oddly frustrating for something so visual. Two shades that should be a matched pair look unbalanced. A gradient between two bright colours sags through grey in the middle. A palette built by nudging one number produces a set where half the entries look heavier than the rest.',
      'None of that is a lack of taste. It follows from the colour models involved, and most of it disappears once you know which model is lying to you and about what.',
    ],
    blocks: [
      { kind: 'h2', text: 'Hex is RGB, written differently' },
      {
        kind: 'p',
        text: 'A hex code is three bytes: how much red, how much green, how much blue, each from 0 to 255. There is nothing else in it. The eight-digit form adds a fourth byte for alpha, and the three-digit shorthand simply doubles each character. So hex and rgb() are the same numbers in different clothes, and converting between them is notation, not interpretation.',
      },
      {
        kind: 'code',
        caption: 'One colour, four ways of writing it',
        code: '#3B82F6        hex\n#3B82F6FF      hex with alpha\nrgb(59 130 246)\nhsl(217 91% 60%)   same colour, different model',
      },
      { kind: 'h2', text: 'sRGB is not linear, and that is why blends look wrong' },
      {
        kind: 'p',
        text: 'The numbers in a hex code are not proportional to light. They are encoded with a curve, roughly a power of 2.2, which spends more of the available range on darker values because human vision discriminates better there. It is an efficient encoding, and it means arithmetic on those numbers is not arithmetic on light.',
      },
      {
        kind: 'p',
        text: 'Averaging two colours by averaging their channels therefore does not give the colour halfway between them; it gives something darker and less saturated. The familiar demonstration is a gradient from pure red to pure green, which in plain sRGB passes through a murky olive rather than a bright yellow. Interpolating in a linear or perceptual space instead fixes it — which is what modern CSS gradient interpolation and the newer colour spaces are for.',
      },
      { kind: 'h2', text: 'HSL made picking easier and lightness dishonest' },
      {
        kind: 'p',
        text: 'HSL rearranges the same sRGB colours into hue, saturation and lightness, which is far better for humans: hue is a dial, and lighter or darker is one number. It is the reason HSL became the default way to reason about a palette.',
      },
      {
        kind: 'p',
        text: 'Its lightness, though, is a geometric construction rather than a perceptual one, and it is not comparable across hues. Yellow at 50% lightness is glaringly bright; blue at exactly the same 50% is dark. So a palette built by holding lightness constant and rotating the hue produces a set that looks wildly uneven, and a "same tone" pairing chosen this way will not read as one.',
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'This is the single most common source of palettes that feel off. If a row of swatches at identical HSL lightness looks like some are heavier than others, nothing is wrong with your eyes — the number means different things at different hues.',
      },
      { kind: 'h2', text: 'What OKLCH fixes' },
      {
        kind: 'p',
        text: 'OKLCH describes a colour as perceptual lightness, chroma (how colourful) and hue. The important property is that its lightness is meant to match perception: two colours at the same L look equally light, whatever their hue. Holding L fixed and moving the hue gives a genuinely balanced set, which is what you wanted from HSL and did not get.',
      },
      {
        kind: 'p',
        text: 'It also makes systematic palettes straightforward. A ramp from a base colour becomes a series of steps in L, which stay even across every hue in the system, rather than a set of hand-tuned values that only look right for one of them. Interpolating in OKLCH keeps gradients bright through the middle for the same reason.',
      },
      {
        kind: 'tool',
        lead: 'Convert between hex, RGB, HSL and OKLCH, and check contrast:',
        slug: 'color-converter',
      },
      { kind: 'h2', text: 'Contrast is a floor, not a target' },
      {
        kind: 'p',
        text: 'WCAG contrast is a ratio between the relative luminance of two colours: at least 4.5 to 1 for normal text at AA, 3 to 1 for large text, 7 to 1 at AAA. It is computed from the colours alone, which makes it checkable and is exactly why it became the standard.',
      },
      {
        kind: 'p',
        text: 'It is also a blunt instrument. The formula knows nothing about font weight, size beyond the large-text threshold, or the surrounding page, so thin light text can pass while being genuinely hard to read, and some combinations that pass are unpleasant at length. Treat the ratio as the minimum you must clear rather than evidence that a pairing is good.',
      },
      { kind: 'h2', text: 'Beyond sRGB' },
      {
        kind: 'p',
        text: 'Most screens sold now can display more saturated colours than sRGB can describe, and CSS can address them through wider spaces such as display-p3 and through OKLCH, which is not bounded by sRGB at all. A colour specified that way can be more vivid than any hex code.',
      },
      {
        kind: 'p',
        text: 'The caveat is that a colour outside a display gamut has to be mapped back into it, and different browsers and screens will not agree on exactly how. Where the precise shade matters — a brand colour — specify what you mean and provide an sRGB fallback, rather than assuming everyone sees the wide-gamut version.',
      },
      { kind: 'h2', text: 'Rules that save the most trouble' },
      {
        kind: 'ul',
        items: [
          'Build palettes in OKLCH and keep lightness as the thing you vary deliberately.',
          'Do not compare HSL lightness across different hues; it is not the same quantity.',
          'Interpolate gradients in a perceptual space when the midpoint matters.',
          'Check contrast, then look at the result anyway — passing is necessary, not sufficient.',
          'Hex remains perfectly good for storing and pasting a colour. It is reasoning in hex that goes wrong.',
        ],
      },
    ],
    related: ['color-converter', 'image-converter', 'image-compressor'],
    relatedGuides: ['image-formats-explained', 'compress-images-for-web'],
  },

  {
    slug: 'csv-explained',
    title: 'CSV explained: delimiters, quoting, encodings and why Excel mangles your file',
    description:
      'What a CSV really is, why the delimiter is not always a comma, the quoting rule most hand-written parsers break, and the five ways Excel silently corrupts one.',
    category: 'Data formats',
    readingMinutes: 10,
    updated: '2026-09-14',
    published: '2026-09-14',
    intro: [
      'CSV is the oldest data format still in daily use and the one with the fewest rules. That is why it is everywhere — every database, spreadsheet and script can produce one — and why the same file can open perfectly on one machine and arrive as garbage on another.',
      'This guide covers what a CSV actually contains, where the traps are, and why Excel in particular has a habit of quietly rewriting your data. If you have ever lost the leading zeros from a column of postcodes, this is the article that explains it.',
    ],
    blocks: [
      { kind: 'h2', text: 'What a CSV actually is' },
      {
        kind: 'p',
        text: 'A CSV file is plain text: one record per line, with the fields of each record separated by a delimiter. There is no header rule, no type system and no metadata — the file does not know whether its first line is column names or data, or whether "42" is a number or a product code. RFC 4180 is the nearest thing to a specification, and it was written in 2005 to describe what programs were already doing rather than to define a format. Every reader is therefore a little tolerant, a little opinionated, and slightly different from every other.',
      },
      { kind: 'h2', text: 'The delimiter is not always a comma' },
      {
        kind: 'p',
        text: 'In much of Europe the comma is the decimal mark, so 3,14 is a number and cannot also be a field separator. Excel in those locales writes and expects semicolons instead, and a file made in Paris will open as a single column in London. Tab-separated files are common in exports from databases and scientific instruments, and the pipe character turns up in older systems.',
      },
      {
        kind: 'p',
        text: 'Good readers sniff the delimiter rather than assuming it: they count how many commas, semicolons and tabs appear on each of the first few lines and pick the one that gives the most consistent field count. That is what a viewer is doing when it opens a semicolon file correctly without being told.',
      },
      {
        kind: 'tool',
        lead: 'Open any CSV and see which delimiter was detected:',
        slug: 'csv-viewer',
      },
      { kind: 'h2', text: 'Quoting: the one rule everyone gets wrong' },
      {
        kind: 'p',
        text: 'A field that contains the delimiter, a double quote or a line break has to be wrapped in double quotes, and any double quote inside it is written twice. That is the whole rule. An address with a comma in it, a product description with a quotation, a note that spans two lines — each is one field, and a compliant writer quotes it.',
      },
      {
        kind: 'code',
        code: 'name,address,note\n"Smith, John","12 High Street\nLondon","She said ""hello"""',
        caption:
          'Three fields on the second record: a comma inside a name, a line break inside an address, quotes inside a note.',
      },
      {
        kind: 'p',
        text: 'The classic failure is a reader that splits each line on the delimiter and calls it done. It works on the sample file, ships, and then the first customer with a comma in their address shifts every column after it one place to the right. Line breaks inside quotes break it a second way: the record is cut in half and the second half appears as a new, malformed row.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'Never parse CSV with a plain split on the delimiter. Use a real parser — every language has one — and it will handle quoting, embedded line breaks and the delimiter sniffing for you.',
      },
      { kind: 'h2', text: 'There are no types' },
      {
        kind: 'p',
        text: 'Every cell in a CSV is text. Whether it becomes a number, a date or a boolean is a decision the reader makes on the way in, and the two obvious policies both have victims. Convert eagerly and a postcode like 00420 becomes 420, a phone number loses its leading plus, and a part number such as 1E5 turns into 100000. Convert nothing and every figure in a spreadsheet of sales arrives as a string that has to be cast before it can be summed.',
      },
      {
        kind: 'p',
        text: 'The only safe answer is to make it a choice. Detect types when the file is figures, keep everything as text when it carries identifiers, and look at the first few rows before deciding — which is exactly the switch a converter should expose rather than hide.',
      },
      {
        kind: 'tool',
        lead: 'Convert a CSV to JSON with types detected or left alone, and back again:',
        slug: 'json-csv',
      },
      { kind: 'h2', text: 'Encodings and the byte-order mark' },
      {
        kind: 'p',
        text: 'A CSV is bytes, and bytes need an encoding to become letters. Almost everything written today is UTF-8, but Excel on Windows assumes the machine’s legacy code page unless told otherwise, so a UTF-8 file with an accented name opens as caf├⌐ instead of café. The traditional fix is to start the file with a byte-order mark — three bytes, EF BB BF — which Excel recognises as a UTF-8 signal.',
      },
      {
        kind: 'p',
        text: 'The BOM has its own cost: a naive parser treats those bytes as part of the first header, so the first column is named "﻿name" and lookups for "name" quietly fail. If a file’s first column will not match no matter how you spell it, this is usually why.',
      },
      { kind: 'h2', text: 'Why Excel mangles your file' },
      {
        kind: 'p',
        text: 'Excel does not open a CSV; it imports one, applying every automatic conversion it has, and then saves whatever it decided. The results are well known enough to have names.',
      },
      {
        kind: 'ul',
        items: [
          'Leading zeros are dropped, because the cell became a number. Postcodes, account numbers and zero-padded IDs all suffer.',
          'Long digit strings become scientific notation and are rounded to fifteen significant digits. A sixteen-digit card or order number is permanently corrupted the moment the file is saved.',
          'Anything that looks like a date becomes one. The most famous casualty is genetics: gene names such as SEPT1 and MARCH1 were converted to dates in so many published papers that the naming committee renamed the genes.',
          'The delimiter and the decimal mark follow the machine’s locale, so a file saved on one computer may not open correctly on the next.',
          'The encoding follows the locale too, unless a byte-order mark is present.',
        ],
      },
      {
        kind: 'p',
        text: 'The way around it is to import rather than open — Data, then From Text — and set each column’s type by hand, or to keep two files: an .xlsx for people, which stores types and formatting properly, and a CSV for machines, generated from the data rather than saved out of Excel.',
      },
      {
        kind: 'tool',
        lead: 'Open an .xlsx directly, with its types and formatting intact:',
        slug: 'excel-viewer',
      },
      { kind: 'h2', text: 'When CSV is the wrong choice' },
      {
        kind: 'p',
        text: 'CSV is a table and nothing more. Data with nesting — an order with its line items, a person with several addresses — has to be flattened, joined or spread across several files, and every reader has to know the scheme. Types are lost on every trip. For anything that needs structure, JSON is the honest format; for very large analytical data, columnar formats such as Parquet keep the types and compress far better.',
      },
      {
        kind: 'p',
        text: 'What CSV keeps winning on is reach. It can be produced by anything, read by anything, streamed a line at a time, inspected in a text editor and diffed in version control. For a flat table that has to travel between systems that will never agree on anything else, it remains the right answer — as long as it is written with quotes, read with a real parser, and never round-tripped through a spreadsheet by accident.',
      },
    ],
    related: ['csv-viewer', 'json-csv', 'excel-viewer'],
    relatedGuides: ['character-encoding-explained'],
  },
  {
    slug: 'docx-files-explained',
    title:
      'Inside a Word file: why .docx is a ZIP, and what that means for viewing, converting and privacy',
    description:
      'Rename a .docx to .zip and look inside: XML for the text, a separate file for styles, and a metadata file that knows who edited it. What that structure explains.',
    category: 'Documents',
    readingMinutes: 10,
    updated: '2026-09-14',
    published: '2026-09-14',
    intro: [
      'A Word document is not one thing. It is a folder of XML files, images and relationship maps, compressed into a ZIP archive and given the extension .docx. That single fact explains most of what people find strange about Word files: why a search finds nothing in text you can see, why the same file paginates differently on two machines, and why a document can carry the name of everyone who ever touched it.',
      'This guide opens one up, shows what is inside, and follows the consequences through to viewing, converting to PDF and what you should check before sending a document to someone outside your organisation.',
    ],
    blocks: [
      { kind: 'h2', text: 'Rename it to .zip and look inside' },
      {
        kind: 'p',
        text: 'Take any .docx, change the extension to .zip and extract it. Since 2007, Word has used the Office Open XML format, and what comes out is a small tree of plain-text files.',
      },
      {
        kind: 'code',
        code: '[Content_Types].xml\n_rels/.rels\nword/document.xml\nword/styles.xml\nword/settings.xml\nword/media/image1.png\nword/_rels/document.xml.rels\ndocProps/core.xml\ndocProps/app.xml',
        caption:
          'A typical .docx, unzipped. The body text is document.xml; everything else supports it.',
      },
      {
        kind: 'p',
        text: 'The body of the document is word/document.xml. Styles — what "Heading 1" means — live in styles.xml. Images are ordinary files under media, referenced by ID from a relationships file rather than embedded in the text. The docProps folder holds the metadata. Nothing is hidden or encrypted; the format is documented and open, which is why so many programs other than Word can read it.',
      },
      { kind: 'h2', text: 'The text is XML, and it is more fragmented than it looks' },
      {
        kind: 'p',
        text: 'Inside document.xml, every paragraph is a w:p element containing one or more runs, w:r, each holding a stretch of text, w:t, with the same formatting. A sentence in a single font would ideally be one run. In practice Word splits runs constantly — at a spelling-check boundary, where the proofing language changed, where a tracked edit once happened — so a single word is often three runs.',
      },
      {
        kind: 'code',
        code: '<w:p>\n  <w:r><w:t>Invoice </w:t></w:r>\n  <w:r><w:rPr><w:b/></w:rPr><w:t>overdue</w:t></w:r>\n</w:p>',
        caption:
          'One paragraph, two runs: the second is bold. Real documents split far more often than this.',
      },
      {
        kind: 'p',
        text: 'This is why naive tools that search the XML for a phrase find nothing: the phrase is there, but scattered across elements with tags in between. A correct find-and-replace has to stitch the runs together, match across them, and then rewrite the runs without losing which parts were bold. Most template-filling bugs — a placeholder that was not replaced — come from exactly this.',
      },
      { kind: 'h2', text: 'Why viewing a Word file is genuinely hard' },
      {
        kind: 'p',
        text: 'A .docx stores content and formatting, but not layout. There is no record of where line breaks fall or which paragraph starts page three. All of that is computed when the file opens, from the fonts installed, their exact metrics, the printer’s page size and dozens of settings in settings.xml that change how Word measures things. Two machines with a different version of Calibri can paginate the same file differently, and a machine without the font substitutes one and reflows everything.',
      },
      {
        kind: 'p',
        text: 'A browser-based viewer therefore faces a choice: approximate the layout with HTML and CSS, which is fast and private but drifts on anything complex, or run a full layout engine that understands the format the way Word does. The Word Viewer on this site takes the second route through a hosted document engine — which is the one honest exception to the rest of the site running in your tab, and the page says so.',
      },
      {
        kind: 'tool',
        lead: 'Open a .docx and see it laid out as Word would:',
        slug: 'word-viewer',
      },
      { kind: 'h2', text: 'Converting to PDF freezes the layout' },
      {
        kind: 'p',
        text: 'A PDF is the opposite kind of file: it stores positions, not intentions. Converting a Word document to PDF is precisely the layout pass — fonts are measured, lines are broken, pages are cut — with the result written down so it never has to be computed again, and the fonts embedded so it looks the same on a machine that has never heard of them. That is why a PDF is what you send when the appearance must not change, and a .docx is what you send when the recipient needs to edit.',
      },
      {
        kind: 'tool',
        lead: 'Convert a Word, Excel or PowerPoint file to a PDF that looks the way Office lays it out:',
        slug: 'office-to-pdf',
      },
      { kind: 'h2', text: 'What a .docx knows about you' },
      {
        kind: 'p',
        text: 'Open docProps/core.xml and you will find the creator, the last person to modify the file, the revision number and the creation and modification times. app.xml adds the total editing time in minutes and sometimes the company name the copy of Word was registered to. Comments live in their own file and tracked changes are recorded inline, so a document sent with revisions "hidden" rather than accepted still contains every deleted sentence. Images under media keep whatever metadata they had when they were inserted, including a phone photo’s location.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'Before a document leaves your organisation, run Word’s Document Inspector (File, Info, Check for Issues) or export to PDF with comments and markup turned off. A .docx sent as-is can reveal who wrote it, how long it took, what was deleted, and the internal name the file started with.',
      },
      { kind: 'h2', text: 'The old .doc is a different animal, and .docm has teeth' },
      {
        kind: 'p',
        text: 'Files with the older .doc extension are not ZIPs and contain no XML. They use a binary compound-file format that is far harder to read, which is why converters exist and why many tools simply refuse it. A .docm is a .docx that is allowed to carry macros — the m is the only difference, and it is the reason mail filters treat the two so differently. If you did not expect a macro, do not enable it.',
      },
      {
        kind: 'ul',
        items: [
          'Need someone to edit it — send the .docx.',
          'Need it to look identical everywhere — convert to PDF first.',
          'Need to be sure nothing private travels with it — inspect the metadata and comments, or send a clean PDF.',
          'Received a .docm you were not expecting — treat it as executable.',
        ],
      },
    ],
    related: ['word-viewer', 'office-to-pdf', 'pdf-convert'],
    relatedGuides: ['pdf-internals-explained', 'photo-metadata-privacy'],
  },
  {
    slug: 'favicons-and-app-icons-explained',
    title: 'Favicons and app icons: every size a site needs, and what each platform actually uses',
    description:
      'Why a website is asked for its icon in seven sizes, which file each browser and phone really picks, what "maskable" means, and why a new icon refuses to show up.',
    category: 'Design',
    readingMinutes: 9,
    updated: '2026-09-14',
    published: '2026-09-14',
    intro: [
      'The favicon started as one 16-pixel .ico file that Internet Explorer looked for at the root of a site. Thirty years later, the same small picture is requested by browser tabs, bookmark lists, iPhone home screens, Android launchers, Windows start menus, install prompts and search results — each with its own preferred size, format and rules about transparency.',
      'This guide is the map: what each platform asks for, which of the files it will actually use, how to declare them, and the two problems that catch nearly everyone — the maskable safe zone and the cache.',
    ],
    blocks: [
      { kind: 'h2', text: 'Where the icon shows up' },
      {
        kind: 'ul',
        items: [
          'The browser tab, the bookmark bar and the history list — tiny, usually 16 or 32 pixels.',
          'An iPhone or iPad home screen, when someone adds the site — 180 pixels, always opaque.',
          'An Android launcher and the "install this app" prompt — from the web manifest, 192 and 512 pixels.',
          'Search results: Google shows a site’s favicon beside its listing and wants at least 48 pixels, in a multiple of 48.',
          'Desktop shortcuts and pinned sites on Windows and macOS, which take the largest icon they can find.',
        ],
      },
      { kind: 'h2', text: 'The sizes, and why there are so many' },
      {
        kind: 'p',
        text: 'Nobody designed this list; it accumulated as each platform added its own requirement without removing anyone else’s. The practical set today is short enough to generate in one go and rarely changes.',
      },
      {
        kind: 'ul',
        items: [
          '16 and 32 pixels — browser tabs on standard and high-density displays. Bundled together in favicon.ico for the browsers and tools that still fetch it by name.',
          '48 pixels — the minimum Google will show beside a search result.',
          '180 pixels — apple-touch-icon.png, the iOS home screen. iOS ignores every other declaration.',
          '192 and 512 pixels — icon-192.png and icon-512.png, listed in the web manifest for Android and desktop installs.',
          'A second 512 marked maskable — the same artwork with extra margin, for launchers that crop icons into shapes.',
        ],
      },
      { kind: 'h2', text: 'ICO, PNG or SVG?' },
      {
        kind: 'p',
        text: 'An .ico file is a container: it can hold several bitmaps at different sizes, and the browser picks the one closest to what it needs. Modern .ico files hold PNG data inside, which keeps them small. It remains worth shipping because a long tail of software — RSS readers, link-preview bots, older bookmark managers — asks for /favicon.ico without reading your HTML at all.',
      },
      {
        kind: 'p',
        text: 'A PNG declared in the head is the ordinary choice for tabs, and an SVG is the best one where it works: it stays crisp at every size and density, and can even switch colours for dark tab bars using a media query inside the file. Every current browser supports SVG favicons, Safari having been last to arrive, which is why the safe pattern is to offer the SVG first and keep the .ico and PNG as fallbacks.',
      },
      {
        kind: 'code',
        code: '<link rel="icon" href="/favicon.ico" sizes="32x32">\n<link rel="icon" type="image/svg+xml" href="/icon.svg">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">\n<meta name="theme-color" content="#1a1a1a">',
        caption:
          'The head declarations that cover every platform. Browsers that understand SVG prefer it; the rest fall through to the .ico.',
      },
      { kind: 'h2', text: 'The web manifest and the maskable safe zone' },
      {
        kind: 'p',
        text: 'site.webmanifest is a small JSON file that tells Android and desktop browsers how the site should behave when installed: its name, the short name that fits under an icon, the colour of the browser chrome, and the list of icons. Each icon carries a purpose. "any" means the launcher shows it as drawn; "maskable" means the launcher may crop it into a circle, a rounded square or a squircle, depending on the phone.',
      },
      {
        kind: 'p',
        text: 'A maskable icon therefore needs margin. The specification defines a safe zone — a circle whose diameter is 80% of the icon — and promises only that this zone will survive the crop. Artwork that fills the square gets its corners cut off on one phone and its edges clipped on another. The right maskable icon is your logo scaled down to sit inside that circle on a solid background, and it will look oddly small until a launcher applies its shape, at which point it looks right.',
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'Do not mark one file as both "any" and "maskable" to save a request. A launcher that treats it as maskable will crop your full-bleed icon; one that treats it as "any" will show the padded version with a visible border. Two files, two purposes.',
      },
      {
        kind: 'tool',
        lead: 'Generate every size, the .ico, the manifest and the head snippet from one logo:',
        slug: 'favicon-generator',
      },
      { kind: 'h2', text: 'Why your new icon does not show up' },
      {
        kind: 'p',
        text: 'Favicons are cached more aggressively than almost anything else a browser fetches, and separately from the page cache, so a hard refresh often does nothing. Bookmarks keep the icon they were created with. Google keeps its own copy and refreshes it on its own schedule. The reliable fix is to change the file name — icon-v2.svg — or add a query string to the href, so every consumer sees a new URL. Waiting works too, but on no timetable you control.',
      },
      { kind: 'h2', text: 'Designing for sixteen pixels' },
      {
        kind: 'p',
        text: 'Almost any logo becomes a smudge at 16 pixels. The icons that survive are a single bold shape with strong contrast against both a light and a dark tab bar — which is worth testing, since many people run dark browser themes. Wordmarks and thin lines do not survive at all; if the full logo is a wordmark, make a separate mark for the small sizes and keep the full artwork for 180 pixels and up.',
      },
      {
        kind: 'ul',
        items: [
          'Start from a square SVG or a PNG of at least 512 pixels; icons are scaled down, never up.',
          'Ship the .ico, a PNG, the SVG if you have one, the apple-touch-icon and the manifest with both 512s.',
          'Give the maskable icon room and the iOS icon a solid background.',
          'Rename the file when you change the icon, and check it on a dark tab bar before you call it done.',
        ],
      },
    ],
    related: ['favicon-generator', 'image-resize', 'image-converter'],
    relatedGuides: ['image-formats-explained', 'colour-on-the-web-explained'],
  },
  {
    slug: 'xlsx-files-explained',
    title:
      'Inside an .xlsx file: shared strings, serial dates and the leap year that never happened',
    description:
      'A spreadsheet is a ZIP of XML with a string table and a date system that is deliberately wrong. Why Excel eats leading zeros and mangles long numbers.',
    category: 'Documents',
    readingMinutes: 11,
    updated: '2026-09-14',
    published: '2026-09-14',
    intro: [
      'An .xlsx file is not a grid. Like a .docx it is a ZIP archive full of XML, and the numbers you see on screen are stored separately from the formatting that decides whether 45914 is a quantity, a price or the fourteenth of September.',
      'That separation explains almost every strange thing Excel does with imported data: the dropped leading zeros, the product code that turned into a date, the card number ending in a zero it never had. This guide opens the file up and shows where each of those comes from.',
    ],
    blocks: [
      { kind: 'h2', text: 'Rename it to .zip and look inside' },
      {
        kind: 'p',
        text: 'The Office Open XML format, standardised in 2006, stores a workbook as an ordinary ZIP archive. Unzip one and you get a small tree of XML parts, each with one job. Nothing is encrypted and nothing is unreadable: any language with a ZIP library and an XML parser can read a spreadsheet.',
      },
      {
        kind: 'code',
        code: '[Content_Types].xml        what kind each part is\nxl/workbook.xml            sheet names, defined names, the date system\nxl/worksheets/sheet1.xml   the cells, by row\nxl/sharedStrings.xml       every distinct piece of text, once\nxl/styles.xml              number formats, fonts, fills, borders\nxl/calcChain.xml           the order formulas were evaluated in',
        caption:
          'The parts that matter in a typical workbook. A sheet with charts or images gains a few more.',
      },
      { kind: 'h2', text: 'The shared string table' },
      {
        kind: 'p',
        text: 'Text is rarely stored in the cell. Every distinct string in the workbook goes into sharedStrings.xml once, and the cell holds an index into that table, marked with the attribute t="s". A column of ten thousand rows containing three repeated statuses stores three strings and ten thousand small integers, which is why a text-heavy sheet compresses so well.',
      },
      {
        kind: 'code',
        code: '<c r="A2" t="s"><v>0</v></c>     <!-- text: shared string 0 -->\n<c r="B2"><v>1250.5</v></c>       <!-- a number, as written -->\n<c r="C2" s="3"><v>45914</v></c>  <!-- a number shown as a date by style 3 -->',
        caption:
          'Three cells. Only the style index tells you the third one is meant to be read as a date.',
      },
      {
        kind: 'p',
        text: 'This is the first practical consequence. A cell has a value and, separately, a style that decides how the value is displayed. Two cells holding exactly the same number can read as 45914, as 14/09/2026 and as a currency amount. Nothing in the value itself says which is right.',
      },
      { kind: 'h2', text: 'Dates are numbers, counted from a day that is off by one' },
      {
        kind: 'p',
        text: 'Excel stores a date as a serial number: the count of days since an epoch, with the time of day as the fraction after the decimal point. In the default 1900 system, serial 1 is the first of January 1900 and 0.5 means midday. Subtracting two dates gives you a number of days for free, which is the whole point of the design.',
      },
      {
        kind: 'p',
        text: 'It also contains a famous deliberate error. Excel believes the 29th of February 1900 existed. It did not, because the Gregorian rule skips centuries that are not divisible by 400. The bug came from Lotus 1-2-3 and Microsoft copied it so that files would interchange. Correcting it now would silently shift every date in every historical spreadsheet, so it has been preserved for forty years and will not be fixed.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'Dates before the 1st of March 1900 are therefore one day out when you convert serial numbers yourself. Old Mac versions used a second epoch entirely, the 1904 system, offset by exactly 1462 days. The workbook records which one it uses, and a converter that assumes 1900 turns a whole file into dates four years early.',
      },
      { kind: 'h2', text: 'The five ways an import gets corrupted' },
      {
        kind: 'p',
        text: 'Excel guesses a type for every value it reads from a CSV or a paste, and once it has guessed, the original characters are gone. The guesses are consistent and, once you know them, predictable.',
      },
      {
        kind: 'ol',
        items: [
          'Leading zeros disappear. The postcode 01234 is read as the number 1234, and so is an account reference, a phone number and a product code.',
          'Anything that looks like a date becomes one. Gene symbols such as SEPT1 and MARCH1 were converted so reliably that in 2020 the body responsible for human gene naming renamed dozens of genes rather than keep fighting spreadsheets.',
          'Long numbers lose precision. Excel keeps 15 significant digits, so a 16-digit card number or a long identifier comes back with a zero on the end and no warning at all.',
          'Very large or very small numbers switch to scientific notation, and often export that way too: 1234567890123456 becomes 1.23457E+15.',
          'Text that looks numeric is stored as a number, which then breaks the join you were about to do against a system that treats the same field as a string.',
        ],
      },
      {
        kind: 'p',
        text: 'The reliable fix is to stop letting it guess. Do not double-click a CSV. Use Data, then Get Data, then From Text/CSV, and in the import dialog set the type of every identifier column to Text before loading. That import path is also the only one that lets you choose the file encoding, which is the other half of the problem.',
      },
      {
        kind: 'tool',
        lead: 'Open a workbook in the browser and read the values as they are stored:',
        slug: 'excel-viewer',
      },
      { kind: 'h2', text: 'Formulas, and the answer stored beside them' },
      {
        kind: 'p',
        text: 'A formula cell stores two things: the formula text and the last calculated result. That cached value is what every non-Excel reader shows you, because evaluating a spreadsheet properly means implementing several hundred functions, iteration, and the dependency graph in calcChain.xml. It also means a file can be internally inconsistent. If something wrote new inputs without recalculating, the visible numbers are stale.',
      },
      {
        kind: 'p',
        text: 'When a sheet is exported to CSV or JSON, formulas are not carried across; only their results are. That is usually what you want, but it is a one-way door, and it is the reason a round trip through CSV quietly flattens a model into a report.',
      },
      {
        kind: 'tool',
        lead: 'Turn sheet data into JSON, or a JSON payload back into columns:',
        slug: 'json-csv',
      },
      { kind: 'h2', text: 'Why a small sheet is a big file' },
      {
        kind: 'ul',
        items: [
          'Styles are stored per cell. Formatting an entire column applies a style reference to every cell in it, empty or not.',
          'The used range is remembered. One stray character in row 40000 makes the sheet claim forty thousand rows forever, which is why the scroll bar goes tiny and why deleting those rows and saving is the fix.',
          'Images are embedded at full resolution. A screenshot pasted in is stored as pasted, not as displayed.',
          'Conditional formatting and data validation are stored per range, and ranges multiply every time someone copies a block of cells.',
        ],
      },
      { kind: 'h2', text: 'The other extensions' },
      {
        kind: 'p',
        text: 'A .xls is the older binary format and shares nothing with .xlsx beyond the application that opens it. A .xlsb is the modern structure with the XML replaced by a binary encoding, which is faster on very large workbooks and unreadable to most third-party tools. A .xlsm is an .xlsx that is permitted to carry macros: Visual Basic code stored in a part called vbaProject.bin that runs when the file is opened.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'An unexpected .xlsm is the spreadsheet equivalent of an unexpected program. If you did not ask for a macro, do not enable content, and save the file as .xlsx if you only need the numbers.',
      },
      { kind: 'h2', text: 'Which format to send' },
      {
        kind: 'ul',
        items: [
          'Someone will edit the formulas: send the .xlsx.',
          'Another program will read it: send CSV, and agree the encoding and the delimiter first.',
          'It must look identical everywhere and never recalculate: convert it to PDF.',
          'It contains identifiers rather than quantities: make sure they arrive as text at both ends.',
        ],
      },
    ],
    related: ['excel-viewer', 'json-csv', 'csv-viewer', 'office-to-pdf'],
    relatedGuides: ['csv-explained', 'docx-files-explained'],
  },
  {
    slug: 'qr-codes-explained',
    title: 'How a QR code works: finder patterns, error correction, and why yours will not scan',
    description:
      'What the three big squares are for, how a code survives being scratched, why uppercase URLs make smaller codes, and the printing mistakes that stop a scan.',
    category: 'Data formats',
    readingMinutes: 10,
    updated: '2026-09-14',
    published: '2026-09-14',
    intro: [
      'A QR code is a two-dimensional barcode invented in 1994 by Denso Wave to track car parts on a production line. The design brief was speed and damage tolerance: a scanner had to find the code at any angle, in a fraction of a second, on a part that might be oily or scratched.',
      'Everything visible in the pattern follows from that brief. This guide explains what each part of the square does, how much data one can hold, and the handful of reasons a code that looks fine refuses to scan.',
    ],
    blocks: [
      { kind: 'h2', text: 'The furniture: what the fixed patterns do' },
      {
        kind: 'p',
        text: 'Only some of the black and white squares, called modules, carry data. The rest are structural, and they are what lets a camera lock on to a code that is upside down, rotated forty degrees and photographed at an angle.',
      },
      {
        kind: 'ul',
        items: [
          'The three large squares in the corners are finder patterns. Their ratio of dark to light along any line through the centre is 1:1:3:1:1, a sequence that almost never occurs by accident in a photograph, so a scanner can find them fast. Three corners rather than four is what tells the scanner which way up the code is.',
          'The smaller squares dotted through larger codes are alignment patterns. They let the scanner correct for perspective and for paper that is curved rather than flat.',
          'The dashed lines of alternating modules between the finders are the timing patterns. They tell the scanner how big one module is, which is how it maps pixels to the grid.',
          'The strips beside the finders hold the format information: the error correction level and which mask was applied. That is stored twice, in two places, because losing it would make the rest unreadable.',
        ],
      },
      { kind: 'h2', text: 'Versions and sizes' },
      {
        kind: 'p',
        text: 'QR codes come in forty versions. Version 1 is 21 modules square, and each version adds four, so version 40 is 177 across. Encoders pick the smallest version that fits the data at the requested error correction level, which is why a code for a short link looks coarse and open while one carrying a paragraph looks like static.',
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'Coarser is better. A version 2 code has big modules that survive a cheap camera, a low-resolution printer and a sticker on a curved bottle. Every character you remove from the payload makes the code more robust, not just smaller.',
      },
      { kind: 'h2', text: 'Four encoding modes, and the uppercase trick' },
      {
        kind: 'p',
        text: 'The encoder chooses a mode based on what characters it sees, and the modes are wildly different in efficiency.',
      },
      {
        kind: 'ul',
        items: [
          'Numeric, for digits only: three digits in ten bits, about 3.3 bits each.',
          'Alphanumeric, for digits, uppercase A to Z, space and eight symbols: two characters in eleven bits, 5.5 bits each.',
          'Byte, for anything else, including any lowercase letter: eight bits per character.',
          'Kanji, a compact mode for Japanese characters at thirteen bits each.',
        ],
      },
      {
        kind: 'p',
        text: 'A single lowercase letter forces the whole segment into byte mode, which is why HTTPS://EXAMPLE.COM/PROMO produces a visibly simpler code than the same link in lowercase. Domain names are case-insensitive, so the uppercase version works identically. Paths are not case-insensitive, so only do this if you control the server and know the path is safe to fold.',
      },
      {
        kind: 'code',
        code: 'https://example.com/a/b   25 chars, byte mode      -> version 2\nHTTPS://EXAMPLE.COM/A/B   23 chars, alphanumeric   -> version 1',
        caption: 'The same destination, one version smaller and noticeably easier to scan.',
      },
      {
        kind: 'p',
        text: 'At the top end, a version 40 code at the lowest error correction holds roughly 7,089 digits, 4,296 alphanumeric characters or 2,953 bytes. Those numbers are theoretical: a code that dense needs a good printer and a steady camera, and almost nothing that belongs in a QR code is that long.',
      },
      { kind: 'h2', text: 'Error correction, and the logo in the middle' },
      {
        kind: 'p',
        text: 'QR codes use Reed-Solomon coding, the same family of mathematics that protected data on CDs. The payload is split into blocks and each block gets extra symbols that let a decoder rebuild missing or wrong modules. You choose how much of the code is given over to that redundancy.',
      },
      {
        kind: 'ul',
        items: [
          'Level L recovers about 7% of the code. Use it when the code is on a screen or clean paper and you want the smallest version.',
          'Level M recovers about 15%. The usual default and the right answer for most printed material.',
          'Level Q recovers about 25%. For labels that get handled, or a small logo overlay.',
          'Level H recovers about 30%. For industrial use, curved surfaces, and codes with a large logo in the centre.',
        ],
      },
      {
        kind: 'p',
        text: 'That redundancy is exactly why a logo can sit in the middle of a code. You are not adding the logo, you are damaging the code and relying on the error correction to cover it. The rule is simple: keep the covered area inside the budget of the level you chose, never cover a finder pattern or the timing lines, and test the result with more than one phone before printing ten thousand of them.',
      },
      {
        kind: 'tool',
        lead: 'Generate a code, pick the correction level and check it before you print:',
        slug: 'qr-generator',
      },
      { kind: 'h2', text: 'Masking, and why two codes for the same text differ' },
      {
        kind: 'p',
        text: 'Large blank areas and long runs of identical modules confuse scanners, and a pattern that accidentally resembles a finder is worse. So after laying out the data, the encoder applies one of eight mask patterns, an XOR over the data region, and scores the result against penalty rules. The mask that scores best is kept and its number recorded in the format information. Two encoders can legitimately choose differently, which is why the same URL can produce two visually different codes that both scan.',
      },
      { kind: 'h2', text: 'Why a code will not scan' },
      {
        kind: 'ol',
        items: [
          'No quiet zone. The specification requires four modules of clear space on every side. Designers crop it away constantly, and it is the single most common cause of a code that works on screen and fails in print.',
          'Too small for the distance. A rough rule is that the code should be about a tenth of the scanning distance: a poster read from two metres needs roughly twenty centimetres of code.',
          'Inverted colours. Light modules on a dark background break many scanners. Dark on light, with real contrast, always.',
          'Low contrast or a busy photo behind it. Red on black and pastel on white both fail, and so does a code printed over an image.',
          'Ink spread or low print resolution, which merges adjacent modules. Print at 300 dpi or better and keep modules at least 0.4 mm.',
          'Stretching. A QR code must stay square; scaling one axis destroys the module grid.',
          'A payload that the scanner will not act on. Some camera apps show a bare text payload but only offer to open recognised URL schemes.',
        ],
      },
      { kind: 'h2', text: 'Static and dynamic codes' },
      {
        kind: 'p',
        text: 'A static code contains the destination itself. It works forever, needs no service, and cannot be changed or tracked. A dynamic code contains a short link belonging to a redirect service, which forwards to the real destination. That buys you editable targets and scan analytics, and it costs you a permanent dependency: if the service goes away or the subscription lapses, every printed code becomes dead, including the ones already on a wall.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'A QR code is a link you cannot read before you follow it, which is why fake codes stuck over parking meters and restaurant menus work so well. Treat one like a shortened link from a stranger: check the domain your phone previews before you tap, and never enter payment details on a page you reached only by scanning something in the street.',
      },
      { kind: 'h2', text: 'Making one that lasts' },
      {
        kind: 'ul',
        items: [
          'Keep the payload short. A shorter URL means a lower version and a code that scans first time.',
          'Choose level M for print, level H only if you are covering part of it.',
          'Leave the quiet zone, keep it square, and keep it dark on light.',
          'Test on a cheap phone, at the real size, on the real material, before the print run.',
        ],
      },
    ],
    related: ['qr-generator', 'url-encoder', 'image-converter'],
    relatedGuides: ['base64-explained', 'character-encoding-explained'],
  },
  {
    slug: 'markdown-explained',
    title: 'Markdown explained: one syntax, a dozen incompatible dialects',
    description:
      'Why the same file renders differently on GitHub and in your notes app, which rules are actually standard, and the five bits of syntax that trip everyone up.',
    category: 'Text',
    readingMinutes: 9,
    updated: '2026-09-14',
    published: '2026-09-14',
    intro: [
      'Markdown was written in 2004 by John Gruber, with input from Aaron Swartz, as a way to write for the web without writing HTML. The goal was that the plain text should be readable as it stands, so the markup had to look like the conventions people already used in email: a line of dashes under a heading, asterisks around a word for emphasis.',
      'It succeeded so completely that it now runs documentation, chat apps, static sites, note tools and issue trackers. What it never had was a specification, and that is the source of every incompatibility you have run into.',
    ],
    blocks: [
      { kind: 'h2', text: 'Why there is more than one Markdown' },
      {
        kind: 'p',
        text: 'The original release was a Perl script and a page of prose describing what it did. Anything the prose left unsaid, the script decided, and it decided some things inconsistently. How many spaces indent a nested list? What happens to an asterisk inside a word? Is a list immediately after a paragraph a list at all? Different implementations answered differently, and all of them could claim to be Markdown.',
      },
      {
        kind: 'p',
        text: 'In 2014 a group including developers from GitHub, Reddit and Stack Overflow published CommonMark: a genuine specification with hundreds of test cases, pinning down every ambiguity. Most modern renderers are CommonMark-based. GitHub Flavored Markdown, the dialect most people actually type, is CommonMark plus a small set of extensions.',
      },
      {
        kind: 'ul',
        items: [
          'Tables, written with pipes. Not in CommonMark at all; an extension everywhere it exists.',
          'Task list items, the checkbox syntax with square brackets.',
          'Strikethrough with double tildes.',
          'Autolinks: a bare URL becomes a link without angle brackets around it.',
          'Footnotes, definition lists, math and diagrams, all of which vary by renderer.',
        ],
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'If a file must render identically in two places, stay inside CommonMark plus tables, and test the file in both. Everything beyond that is a per-tool feature, however common it feels.',
      },
      { kind: 'h2', text: 'The syntax that is safe everywhere' },
      {
        kind: 'code',
        code: '# Heading 1\n## Heading 2\n\nA paragraph with *emphasis*, **strong** and `inline code`.\n\n- a bullet\n- another\n  - nested, indented two spaces\n\n1. first\n2. second\n\n> a blockquote\n\n[a link](https://example.com)\n![an image](/logo.png)\n\n```js\nconst fenced = "a code block with a language";\n```',
        caption: 'The common core. Every renderer worth using handles all of this the same way.',
      },
      {
        kind: 'p',
        text: 'Two choices inside that core are worth making deliberately. Use asterisks rather than underscores for emphasis, because underscores inside a word are treated differently across dialects and snake_case identifiers get mangled. And always give a fenced code block a language: it is what turns on syntax highlighting, and on some renderers it is what stops the block being reflowed.',
      },
      { kind: 'h2', text: 'The five things that catch people' },
      {
        kind: 'ol',
        items: [
          'A single newline is not a line break. Markdown joins consecutive lines into one paragraph. To force a break you end the line with two spaces, or a backslash, or a blank line for a new paragraph. Chat apps and issue trackers often break on a single newline instead, which is why pasted text reflows into a wall.',
          'Ordered list numbers are ignored after the first. Writing 1. three times renders 1, 2, 3. The first number sets the start, the rest are decoration, so you can renumber a long list by leaving it alone.',
          'A list needs a blank line before it. Without one, strict renderers treat the bullets as more of the preceding paragraph.',
          'Indentation inside a list item must line up with the item text, not with a fixed four spaces. Get it wrong and a paragraph escapes its bullet, or a code block becomes a nested list.',
          'Raw HTML is allowed, and is the usual escape hatch, but most public sites strip it. Anything you write in HTML may simply vanish when the file is rendered somewhere with a sanitiser.',
        ],
      },
      {
        kind: 'tool',
        lead: 'Write it with a live preview and see exactly what renders:',
        slug: 'markdown-editor',
      },
      { kind: 'h2', text: 'Front matter is not Markdown' },
      {
        kind: 'p',
        text: 'The block of YAML between two lines of three dashes at the top of a file is a convention from static site generators, not part of any Markdown specification. Jekyll, Hugo, Astro and most note apps read it for the title, date and tags. A renderer that does not know about it shows those lines as content, which is why a README with front matter looks broken on some hosts.',
      },
      { kind: 'h2', text: 'Turning it into something else' },
      {
        kind: 'p',
        text: 'Markdown converts to HTML by design, and the conversion is lossless in the direction that matters: every construct has an HTML equivalent. Going the other way is lossy, because most HTML has no Markdown form and ends up as raw tags or is dropped.',
      },
      {
        kind: 'p',
        text: 'For a PDF, the usual route is Markdown to HTML, then print. That keeps links live and text selectable, and it means your CSS controls the page. Converting to a Word document is the awkward case: headings and lists map cleanly, but code blocks and tables come across as whatever the converter guesses, so check them by hand.',
      },
      {
        kind: 'tool',
        lead: 'Paste the generated HTML and check how it renders before you publish it:',
        slug: 'html-preview',
      },
      { kind: 'h2', text: 'Why it won' },
      {
        kind: 'p',
        text: 'A Markdown file is plain text. It diffs line by line in version control, so a review shows the sentence that changed rather than a paragraph of markup. It is readable without a renderer, which matters in a terminal, a code comment or an email. It has no version to migrate and no application that owns it. Those properties are worth far more than the dialect inconsistencies cost, which is why a format with no specification for its first decade became the default way technical people write.',
      },
      {
        kind: 'ul',
        items: [
          'Stick to the common core, and add tables when you need them.',
          'Use asterisks for emphasis and label every code fence.',
          'Remember that one newline joins lines, and use blank lines generously.',
          'Preview in the tool that will actually render it before you ship it.',
        ],
      },
    ],
    related: ['markdown-editor', 'html-preview', 'word-counter', 'text-diff'],
    relatedGuides: ['character-encoding-explained', 'regex-explained'],
  },
  {
    slug: 'unix-time-and-time-zones-explained',
    title: 'Unix time, UTC and time zones: why your timestamp is an hour out',
    description:
      'What the epoch really counts, how to tell seconds from milliseconds, why a time zone is not an offset, and the one rule that prevents most date bugs.',
    category: 'Time',
    readingMinutes: 11,
    updated: '2026-09-14',
    published: '2026-09-14',
    intro: [
      'A timestamp looks like the simplest value in a system: one number, no ambiguity. Then a report comes out an hour wrong twice a year, a meeting moves itself, a birthday lands on the wrong day for users in Auckland, and it turns out the number was never as simple as it looked.',
      'This guide covers what Unix time actually measures, how time zones really work, and where to put the boundary between an instant and a local time so that the bugs stop.',
    ],
    blocks: [
      { kind: 'h2', text: 'What the epoch counts' },
      {
        kind: 'p',
        text: 'Unix time is the number of seconds since midnight UTC on the 1st of January 1970. It is an instant, not a date: the same number refers to the same moment everywhere on Earth, and the calendar date attached to it depends entirely on where you are standing.',
      },
      {
        kind: 'p',
        text: 'It is not, strictly, a count of elapsed seconds. POSIX defines every day as exactly 86,400 seconds, so leap seconds are not counted. When one is inserted, the same Unix timestamp is used twice or a second is stretched, depending on the system. In practice this matters only to people measuring intervals across a leap second, and it will matter less over time: the international bodies responsible agreed in 2022 to stop inserting leap seconds by 2035.',
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'A timestamp of exactly 0 rendering as 1st January 1970 is almost never a real date. It is a null, an empty string or a failed parse that became zero on the way through.',
      },
      { kind: 'h2', text: 'Seconds, milliseconds, or something else' },
      {
        kind: 'p',
        text: 'The unit is not part of the value, so you have to infer it, and the digit count is a reliable tell for any date near the present.',
      },
      {
        kind: 'code',
        code: '1789390800          10 digits  seconds        2026-09-14\n1789390800000       13 digits  milliseconds   2026-09-14\n1789390800000000    16 digits  microseconds   2026-09-14\n\n1789390800 read as milliseconds -> 1970-01-21, three weeks after the epoch',
        caption:
          'The classic failure: a seconds value handed to a millisecond API lands in January 1970, not in the future.',
      },
      {
        kind: 'p',
        text: 'Unix tools, Go and most databases use seconds. JavaScript, Java and Excel-bound exports use milliseconds. Some observability systems use microseconds or nanoseconds. The mismatch is so common that it is worth asserting the unit at the boundary rather than hoping the two sides agree.',
      },
      {
        kind: 'tool',
        lead: 'Paste a number and see the date, the unit and the zone at once:',
        slug: 'timestamp-converter',
      },
      { kind: 'h2', text: '2038, and the bug that is still ahead of us' },
      {
        kind: 'p',
        text: 'A signed 32-bit integer runs out at 03:14:07 UTC on the 19th of January 2038, and then wraps to a negative number: December 1901. Sixty-four-bit systems have not had this problem for years, but 32-bit time is still shipping today in embedded controllers, industrial equipment and file formats that were fixed long ago. Anything that calculates a date thirty years out has already met it.',
      },
      {
        kind: 'p',
        text: 'Treating the same field as unsigned buys until 2106 and breaks every date before 1970, which is why it is a fix only for systems that never store the past.',
      },
      { kind: 'h2', text: 'A time zone is not an offset' },
      {
        kind: 'p',
        text: 'This is the distinction that most date bugs come down to. An offset, such as +01:00, is a fact about one moment. A time zone, such as Europe/London, is a set of rules covering all of history: which offset applies in which period, when daylight saving starts and ends, and every time a government has changed its mind. London is +00:00 in winter and +01:00 in summer, and was on permanent summer time for part of the 1970s.',
      },
      {
        kind: 'p',
        text: 'Those rules live in the IANA time zone database, updated several times a year as countries announce changes, and shipped with your operating system and language runtime. An old container image carries an old copy of that database, which is a real and regularly rediscovered source of wrong times.',
      },
      {
        kind: 'ul',
        items: [
          'Abbreviations such as CST and IST are ambiguous. IST is India, Ireland and Israel; CST is at least three different offsets. Never store one.',
          'GMT and UTC are not quite the same thing. UTC is the standard; GMT is a time zone that happens to sit on it in winter.',
          'Offsets are not always whole hours. India is +05:30, Nepal +05:45, and parts of Australia are +08:45.',
        ],
      },
      { kind: 'h2', text: 'The two hours that break code' },
      {
        kind: 'p',
        text: 'Where daylight saving starts, an hour does not exist. In London on the last Sunday in March, 01:30 is simply not a valid local time, and asking for it gets you either an error or a silently adjusted value. Where it ends, an hour happens twice: 01:30 occurs once at +01:00 and again an hour later at +00:00. A local time on that morning is genuinely ambiguous, and any log sorted by local time is out of order for one hour a year.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'Do not add 24 hours to get tomorrow. On the two transition days a local day is 23 or 25 hours long. Add one day using a calendar-aware library, in a named zone, and let it work out the arithmetic.',
      },
      { kind: 'h2', text: 'Store the instant, or the plan, but know which' },
      {
        kind: 'p',
        text: 'Something that already happened is an instant: store it in UTC. A log line, an audit record, a payment, a message. The moment is fixed and converting it to any zone for display is a presentation concern.',
      },
      {
        kind: 'p',
        text: 'Something scheduled in the future is not an instant, it is an intention. A 09:00 meeting in Berlin next November means whatever 09:00 in Berlin turns out to be. If you convert it to UTC when it is created and a government then changes its daylight saving rules, your stored instant is still correct and the meeting is now at the wrong time. Store the local time and the zone identifier, and resolve to an instant when you need one.',
      },
      {
        kind: 'p',
        text: 'And a date without a time is not a timestamp at all. A birthday, an invoice date or a public holiday should be stored as a plain date. Turning one into midnight in a zone is how a birthday becomes the day before for anyone living east of you.',
      },
      { kind: 'h2', text: 'Writing them down: ISO 8601 and RFC 3339' },
      {
        kind: 'code',
        code: '2026-09-14T09:00:00Z         an instant, UTC, unambiguous\n2026-09-14T11:00:00+02:00    the same instant, written with an offset\n2026-09-14T09:00:00          no zone: means nothing on its own\n2026-09-14                   a date, not a moment\n14/09/2026                   ambiguous; never store it',
        caption:
          'RFC 3339 is the strict, machine-friendly subset of ISO 8601. Use it for anything that crosses a system boundary.',
      },
      {
        kind: 'p',
        text: 'Note that even a string with an offset has lost information. It records what the offset was, not which zone it came from, so you cannot use it to work out what the next occurrence should be. For recurring events, keep the zone identifier alongside.',
      },
      { kind: 'h2', text: 'Language traps worth knowing' },
      {
        kind: 'ul',
        items: [
          'In JavaScript, a date-only string is parsed as UTC while a date and time without a zone is parsed as local. That difference alone moves values by a day.',
          'Formatting for display uses the browser or server zone, which means a report generated on a machine in another region is wrong in a way that never reproduces locally.',
          'Databases differ on whether a timestamp column stores a zone at all. Postgres timestamptz converts to UTC on write; plain timestamp does not, and quietly keeps whatever local value it was given.',
          'Excel and CSV exports drop the zone entirely and often the seconds with it.',
        ],
      },
      { kind: 'h2', text: 'The short version' },
      {
        kind: 'ul',
        items: [
          'Store past events as UTC instants, and convert only for display.',
          'Store future events as a local time plus an IANA zone identifier.',
          'Store dates as dates.',
          'Never store an offset or an abbreviation in place of a zone, and keep your time zone database current.',
        ],
      },
    ],
    related: ['timestamp-converter', 'cron-explainer', 'json-formatter'],
    relatedGuides: ['cron-expressions-guide', 'xlsx-files-explained'],
  },
  {
    slug: 'sql-dialects-explained',
    title: 'SQL dialects: why the same query runs on Postgres and fails on MySQL',
    description:
      'Quoting, string concatenation, LIMIT versus TOP, upserts, GROUP BY strictness and NULL rules. What the standard says and where each database goes its own way.',
    category: 'Databases',
    readingMinutes: 11,
    updated: '2026-09-14',
    published: '2026-09-14',
    intro: [
      'SQL has been a standard since 1986 and is revised every few years. No database implements it fully, several contradict it deliberately, and every one of them adds syntax the standard has no opinion about. The result is that SQL is portable in the way English is portable: the sentences are recognisable, and the details will still get you into trouble.',
      'This guide walks through the places where the dialects actually diverge, so you can tell at a glance which database a query was written for and what it takes to move it.',
    ],
    blocks: [
      { kind: 'h2', text: 'Quoting, and the case of your identifiers' },
      {
        kind: 'p',
        text: 'The standard says a bare identifier is folded to uppercase and a double-quoted one is taken literally. Postgres folds to lowercase instead, which is compatible in effect but not in letter. MySQL quotes with backticks by default; SQL Server uses square brackets and accepts double quotes only when a session setting is on.',
      },
      {
        kind: 'code',
        code: 'SELECT "userId" FROM "Users"   -- Postgres, standard\nSELECT `userId` FROM `Users`   -- MySQL\nSELECT [userId] FROM [Users]   -- SQL Server',
        caption: 'Three ways to say the same thing, none of which the other two will parse.',
      },
      {
        kind: 'p',
        text: 'The knock-on effect catches people migrating. In Postgres, a table created as Users without quotes is really called users, and a later query for "Users" fails. On MySQL, whether table names are case-sensitive depends on the file system, so a query that works on a developer Mac breaks on a Linux server.',
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'The cheapest way to avoid all of it is to name things in lower_snake_case and never quote an identifier. Then every database agrees with every other, and nothing depends on the operating system.',
      },
      { kind: 'h2', text: 'Joining strings' },
      {
        kind: 'ul',
        items: [
          'The standard operator is a double pipe, and Postgres, Oracle, SQLite and DB2 all use it.',
          'MySQL reads a double pipe as a logical OR unless a compatibility mode is set, and expects CONCAT instead.',
          'SQL Server uses a plus sign, which also means addition, so the types decide what happens.',
        ],
      },
      {
        kind: 'p',
        text: 'CONCAT is the portable answer today: every one of the major databases has it, and most of them treat NULL arguments more kindly than the operator does. With the operator, one NULL in the expression makes the whole result NULL, which is a bug that only appears when a column is empty.',
      },
      { kind: 'h2', text: 'Getting the first ten rows' },
      {
        kind: 'code',
        code: 'SELECT * FROM orders ORDER BY id LIMIT 10 OFFSET 20;              -- Postgres, MySQL, SQLite\nSELECT TOP 10 * FROM orders ORDER BY id;                          -- SQL Server\nSELECT * FROM orders ORDER BY id\n  OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY;                         -- the standard; also Postgres, SQL Server, Oracle',
        caption:
          'The standard form is the wordiest and the most portable. LIMIT is the one everybody actually types.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'A LIMIT without an ORDER BY has no defined meaning. The database may return any rows it likes, and it will return different ones once the data grows or the plan changes. Pagination built this way silently skips and repeats rows.',
      },
      { kind: 'h2', text: 'Inserting a row that might already exist' },
      {
        kind: 'p',
        text: 'Every database solved the upsert problem, and no two solved it the same way. This is usually the single biggest edit when a query moves.',
      },
      {
        kind: 'code',
        code: 'INSERT INTO t (id, n) VALUES (1, 5)\n  ON CONFLICT (id) DO UPDATE SET n = EXCLUDED.n;   -- Postgres, SQLite\n\nINSERT INTO t (id, n) VALUES (1, 5)\n  ON DUPLICATE KEY UPDATE n = VALUES(n);           -- MySQL\n\nMERGE INTO t USING ... WHEN MATCHED THEN UPDATE    -- the standard; SQL Server, Oracle, Postgres 15+',
        caption: 'Three upserts. MERGE is standard and is by far the most verbose of the three.',
      },
      { kind: 'h2', text: 'Generated keys and dates' },
      {
        kind: 'ul',
        items: [
          'Auto-numbering: SERIAL or the standard GENERATED AS IDENTITY in Postgres, AUTO_INCREMENT in MySQL, IDENTITY(1,1) in SQL Server, and a sequence with a trigger in older Oracle.',
          'The current time: CURRENT_TIMESTAMP is standard and works nearly everywhere. NOW() is Postgres and MySQL, GETDATE() is SQL Server, SYSDATE is Oracle.',
          'Date arithmetic has no common form at all. Postgres adds an interval, MySQL has DATE_ADD, SQL Server has DATEADD with its own unit keywords.',
          'Booleans: Postgres has a real boolean type, MySQL stores one as a small integer where any non-zero value is true, and SQL Server has BIT and no boolean expression you can select directly.',
        ],
      },
      {
        kind: 'tool',
        lead: 'Paste a query from another system and make it readable before you port it:',
        slug: 'sql-formatter',
      },
      { kind: 'h2', text: 'GROUP BY, and how strict your database is' },
      {
        kind: 'p',
        text: 'The standard says every selected column must be aggregated or grouped. Postgres enforces that, with a sensible relaxation: if you group by a primary key, the other columns of that table are allowed, because they are functionally determined by it.',
      },
      {
        kind: 'p',
        text: 'MySQL historically allowed anything and returned an arbitrary value from the group, which is a query that looks like it works and is wrong in a way no test catches. Since version 5.7 the ONLY_FULL_GROUP_BY mode is on by default, so those old queries now fail loudly. That is an improvement, and it is also why upgrading MySQL breaks reports.',
      },
      { kind: 'h2', text: 'NULL is not a value' },
      {
        kind: 'p',
        text: 'Every dialect agrees on three-valued logic: NULL compared to anything, including NULL, is neither true nor false but unknown, and only true rows come back. So a condition of NOT IN against a set containing a NULL returns nothing at all, which is the most quietly destructive rule in SQL.',
      },
      {
        kind: 'ul',
        items: [
          'Use IS NULL and IS NOT NULL for the tests, never an equals sign.',
          'Oracle treats an empty string as NULL, so a column can be neither empty nor present. No other major database does this, and it breaks migrations both ways.',
          'MySQL adds a NULL-safe equality operator; the standard spelling is IS NOT DISTINCT FROM, which Postgres also has.',
          'Sorting differs: Postgres puts NULLs last ascending, MySQL and SQL Server put them first. Say NULLS FIRST or NULLS LAST if it matters.',
        ],
      },
      { kind: 'h2', text: 'The features that only some of them have' },
      {
        kind: 'ul',
        items: [
          'RETURNING, to get the inserted row back in one statement: Postgres and SQLite, plus an OUTPUT clause in SQL Server, nothing in MySQL.',
          'JSON functions exist everywhere now and share almost no syntax. Postgres has a whole operator vocabulary, MySQL has function calls, SQL Server has JSON_VALUE and OPENJSON.',
          'Window functions and common table expressions are standard and now near-universal, including SQLite and MySQL 8. Recursive CTEs need the RECURSIVE keyword on some and forbid it on others.',
          'Full-text search, array types, regular expressions and string functions are all vendor territory.',
        ],
      },
      { kind: 'h2', text: 'Writing SQL that travels' },
      {
        kind: 'ul',
        items: [
          'Lower-case unquoted identifiers, and no reliance on case sensitivity.',
          'CONCAT for strings, CURRENT_TIMESTAMP for the time, explicit CAST for types.',
          'ORDER BY on every query with a LIMIT, and explicit column lists rather than a star.',
          'Keep the upsert, the date arithmetic and the JSON access in one place, because they are the parts you will rewrite.',
          'If you only ever target one database, use its features properly. Portability has a real cost and is worth paying only when a migration is actually plausible.',
        ],
      },
    ],
    related: ['sql-formatter', 'code-formatter', 'json-formatter', 'uuid-generator'],
    relatedGuides: ['uuid-versions-explained', 'json-schema-explained'],
  },
  {
    slug: 'json-schema-explained',
    title: 'JSON Schema explained: describing data before it breaks something',
    description:
      'How to write a schema that actually rejects bad data, why additionalProperties and format catch everyone out, and the difference between anyOf and oneOf.',
    category: 'Data formats',
    readingMinutes: 10,
    updated: '2026-09-14',
    published: '2026-09-14',
    intro: [
      'JSON has no types beyond the six it can spell. Nothing in a payload says that id must be present, that email should look like an address, or that status is one of four words. JSON Schema is the contract that adds those rules, written as JSON itself so the same file can validate data, generate types, document an API and drive a form.',
      'Most schemas people write are weaker than they look. This guide covers the vocabulary you actually need and the defaults that let invalid data through while the validator reports success.',
    ],
    blocks: [
      { kind: 'h2', text: 'A schema is a document that describes a document' },
      {
        kind: 'code',
        code: '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "type": "object",\n  "properties": {\n    "id":     { "type": "string", "format": "uuid" },\n    "email":  { "type": "string", "format": "email" },\n    "age":    { "type": "integer", "minimum": 0, "maximum": 130 },\n    "status": { "enum": ["active", "invited", "suspended", "closed"] }\n  },\n  "required": ["id", "email", "status"],\n  "additionalProperties": false\n}',
        caption:
          'A complete schema. Every keyword in it is doing work, and two of them are load-bearing.',
      },
      {
        kind: 'p',
        text: 'Validation is a set of assertions, and anything not asserted is allowed. That single sentence explains most of the surprises below: a schema does not describe your data, it describes the checks you asked for.',
      },
      { kind: 'h2', text: 'The three defaults that let bad data through' },
      {
        kind: 'ol',
        items: [
          'Listing a property does not make it required. properties describes shape; required is a separate array of names. A schema with ten properties and no required array validates the empty object.',
          'Extra properties are allowed unless you say otherwise. Without additionalProperties set to false, a typo such as emial passes validation, the real field is absent, and nothing complains.',
          'format is an annotation, not a check. In the specification, a validator is permitted to ignore format entirely, and several do by default. If an email really must be an address, either turn format assertion on explicitly or add a pattern.',
        ],
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'additionalProperties: false does not see through composition. If you combine schemas with allOf, the false applies only to the properties named in the same schema object, so every field contributed by the other branch counts as additional and fails. This is the most reported confusion in JSON Schema, and the usual fix is unevaluatedProperties: false instead.',
      },
      { kind: 'h2', text: 'The vocabulary worth knowing' },
      {
        kind: 'ul',
        items: [
          'type, with the seven names: object, array, string, number, integer, boolean and null. It also accepts an array of names, which is how a nullable field is written.',
          'Strings take minLength, maxLength and pattern, which is a regular expression.',
          'Numbers take minimum, maximum, the exclusive variants and multipleOf.',
          'Arrays take items for the element schema, minItems, maxItems and uniqueItems. In the 2020-12 draft, a fixed-length tuple uses prefixItems instead of the old array form of items.',
          'enum restricts a value to a list; const pins it to exactly one, which is what you use to tag a variant.',
          '$defs holds reusable subschemas and $ref points at them, so a shared address definition is written once.',
        ],
      },
      {
        kind: 'code',
        code: '"tags":     { "type": "array", "items": { "type": "string" }, "uniqueItems": true },\n"nickname": { "type": ["string", "null"] },\n"address":  { "$ref": "#/$defs/address" }',
        caption:
          'Nullability must be explicit. A field typed as string rejects null, which is a frequent source of false failures against real data.',
      },
      {
        kind: 'tool',
        lead: 'Check the shape of a real payload before you write a schema for it:',
        slug: 'json-formatter',
      },
      { kind: 'h2', text: 'Combining schemas, and the anyOf trap' },
      {
        kind: 'p',
        text: 'Four keywords combine subschemas, and choosing the wrong one produces errors that are almost impossible to read.',
      },
      {
        kind: 'ul',
        items: [
          'allOf: every subschema must pass. Used for mixing in a shared base.',
          'anyOf: at least one must pass. This is what you usually want for a union.',
          'oneOf: exactly one must pass. If two branches both accept the value, validation fails even though the data is fine.',
          'not: the subschema must fail. Rarely needed and rarely readable.',
        ],
      },
      {
        kind: 'p',
        text: 'oneOf is the one that bites. A union of two object shapes that differ only in their optional fields will match both branches for a minimal object, and the validator reports that the data matched too many schemas. The fix is to make the branches genuinely exclusive with a const discriminator on a shared field, or to use anyOf and accept that the error messages get vaguer.',
      },
      {
        kind: 'code',
        code: '"oneOf": [\n  { "properties": { "kind": { "const": "card" }, "last4": { "type": "string" } },\n    "required": ["kind", "last4"] },\n  { "properties": { "kind": { "const": "bank" }, "iban":  { "type": "string" } },\n    "required": ["kind", "iban"] }\n]',
        caption:
          'A discriminated union. The const on kind makes exactly one branch possible for any value.',
      },
      { kind: 'h2', text: 'Conditional rules' },
      {
        kind: 'p',
        text: 'if, then and else express a dependency between fields: when the country is the United States, a state becomes required. The if subschema is used only as a test and never contributes an error of its own, which is why a failing conditional produces a message about then rather than about the field you were thinking of. Keep the condition as small as possible, usually a single const, so the output stays legible.',
      },
      { kind: 'h2', text: 'Which draft you are writing' },
      {
        kind: 'p',
        text: 'Draft-07 is still the most widely supported and is a perfectly reasonable target. The 2019-09 and 2020-12 drafts renamed definitions to $defs, split the tuple form of items into prefixItems, and added unevaluatedProperties. Tooling support varies, so declare the draft with $schema and check that your validator actually implements it rather than silently ignoring the keywords it does not know.',
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'OpenAPI is the other place you meet these keywords. Version 3.0 used a modified subset with its own nullable flag; 3.1 aligned with JSON Schema 2020-12, so a schema can finally be shared between an API description and a runtime validator.',
      },
      { kind: 'h2', text: 'What a schema is worth' },
      {
        kind: 'ul',
        items: [
          'Rejecting bad data at the edge, once, instead of in every function that touches it.',
          'Generating types, so the compiler and the validator cannot drift apart.',
          'Documenting the payload in a form that is checked rather than a form that goes stale.',
          'Constraining generated output, which is how structured responses from language models are made reliable.',
        ],
      },
      {
        kind: 'tool',
        lead: 'Go the other way and turn a sample payload into typed interfaces:',
        slug: 'json-to-types',
      },
      {
        kind: 'p',
        text: 'Write the schema against real payloads rather than against the documentation, keep it in version control beside the code that produces the data, and add additionalProperties: false the day you write it. A schema that never rejects anything is documentation with extra steps.',
      },
    ],
    related: ['json-formatter', 'json-to-types', 'json-csv'],
    relatedGuides: ['sql-dialects-explained', 'regex-explained'],
  },
  {
    slug: 'ocr-explained',
    title: 'How OCR works, and why it still gets things wrong',
    description:
      'The pipeline that turns a picture of a page into text, why 0 and O are the least of your problems, and what a searchable PDF really contains.',
    category: 'Documents',
    readingMinutes: 10,
    updated: '2026-09-14',
    published: '2026-09-14',
    intro: [
      'A scanned page is a photograph. There are no letters in it, only dark pixels arranged in shapes that a human reads as letters. Optical character recognition is the process of guessing, from those shapes, what was typed, and the word guessing is doing real work: every stage of it is a probability rather than a lookup.',
      'Understanding the pipeline tells you why the same document scans perfectly at one setting and produces nonsense at another, and what to change when it does.',
    ],
    blocks: [
      { kind: 'h2', text: 'The pipeline' },
      {
        kind: 'ol',
        items: [
          'Clean-up. The image is converted to greyscale and then to pure black and white, a step called binarisation. Getting the threshold right is what separates faint text from the page; getting it wrong either erases thin strokes or fills the page with speckle.',
          'Deskew and dewarp. A page scanned at two degrees off square is straightened, and a photographed book page, which curves away at the spine, is flattened.',
          'Layout analysis. The engine finds blocks of text, columns, images, captions and tables, and decides the reading order. This is the stage that decides whether a two-column article comes out as prose or as interleaved nonsense.',
          'Line and word segmentation. Blocks are cut into lines, lines into words, and words into character candidates.',
          'Recognition. Each line is turned into characters. Modern engines do this with a neural network that reads a whole line at a time rather than matching one glyph at a time.',
          'Language correction. A dictionary and a statistical language model nudge unlikely sequences towards likely ones, which fixes real errors and occasionally invents new ones.',
        ],
      },
      {
        kind: 'p',
        text: 'The last two stages are where the technology changed. Older engines compared each shape against a library of glyph features, which made them fragile with unusual fonts. Since Tesseract 4 the standard approach has been a recurrent network trained on whole text lines, which handles shape ambiguity by using context. That is why a modern engine reads a blurry word correctly and then misreads a clean product code: the code has no context to lean on.',
      },
      {
        kind: 'callout',
        tone: 'info',
        text: 'This is also why OCR is confidently wrong. The engine returns the most probable reading, not a warning. Most engines can report a per-word confidence score, and anything below about 80 is worth a human eye.',
      },
      { kind: 'h2', text: 'The scan matters more than the engine' },
      {
        kind: 'p',
        text: 'Input quality dominates. No engine recovers detail that was never captured, and most failures are decided before the software is involved.',
      },
      {
        kind: 'ul',
        items: [
          'Resolution: 300 dpi is the working standard for ordinary body text. At 150 dpi small print loses the gaps inside letters, and 600 dpi rarely improves accuracy while quadrupling the file.',
          'Compression: heavy JPEG makes ringing artefacts around every stroke, which binarisation turns into speckle. Scan to PNG or a lossless TIFF if you can.',
          'Lighting: a phone photo has a shadow gradient across the page, so one global threshold either blows out one side or fills in the other. Use a document scanning mode that corrects for it.',
          'Geometry: skew, perspective and page curl all break line segmentation before recognition begins.',
          'Colour: a greyscale scan of black text is better than a colour one, and a scan of a coloured or patterned background is worse than both.',
        ],
      },
      {
        kind: 'tool',
        lead: 'Straighten and clean a phone photo of a page before you run it through anything:',
        slug: 'document-scanner',
      },
      { kind: 'h2', text: 'What it reliably gets wrong' },
      {
        kind: 'ul',
        items: [
          'Glyph pairs that genuinely look alike: 0 and O, 1 and l and I, 5 and S, 8 and B, and rn read as m. Language models fix these in words and cannot fix them in reference numbers.',
          'Tables. Recognition of the text is usually fine; the structure is what is lost, because nothing in the image says which cell a number belongs to except its position.',
          'Multi-column layouts, where the reading order can cross columns line by line.',
          'Handwriting, which is a different problem with a different name and much lower accuracy.',
          'Mixed languages and mixed scripts on one page, unless you tell the engine to expect them.',
          'Superscripts, footnote markers, hyphenated line breaks and ligatures, which all end up in the text stream somewhere.',
          'Anything stylised: logos, display type, condensed fonts and text over an image.',
        ],
      },
      {
        kind: 'p',
        text: 'Setting the language correctly is the single highest-value option, because the correction stage uses it. Running an English model over a German document produces plausible English words where German ones were, which is far harder to spot than gibberish.',
      },
      { kind: 'h2', text: 'What a searchable PDF actually contains' },
      {
        kind: 'p',
        text: 'OCR does not replace the scan. A searchable PDF keeps the original page image exactly as it was and adds a second layer: the recognised text, positioned over the matching words and drawn in invisible mode, so it can be selected, searched and copied while remaining unseen. What you look at is the picture; what you search is the guess.',
      },
      {
        kind: 'ul',
        items: [
          'The file gets larger, because it now holds both the image and the text.',
          'Copying from it gives you the OCR output, errors included, which is why pasted text from a scan sometimes contains words that are not on the page.',
          'The text layer can be wrong without anything looking wrong, since the image is unchanged.',
        ],
      },
      {
        kind: 'callout',
        tone: 'warn',
        text: 'Redaction on a scanned document has to remove both layers. A black box drawn over a name in the image still leaves the name in the text layer underneath, fully searchable and trivially recoverable. Use a tool that removes the content rather than one that draws over it.',
      },
      {
        kind: 'tool',
        lead: 'Add a searchable text layer to a scanned PDF:',
        slug: 'pdf-ocr',
      },
      { kind: 'h2', text: 'Getting a good result' },
      {
        kind: 'ol',
        items: [
          'Scan flat and square, in greyscale, at 300 dpi, to a lossless format.',
          'Crop to the page and remove the scanner lid border, which otherwise becomes a giant black region for layout analysis to puzzle over.',
          'Tell the engine the language, and the page orientation if it is not upright.',
          'Read the output beside the original once, at speed, looking for lines that make no sense.',
          'Check every number by hand. Digits carry no context and are where the real cost of an error sits.',
        ],
      },
      {
        kind: 'p',
        text: 'And if the document exists as a real digital file somewhere, find it instead. OCR is a recovery technique for pages whose original is gone. Text that was never rasterised needs no guessing, and a PDF exported from a word processor already contains its own text, however much it looks like a scan.',
      },
    ],
    related: ['pdf-ocr', 'document-scanner', 'pdf-viewer', 'pdf-redact'],
    relatedGuides: ['pdf-internals-explained', 'image-formats-explained'],
  },
];

/** Fast slug → guide lookup for the detail route. */
export const GUIDE_BY_SLUG: Record<string, Guide> = Object.fromEntries(
  GUIDES.map((guide) => [guide.slug, guide]),
);
