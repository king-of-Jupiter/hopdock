# Real OS mouse drag for Electron e2e on Windows: Playwright's synthetic mouse cannot drive the native drag loop.
param([int]$x1, [int]$y1, [int]$x2, [int]$y2)
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class M {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[M]::SetProcessDPIAware() | Out-Null
[M]::SetCursorPos($x1, $y1); Start-Sleep -Milliseconds 150
[M]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 150
for ($i = 1; $i -le 25; $i++) { [M]::SetCursorPos([int]($x1 + ($x2 - $x1) * $i / 25), [int]($y1 + ($y2 - $y1) * $i / 25)); Start-Sleep -Milliseconds 30 }
Start-Sleep -Milliseconds 200
[M]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
