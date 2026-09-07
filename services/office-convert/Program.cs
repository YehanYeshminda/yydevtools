// Office convert service: the format conversions Syncfusion's client-side
// editors cannot do themselves, for Word Viewer and Excel Viewer.
//
// Private companion to the Worker, same shape as the other three services
// (pdf-compress, pdf-ocr, pdf-convert) — the Worker forwards the file with a
// shared secret; this converts and streams the result back. The only reason
// this one is C# rather than Node, unlike its three siblings, is that both of
// Syncfusion's Import steps — .docx into the SFDT their Document Editor
// renders, .xlsx into the workbook JSON their Spreadsheet renders — ship only
// for ASP.NET Core, ASP.NET MVC and Java. There is no Node build of either
// (confirmed directly with Syncfusion support), so this is the one service in
// the repo that cannot match the others' runtime.
//
//   POST /word/import    Authorization: Bearer <OFFICE_CONVERT_SECRET>
//     body: application/octet-stream (.docx bytes)  ->  200 <SFDT JSON>
//   POST /excel/import   Authorization: Bearer <OFFICE_CONVERT_SECRET>
//     body: multipart/form-data, file first  ->  200 <workbook JSON>
//   GET /health -> ok
//
// The two take different body shapes because the two client components differ:
// for Word we fetch the SFDT ourselves and hand it to documentEditor.open(),
// so the Worker can forward plain bytes; the Spreadsheet component instead
// performs its own POST to whatever `openUrl` points at, as multipart with the
// file first, and that shape is not ours to choose.
//
// Unlike the other services, there is no external binary to verify at
// startup: DocIO and XlsIO are managed libraries baked into the deployed
// assembly, not tools this container installs and shells out to, so "the
// process started" and "the tool is available" are the same fact here. That is
// also why /health does not attempt a conversion — there is nothing further to
// check.

using System.Security.Cryptography;
using System.Text;
using Syncfusion.EJ2.DocumentEditor;
using Syncfusion.EJ2.Spreadsheet;
using Syncfusion.Licensing;

var licenseKey = Environment.GetEnvironmentVariable("SYNCFUSION_LICENSE_KEY");
if (!string.IsNullOrEmpty(licenseKey))
{
    SyncfusionLicenseProvider.RegisterLicense(licenseKey);
}

var secret = Environment.GetEnvironmentVariable("OFFICE_CONVERT_SECRET") ?? "";
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

app.MapPost("/word/import", async (HttpRequest request) =>
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

app.MapPost("/excel/import", async (HttpRequest request) =>
{
    if (!Authorized(request.Headers.Authorization, secret))
    {
        logger.LogInformation("{Event}", "unauthorized");
        return Failure(401, "UNAUTHORIZED", "Missing or invalid credentials.");
    }

    // Multipart, not raw bytes, because the Spreadsheet component builds this
    // request itself — see the note at the top of the file.
    if (!request.HasFormContentType)
    {
        return Failure(400, "INVALID_INPUT", "Expected a multipart form upload.");
    }

    var form = await request.ReadFormAsync();
    var file = form.Files.Count > 0 ? form.Files[0] : null;
    if (file is null || file.Length == 0)
    {
        return Failure(400, "INVALID_INPUT", "No workbook was sent.");
    }
    if (file.Length > MaxBytes)
    {
        return Failure(413, "TOO_LARGE", "That file is larger than this tool allows.");
    }
    if (!await LooksLikeZipAsync(file))
    {
        logger.LogInformation("{Event} {Bytes}", "rejected_not_xlsx", file.Length);
        return Failure(400, "INVALID_INPUT", "That file is not a .xlsx workbook.");
    }

    var started = DateTime.UtcNow;
    await concurrencyGate.WaitAsync();
    try
    {
        var json = await OpenWorkbookAsync(file, importTimeout);
        logger.LogInformation(
            "{Event} {InBytes} {OutBytes} {Ms}",
            "ok_excel", file.Length, json.Length, (DateTime.UtcNow - started).TotalMilliseconds);
        return Results.Content(json, "application/json");
    }
    catch (TimeoutException)
    {
        logger.LogWarning("{Event} {InBytes}", "timeout_excel", file.Length);
        return Failure(504, "TIMEOUT", "Conversion took too long and was stopped.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "{Event} {InBytes}", "failed_excel", file.Length);
        return Failure(502, "UPSTREAM_REJECTED", "The workbook could not be converted.");
    }
    finally
    {
        concurrencyGate.Release();
    }
});

app.Run();

/// <summary>
/// Converts an uploaded .xlsx into the workbook JSON the client-side
/// Spreadsheet expects. Same synchronous-parse caveat as ImportAsync below:
/// the timeout bounds the caller's wait, not the work itself.
/// </summary>
static async Task<string> OpenWorkbookAsync(IFormFile file, TimeSpan timeout)
{
    var work = Task.Run(() => Workbook.Open(new OpenRequest { File = file }));

    var winner = await Task.WhenAny(work, Task.Delay(timeout));
    if (winner != work)
    {
        throw new TimeoutException();
    }
    return await work;
}

/// <summary>
/// The same offset-0 ZIP check as LooksLikeDocx, over an uploaded file's first
/// bytes rather than a buffer already in hand — .xlsx is a ZIP of OOXML parts
/// too. Reads only the header and rewinds, so the stream is still whole for
/// the conversion that follows.
/// </summary>
static async Task<bool> LooksLikeZipAsync(IFormFile file)
{
    var header = new byte[4];
    await using var stream = file.OpenReadStream();
    var read = await stream.ReadAsync(header);
    return read == 4 && header[0] == 0x50 && header[1] == 0x4B && header[2] == 0x03 && header[3] == 0x04;
}

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
