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
using System.Security.Cryptography.X509Certificates;
using System.Text;
using Syncfusion.DocIORenderer;
using Syncfusion.EJ2.DocumentEditor;
using Syncfusion.EJ2.Spreadsheet;
using Syncfusion.Licensing;
using Syncfusion.Pdf;
using Syncfusion.Pdf.Parsing;
using Syncfusion.Pdf.Security;
// Not `using Syncfusion.Presentation` — it also defines a FormatType, which
// would collide with the DocumentEditor one /word/import already uses.
using Syncfusion.PresentationRenderer;
using Syncfusion.XlsIO;
using Syncfusion.XlsIORenderer;

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

// Laying out pages is slower than parsing them, so this gets double the
// import budget. Same caveat: it bounds the wait, not the work.
var renderTimeout = TimeSpan.FromSeconds(90);

//   POST /office/to-pdf?type=docx|xlsx|pptx   Authorization: Bearer <secret>
//     body: application/octet-stream  ->  200 application/pdf
//
// The type comes from the caller rather than being sniffed: all three are
// ZIPs of OOXML parts, and telling them apart properly means reading the
// archive's content-types entry — which is exactly the work the engine that
// opens the file is about to do anyway.
app.MapPost("/office/to-pdf", async (HttpRequest request) =>
{
    if (!Authorized(request.Headers.Authorization, secret))
    {
        logger.LogInformation("{Event}", "unauthorized");
        return Failure(401, "UNAUTHORIZED", "Missing or invalid credentials.");
    }

    var type = request.Query["type"].ToString();
    if (type is not ("docx" or "xlsx" or "pptx"))
    {
        return Failure(400, "INVALID_INPUT", "Unsupported document type.");
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
        logger.LogInformation("{Event} {Bytes}", "rejected_not_office", input.Length);
        return Failure(400, "INVALID_INPUT", $"That file is not a .{type} document.");
    }

    var started = DateTime.UtcNow;
    await concurrencyGate.WaitAsync();
    try
    {
        var pdf = await ToPdfAsync(input, type, renderTimeout);
        logger.LogInformation(
            "{Event} {Type} {InBytes} {OutBytes} {Ms}",
            "ok_pdf", type, input.Length, pdf.Length, (DateTime.UtcNow - started).TotalMilliseconds);
        return Results.Bytes(pdf, "application/pdf");
    }
    catch (TimeoutException)
    {
        logger.LogWarning("{Event} {Type} {InBytes}", "timeout_pdf", type, input.Length);
        return Failure(504, "TIMEOUT", "Conversion took too long and was stopped.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "{Event} {Type} {InBytes}", "failed_pdf", type, input.Length);
        return Failure(502, "UPSTREAM_REJECTED", "The document could not be converted.");
    }
    finally
    {
        concurrencyGate.Release();
    }
});

//   POST /pdf/protect   multipart: file, password, [owner]  ->  200 application/pdf
//   POST /pdf/unlock    multipart: file, password           ->  200 application/pdf
//
// Multipart so the passwords ride in the body: a query string is written to
// every access log between the browser and this process, and a password is
// the one input here that must not be.
app.MapPost("/pdf/protect", (HttpRequest request) => SecurePdfAsync(request, protect: true));
app.MapPost("/pdf/unlock", (HttpRequest request) => SecurePdfAsync(request, protect: false));

//   POST /x509/decode   body: PEM text (one certificate or a bundle) or one DER
//     certificate  ->  200 { certificates: [...], chain, privateKeyIgnored }
//
// Nothing Syncfusion here — this lives in the C# service because .NET's
// X509Certificate2 does the ASN.1 walk that a hand-written TypeScript parser
// would get subtly wrong. Certificates are public material; a private key
// pasted alongside is ignored by ImportFromPem and never looked at.
const int MaxCertificateBytes = 64 * 1024;

app.MapPost("/x509/decode", async (HttpRequest request) =>
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
        return Failure(400, "INVALID_INPUT", "No certificate was sent.");
    }
    if (input.Length > MaxCertificateBytes)
    {
        return Failure(413, "TOO_LARGE", "That is larger than a certificate bundle should be.");
    }

    try
    {
        var (certificates, privateKeyIgnored) = LoadCertificates(input);
        if (certificates.Count == 0)
        {
            return Failure(400, "INVALID_INPUT", "No certificate found. Paste a PEM block or upload a .crt, .cer or .der file.");
        }
        logger.LogInformation("{Event} {Count}", "ok_x509", certificates.Count);
        return Results.Json(new
        {
            certificates = certificates.Select(Describe).ToArray(),
            chain = DescribeChain(certificates),
            privateKeyIgnored,
        });
    }
    catch (CryptographicException ex)
    {
        logger.LogInformation("{Event} {Detail}", "rejected_x509", ex.Message);
        return Failure(400, "INVALID_INPUT", "That is not a readable X.509 certificate.");
    }
});

