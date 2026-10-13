# Automatic OS icons

After a successful terminal or SFTP SSH connection, Hopdock probes the server in separate exec channels on that connection. It never sends probes to the user's shell, reconnects for detection, changes shell variables, uses sudo or writes shell history. The terminal becomes usable immediately.

Commands: uname -s; on Linux, cat /etc/os-release with /usr/lib/os-release fallback; on Darwin, sw_vers -productVersion; unknown shells are checked with cmd /c ver and the RouterOS platform command. Simple commands work with fish as well as POSIX shells. Linux release data is parsed as text, never sourced or evaluated. ID selects the distribution, ID_LIKE supplies an icon family for unknown derivatives, PRETTY_NAME labels the tooltip and VERSION_ID is retained.

The SSH authentication banner can supply a clearly labeled fallback hint if probes fail. SSH does not guarantee OS metadata: generic OpenSSH banners and arbitrary welcome text cannot identify a distro. A failed/denied/unknown probe preserves previous metadata and never fails the connection. Each probe has a 1.8-second deadline and a 16 KiB combined output limit; closing a probe affects its channel only.

Host.os persists in the vault and syncs as host metadata. The renderer receives a hostUpdated event and updates library data and session tabs without remounting TerminalView. Detected OS takes precedence over name/tag guesses. Changing the host address/port clears stale OS metadata. Results from closed/replaced connections or changed host endpoints are discarded; saving waits for an active sync to finish.

Known icon families include Ubuntu, Debian, Arch, Fedora, Alpine, Rocky/Alma/CentOS/RHEL, Mint, openSUSE, Gentoo, NixOS, Linux, BSD, macOS, Windows, OpenWrt and RouterOS. Unknown hosts retain a generic SSH icon before successful detection.

Validation: 4 parser/probe unit cases, 28 Electron application scenarios, 19 browser checks and 16 SSH checks passed, along with typecheck/build. The local SSH fixture returns Debian release data, verifies the saved identity and live tab icon, and confirms the probes never enter shellInput. Alternative platforms are covered with simulated command replies, not live Windows/macOS/RouterOS SSH servers.
