using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;

internal static class Program
{
    private static readonly Guid ApplicationGuid = new("2a1ddbc4-4503-4392-9548-d0010d1ba9b1");

    private static int Main(string[] args)
    {
        try
        {
            if (args.Length == 0)
            {
                Usage();
                return 2;
            }

            switch (args[0])
            {
                case "info" when args.Length == 2:
                    Info(args[1]);
                    return 0;
                case "decrypt" when args.Length is 4 or 5:
                    Decrypt(args[1], args[2], args[3], args.Length == 5 ? args[4] : null);
                    return 0;
                case "encrypt" when args.Length == 5:
                    Encrypt(args[1], args[2], args[3], Guid.Parse(args[4]));
                    return 0;
                case "legacy-hash" when args.Length == 2:
                    Console.WriteLine($"0x{LegacyHash(File.ReadAllText(args[1], Encoding.UTF8)):x8}");
                    return 0;
                default:
                    Usage();
                    return 2;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"error: {ex.Message}");
            return 1;
        }
    }

    private static void Usage()
    {
        Console.Error.WriteLine("LegacyDataTool info <container>");
        Console.Error.WriteLine("LegacyDataTool decrypt <container> <xml-out> <key-file> [expected-sha256]");
        Console.Error.WriteLine("LegacyDataTool encrypt <xml-in> <container-out> <key-file> <update-guid>");
        Console.Error.WriteLine("LegacyDataTool legacy-hash <utf8-xml>");
        Console.Error.WriteLine("key-file is HeroicDemo.update, CBLoaderKeyStore XML, or one base64 fallback key");
    }

    private static byte[] ReadKey(string path, Guid updateId)
    {
        var source = File.ReadAllText(path).Trim();
        string encoded;
        if (source.StartsWith('<'))
        {
            var document = System.Xml.Linq.XDocument.Parse(source);
            var matching = document.Descendants().FirstOrDefault(element =>
                element.Name.LocalName.Equals($"Update{updateId}", StringComparison.OrdinalIgnoreCase) ||
                (element.Name.LocalName == "UpdateKeyInfo" &&
                 Guid.TryParse((string?)element.Attribute("Id"), out var id) && id == updateId));
            var fallback = document.Descendants().FirstOrDefault(element => element.Name.LocalName == "FallbackKey");
            encoded = (matching ?? fallback)?.Value.Trim()
                ?? throw new InvalidDataException($"no key for update {updateId} and no fallback in {path}");
        }
        else
        {
            encoded = source;
        }
        var key = Convert.FromBase64String(encoded);
        if (key.Length is not (16 or 24 or 32))
            throw new InvalidDataException($"AES key is {key.Length} bytes; expected 16, 24, or 32");
        return key;
    }

    private static void Info(string path)
    {
        using var input = File.OpenRead(path);
        Span<byte> prefix = stackalloc byte[16];
        input.ReadExactly(prefix);
        Console.WriteLine($"update-guid: {new Guid(prefix)}");
        Console.WriteLine($"application-guid: {ApplicationGuid}");
        Console.WriteLine($"iv: {Convert.ToHexString(ApplicationGuid.ToByteArray()).ToLowerInvariant()}");
        Console.WriteLine($"container-bytes: {input.Length.ToString(CultureInfo.InvariantCulture)}");
    }

    private static void Decrypt(string inputPath, string outputPath, string keyPath, string? expectedHash)
    {
        using var input = File.OpenRead(inputPath);
        Span<byte> prefix = stackalloc byte[16];
        input.ReadExactly(prefix);
        var updateId = new Guid(prefix);
        var key = ReadKey(keyPath, updateId);

        using (var aes = CreateAes(key))
        using (var crypto = new CryptoStream(input, aes.CreateDecryptor(), CryptoStreamMode.Read))
        using (var gzip = new GZipStream(crypto, CompressionMode.Decompress))
        using (var output = File.Create(outputPath))
        {
            gzip.CopyTo(output);
            output.Flush(true);
        }

        var digest = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(outputPath))).ToLowerInvariant();
        if (expectedHash is not null && !digest.Equals(expectedHash, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException($"SHA-256 mismatch: got {digest}, expected {expectedHash}");
        Console.WriteLine($"update-guid: {updateId}");
        Console.WriteLine($"sha256: {digest}");
    }

    private static void Encrypt(string inputPath, string outputPath, string keyPath, Guid updateId)
    {
        var key = ReadKey(keyPath, updateId);
        using var output = File.Create(outputPath);
        output.Write(updateId.ToByteArray());
        using var aes = CreateAes(key);
        using var crypto = new CryptoStream(output, aes.CreateEncryptor(), CryptoStreamMode.Write, leaveOpen: true);
        using (var gzip = new GZipStream(crypto, CompressionLevel.Optimal, leaveOpen: true))
        using (var input = File.OpenRead(inputPath))
            input.CopyTo(gzip);
        crypto.FlushFinalBlock();
        output.Flush(true);
    }

    private static Aes CreateAes(byte[] key)
    {
        var aes = Aes.Create();
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;
        aes.Key = key;
        aes.IV = ApplicationGuid.ToByteArray();
        return aes;
    }

    private static uint LegacyHash(string value)
    {
        uint hash = 5381;
        foreach (var codeUnit in value)
            hash = unchecked(hash * 33 + codeUnit);
        return hash;
    }
}
