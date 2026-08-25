using System.Diagnostics;

var root = AppContext.BaseDirectory;
var electron = Path.Combine(root, "runtime", "electron.exe");
var app = Path.Combine(root, "resources", "app");
if (!File.Exists(electron) || !File.Exists(Path.Combine(app, "package.json")))
{
    Console.Error.WriteLine("Qt UI Copilot runtime files are incomplete.");
    return 2;
}
using var child = Process.Start(new ProcessStartInfo
{
    FileName = electron,
    WorkingDirectory = root,
    UseShellExecute = false,
    Arguments = Environment.GetEnvironmentVariable("QT_UI_COPILOT_E2E") == "1"
        ? $"--remote-debugging-port=9222 \"{app}\""
        : $"\"{app}\"",
});
if (child is null) return 3;
await child.WaitForExitAsync();
return child.ExitCode;