app.Run();

static (X509Certificate2Collection, bool privateKeyIgnored) LoadCertificates(byte[] input)
{
    var collection = new X509Certificate2Collection();
    var text = Encoding.UTF8.GetString(input);
    if (text.Contains("-----BEGIN", StringComparison.Ordinal))
    {
        // ImportFromPem takes every CERTIFICATE block and skips the rest —
        // including any private key someone pasted along with the cert.
        collection.ImportFromPem(text);
        return (collection, text.Contains("PRIVATE KEY", StringComparison.Ordinal));
    }
    collection.Add(new X509Certificate2(input));
    return (collection, false);
}

static object Describe(X509Certificate2 c)
{
    using var rsa = c.GetRSAPublicKey();
    using var ecdsa = c.GetECDsaPublicKey();
    string? curve = null;
    try
    {
        curve = ecdsa?.ExportParameters(false).Curve.Oid.FriendlyName;
    }
    catch (CryptographicException)
    {
        // An explicit (non-named) curve has no name to report.
    }

    var san = c.Extensions.OfType<X509SubjectAlternativeNameExtension>().FirstOrDefault();
    var keyUsage = c.Extensions.OfType<X509KeyUsageExtension>().FirstOrDefault();
    var eku = c.Extensions.OfType<X509EnhancedKeyUsageExtension>().FirstOrDefault();
    var basic = c.Extensions.OfType<X509BasicConstraintsExtension>().FirstOrDefault();
    var ski = c.Extensions.OfType<X509SubjectKeyIdentifierExtension>().FirstOrDefault();
    var aki = c.Extensions.OfType<X509AuthorityKeyIdentifierExtension>().FirstOrDefault();

    return new
    {
        subject = c.SubjectName.Name,
        issuer = c.IssuerName.Name,
        serialNumber = c.SerialNumber,
        version = c.Version,
        notBefore = c.NotBefore.ToUniversalTime(),
        notAfter = c.NotAfter.ToUniversalTime(),
        signatureAlgorithm = c.SignatureAlgorithm.FriendlyName ?? c.SignatureAlgorithm.Value,
        publicKey = new
        {
            algorithm = c.PublicKey.Oid.FriendlyName ?? c.PublicKey.Oid.Value,
            bits = rsa?.KeySize ?? ecdsa?.KeySize,
            curve,
        },
        fingerprints = new
        {
            sha1 = c.Thumbprint,
            sha256 = Convert.ToHexString(c.GetCertHash(HashAlgorithmName.SHA256)),
        },
        selfSigned = IsSelfSigned(c),
        subjectAlternativeNames = san is null
            ? Array.Empty<string>()
            : san.EnumerateDnsNames().Select(n => "DNS:" + n)
                .Concat(san.EnumerateIPAddresses().Select(ip => "IP:" + ip))
                .ToArray(),
        keyUsage = keyUsage is null || keyUsage.KeyUsages == X509KeyUsageFlags.None
            ? Array.Empty<string>()
            : keyUsage.KeyUsages.ToString().Split(", "),
        extendedKeyUsage = eku is null
            ? Array.Empty<string>()
            : eku.EnhancedKeyUsages.Cast<Oid>().Select(o => o.FriendlyName ?? o.Value ?? "").ToArray(),
        basicConstraints = basic is null
            ? null
            : new
            {
                isCertificateAuthority = basic.CertificateAuthority,
                pathLength = basic.HasPathLengthConstraint ? basic.PathLengthConstraint : (int?)null,
            },
        subjectKeyIdentifier = ski?.SubjectKeyIdentifier,
        authorityKeyIdentifier = aki?.KeyIdentifier is { } id ? Convert.ToHexString(id.Span) : null,
        extensions = c.Extensions.Cast<X509Extension>().Select(e => new
        {
            oid = e.Oid?.Value,
            name = e.Oid?.FriendlyName,
            critical = e.Critical,
            value = e.Format(false),
        }).ToArray(),
    };
}

