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
        code: "Text:     M         a         n\nASCII:    77        97        110\nBits:     01001101  01100001  01101110\nRegroup:  010011  010110  000101  101110\nBase64:   T       W       F       u        →  \"TWFu\"",
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
      { kind: 'tool', lead: 'Encode or decode text, files and data URIs:', slug: 'base64-converter' },
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
      { kind: 'tool', lead: 'Turn any expression into plain English and preview its next runs:', slug: 'cron-explainer' },
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
      { kind: 'tool', lead: 'Compress by quality or to a target size, with a before/after slider:', slug: 'image-compressor' },
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
    relatedGuides: [],
  },
];

/** Fast slug → guide lookup for the detail route. */
export const GUIDE_BY_SLUG: Record<string, Guide> = Object.fromEntries(
  GUIDES.map((guide) => [guide.slug, guide]),
);
