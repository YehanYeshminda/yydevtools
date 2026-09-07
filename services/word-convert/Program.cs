// Word convert service: DOCX -> SFDT, for the Word Viewer tool.
//
// Private companion to the Worker, same shape as the other three services
// (pdf-compress, pdf-ocr, pdf-convert) — the Worker forwards the file with a
// shared secret; this reads the body, does the conversion and streams the
// result back. The only reason this one is C# rather than Node, unlike its
// three siblings, is that Syncfusion's Document Editor Import step — turning
// an arbitrary .docx into the SFDT JSON their client-side editor actually
// renders — only ships for ASP.NET Core, ASP.NET MVC and Java. There is no
// Node build of it (confirmed directly with Syncfusion support), so this is
// the one service in the repo that cannot match the others' runtime.
//
//   POST /import   Authorization: Bearer <WORD_CONVERT_SECRET>
//     body: application/octet-stream (.docx bytes)  ->  200 <SFDT JSON>
//   GET /health -> ok
//
// Unlike the other services, there is no external binary to verify at
// startup: DocIO is a managed library baked into the deployed assembly, not a
// tool this container installs and shells out to, so "the process started" and
// "the tool is available" are the same fact here. That is also why /health
// does not attempt to load a document — there is nothing further to check.

using System.Security.Cryptography;
using System.Text;
using Syncfusion.EJ2.DocumentEditor;
using Syncfusion.Licensing;

var licenseKey = Environment.GetEnvironmentVariable("SYNCFUSION_LICENSE_KEY");
if (!string.IsNullOrEmpty(licenseKey))
{
    SyncfusionLicenseProvider.RegisterLicense(licenseKey);
}

var secret = Environment.GetEnvironmentVariable("WORD_CONVERT_SECRET") ?? "";
var maxConcurrent = int.TryParse(Environment.GetEnvironmentVariable("MAX_CONCURRENT"), out var configuredConcurrency)
    ? configuredConcurrency
    : 6;

const long MaxBytes = 20 * 1024 * 1024;

// DocIO parsing has no cancellation support, so this bounds how long a caller
// waits, not how long the work actually runs — a genuinely stuck parse keeps
// the thread until it finishes or the process recycles. Acceptable at this
// file-size cap; see the comment on ImportAsync below.
var importTimeout = TimeSpan.FromSeconds(45);

using var concurrencyGate = new SemaphoreSlim(maxConcurrent, maxConcurrent);

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = MaxBytes);
// This service is only ever called by the Worker (server-to-server, with the
// shared secret), never by a browser directly — so, like its siblings, it
// needs no CORS configuration at all.
builder.Logging.ClearProviders().AddJsonConsole(options =>
{
    options.UseUtcTimestamp = true;
});

var app = builder.Build();
var logger = app.Logger;

app.MapGet("/health", () => Results.Text("ok", "text/plain"));

app.MapPost("/import", async (HttpRequest request) =>
{
    if (!Authorized(request.Headers.Authorization, secret))
    {
        logger.LogInformation("{Event}", "unauthorized");
        return Failure(401, "UNAUTHORIZED", "Missing or invalid credentials.");
    }

    byte[] input;
    using (var body = new MemoryStream())
    {
        await request.Body.CopyToAsync(body);
        input = body.ToArray();
    }

    if (input.Length == 0)
    {
        return Failure(400, "INVALID_INPUT", "No document was sent.");
    }
    if (input.LongLength > MaxBytes)
    {
        return Failure(413, "TOO_LARGE", "That file is larger than this tool allows.");
    }
    if (!LooksLikeDocx(input))
    {
        logger.LogInformation("{Event} {Bytes}", "rejected_not_docx", input.Length);
        return Failure(400, "INVALID_INPUT", "That file is not a .docx document.");
    }

    var started = DateTime.UtcNow;
    await concurrencyGate.WaitAsync();
    try
    {
        var json = await ImportAsync(input, importTimeout);
        logger.LogInformation(
            "{Event} {InBytes} {OutBytes} {Ms}",
            "ok", input.Length, json.Length, (DateTime.UtcNow - started).TotalMilliseconds);
        return Results.Text(json, "application/json");
    }
    catch (TimeoutException)
    {
        logger.LogWarning("{Event} {InBytes}", "timeout", input.Length);
        return Failure(504, "TIMEOUT", "Conversion took too long and was stopped.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "{Event} {InBytes}", "failed", input.Length);
        return Failure(502, "UPSTREAM_REJECTED", "The document could not be converted.");
    }
    finally
    {
        concurrencyGate.Release();
    }
});

app.Run();

/// <summary>
/// Loads a .docx and serialises it to the SFDT JSON the client-side Document
/// Editor expects, off the request thread. DocIO's <c>WordDocument.Load</c> is
/// synchronous with no cancellation support, so the timeout here only bounds
/// how long the caller waits for a response — it does not stop the parse — the
/// same trade the Worker's own route budgets describe for the Node services,
/// just without an OS process to actually kill on the losing side.
/// </summary>
static async Task<string> ImportAsync(byte[] input, TimeSpan timeout)
{
    var work = Task.Run(() =>
    {
        using var stream = new MemoryStream(input);
        // Syncfusion.EJ2.DocumentEditor.WordDocument — the client-editor model
        // this Import step builds — is not IDisposable, unlike DocIO's own
        // WordDocument (Syncfusion.DocIO.DLS), a same-named but different type.
        var document = WordDocument.Load(stream, FormatType.Docx);
        return Newtonsoft.Json.JsonConvert.SerializeObject(document);
    });

    var winner = await Task.WhenAny(work, Task.Delay(timeout));
    if (winner != work)
    {
        throw new TimeoutException();
    }
    return await work;
}

/// <summary>
/// True when the bytes are a ZIP archive (the local-file-header signature,
/// anchored at offset 0) — a .docx is a ZIP of OOXML parts, so this is the
/// cheapest real check before handing the bytes to DocIO. Anchored at offset 0
/// rather than "found somewhere in the first KB", unlike the PDF services'
/// sniff (tracked as its own fix) — a signature that only shows up later in the
/// stream is not a ZIP local file header, it is a false positive.
/// </summary>
static bool LooksLikeDocx(byte[] bytes) =>
    bytes.Length >= 4 && bytes[0] == 0x50 && bytes[1] == 0x4B && bytes[2] == 0x03 && bytes[3] == 0x04;

/// <summary>Compares the Authorization header in constant time.</summary>
static bool Authorized(string? header, string secret)
{
    if (string.IsNullOrEmpty(secret))
    {
        return false;
    }
    var expected = Encoding.UTF8.GetBytes($"Bearer {secret}");
    var given = Encoding.UTF8.GetBytes(header ?? "");
    return given.Length == expected.Length && CryptographicOperations.FixedTimeEquals(given, expected);
}

static IResult Failure(int status, string code, string message) =>
    Results.Json(new { error = new { code, message } }, statusCode: status);