static bool IsSelfSigned(X509Certificate2 c) =>
    c.SubjectName.RawData.AsSpan().SequenceEqual(c.IssuerName.RawData);

/// <summary>
/// For a bundle, lets X509Chain link the certificates up: the leaf is the one
/// nothing else in the bundle was issued by, self-signed members are the only
/// trusted roots, and revocation is not checked (this is offline). The status
/// list says what, if anything, is wrong — an empty list is a clean chain.
/// </summary>
static object? DescribeChain(X509Certificate2Collection certificates)
{
    if (certificates.Count < 2)
    {
        return null;
    }
    var issuers = certificates.Select(c => c.IssuerName.Name).ToHashSet();
    var leaf = certificates.FirstOrDefault(c => !issuers.Contains(c.SubjectName.Name)) ?? certificates[0];

    using var chain = new X509Chain();
    chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
    chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
    foreach (var c in certificates)
    {
        chain.ChainPolicy.ExtraStore.Add(c);
        if (IsSelfSigned(c))
        {
            chain.ChainPolicy.CustomTrustStore.Add(c);
        }
    }
    var built = chain.Build(leaf);
    return new
    {
        built,
        order = chain.ChainElements.Select(e => e.Certificate.SubjectName.Name).ToArray(),
        status = chain.ChainStatus.Select(s => s.Status.ToString()).Distinct().ToArray(),
    };
}

async Task<IResult> SecurePdfAsync(HttpRequest request, bool protect)
{
    if (!Authorized(request.Headers.Authorization, secret))
    {
        logger.LogInformation("{Event}", "unauthorized");
        return Failure(401, "UNAUTHORIZED", "Missing or invalid credentials.");
    }
    if (!request.HasFormContentType)
    {
        return Failure(400, "INVALID_INPUT", "Expected a multipart form upload.");
    }

    var form = await request.ReadFormAsync();
    var file = form.Files.Count > 0 ? form.Files[0] : null;
    if (file is null || file.Length == 0)
    {
        return Failure(400, "INVALID_INPUT", "No PDF was sent.");
    }
    if (file.Length > MaxBytes)
    {
        return Failure(413, "TOO_LARGE", "That file is larger than this tool allows.");
    }

    // 127 bytes is the ceiling AES-256 (PDF 2.0, revision 6) allows for a
    // password; anything longer would be silently truncated by the encoder.
    var password = form["password"].ToString();
    var owner = form["owner"].ToString();
    if (password.Length is 0 or > 127 || owner.Length > 127)
    {
        return Failure(400, "INVALID_INPUT", "A password of 1 to 127 characters is required.");
    }

    byte[] input;
    using (var body = new MemoryStream())
    {
        await file.CopyToAsync(body);
        input = body.ToArray();
    }
    if (!LooksLikePdf(input))
    {
        logger.LogInformation("{Event} {Bytes}", "rejected_not_pdf", input.Length);
        return Failure(400, "INVALID_INPUT", "That file is not a PDF.");
    }

    var op = protect ? "protect" : "unlock";
    var started = DateTime.UtcNow;
    await concurrencyGate.WaitAsync();
    try
    {
        var output = await WithTimeout(
            () => protect ? Protect(input, password, owner) : Unlock(input, password),
            importTimeout);
        logger.LogInformation(
            "{Event} {InBytes} {OutBytes} {Ms}",
            $"ok_{op}", input.Length, output.Length, (DateTime.UtcNow - started).TotalMilliseconds);
        return Results.Bytes(output, "application/pdf");
    }
    catch (PdfInvalidPasswordException)
    {
        // Same exception either way round: opening a protected file with no
        // password (protect) or with the wrong one (unlock).
        return Failure(400, "INVALID_INPUT", protect
            ? "That PDF is already password-protected. Unlock it first."
            : "That password is not correct.");
    }
    catch (InvalidOperationException)
    {
        return Failure(400, "INVALID_INPUT", "That PDF is not password-protected.");
    }
    catch (TimeoutException)
    {
        logger.LogWarning("{Event} {InBytes}", $"timeout_{op}", input.Length);
        return Failure(504, "TIMEOUT", "Processing took too long and was stopped.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "{Event} {InBytes}", $"failed_{op}", input.Length);
        return Failure(502, "UPSTREAM_REJECTED", "The PDF could not be processed.");
    }
    finally
    {
        concurrencyGate.Release();
    }
}

static byte[] Protect(byte[] input, string password, string owner)
{
    using var stream = new MemoryStream(input);
    using var document = new PdfLoadedDocument(stream);
    var security = document.Security;
    security.KeySize = PdfEncryptionKeySize.Key256Bit;
    security.Algorithm = PdfEncryptionAlgorithm.AES;
    security.UserPassword = password;
    // Without a distinct owner password the open password also unlocks the
    // permissions — which is what "protect with a password" means to most
    // people, and strictly better than an owner password nobody was told.
    security.OwnerPassword = owner.Length > 0 ? owner : password;
    return Save(document);
}

static byte[] Unlock(byte[] input, string password)
{
    using var stream = new MemoryStream(input);
    using var document = new PdfLoadedDocument(stream, password);
    if (!document.IsEncrypted)
    {
        throw new InvalidOperationException("not encrypted");
    }
    document.Security.UserPassword = string.Empty;
    document.Security.OwnerPassword = string.Empty;
    return Save(document);
}

static byte[] Save(PdfLoadedDocument document)
{
    using var output = new MemoryStream();
    document.Save(output);
    return output.ToArray();
}

/// <summary>
/// The spec allows up to 1024 bytes of junk before the header, and real files
/// use that allowance — so this looks within it, not only at offset 0.
/// </summary>
static bool LooksLikePdf(byte[] bytes)
{
    var window = bytes.AsSpan(0, Math.Min(bytes.Length, 1024));
    return window.IndexOf("%PDF-"u8) >= 0;
}

/// <summary>Same bounded-wait contract as ImportAsync and ToPdfAsync.</summary>
static async Task<T> WithTimeout<T>(Func<T> work, TimeSpan timeout)
{
    var task = Task.Run(work);
    var winner = await Task.WhenAny(task, Task.Delay(timeout));
    if (winner != task)
    {
        throw new TimeoutException();
    }
    return await task;
}

/// <summary>
/// Renders an OOXML document to PDF with the matching Syncfusion engine. The
/// DocIO types are spelled out in full because <c>WordDocument</c> and
/// <c>FormatType</c> also exist in the EJ2 DocumentEditor namespace this file
/// already imports for /word/import — same names, unrelated types.
/// </summary>
static async Task<byte[]> ToPdfAsync(byte[] input, string type, TimeSpan timeout)
{
    var work = Task.Run(() =>
    {
        using var stream = new MemoryStream(input);
        using PdfDocument pdf = type switch
        {
            "docx" => RenderDocx(stream),
            "xlsx" => RenderXlsx(stream),
            _ => RenderPptx(stream),
        };
        using var output = new MemoryStream();
        pdf.Save(output);
        return output.ToArray();
    });

    var winner = await Task.WhenAny(work, Task.Delay(timeout));
    if (winner != work)
    {
        throw new TimeoutException();
    }
    return await work;
}

static PdfDocument RenderDocx(Stream stream)
{
    using var document = new Syncfusion.DocIO.DLS.WordDocument(stream, Syncfusion.DocIO.FormatType.Docx);
    using var renderer = new DocIORenderer();
    return renderer.ConvertToPDF(document);
}

static PdfDocument RenderXlsx(Stream stream)
{
    using var engine = new ExcelEngine();
    var workbook = engine.Excel.Workbooks.Open(stream);
    return new XlsIORenderer().ConvertToPDF(workbook);
}

static PdfDocument RenderPptx(Stream stream)
{
    using var presentation = Syncfusion.Presentation.Presentation.Open(stream);
    return PresentationToPdfConverter.Convert(presentation);
}

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
