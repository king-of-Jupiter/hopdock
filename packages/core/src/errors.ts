export interface AppIssue {
  code: string;
  title: string;
  message: string;
  hint: string;
  operation: string;
  action?: 'keys' | 'settings' | 'hosts';
}
type Rule = [RegExp, string, string, string, string, AppIssue['action']?];
const rules: Rule[] = [
  [/\b(?:dev-)?app-update\.yml\b/i, 'UPDATE_CONFIG', 'Update configuration is missing', 'This build is missing or cannot read its update source configuration.', 'Install a complete Hopdock build and retry. Your saved hosts and keys are preserved.'],
  [/TERMIUS_IMPORT_TIMEOUT/i, 'TERMIUS_TIMEOUT', 'Termius import took too long', 'Reading the local profile did not finish within two minutes.', 'Close Termius and retry. No changes were applied to your library.'],
  [/TERMIUS_PROFILE_TOO_LARGE/i, 'TERMIUS_SIZE', 'Termius profile is too large', 'The profile reader returned more than the supported 64 MiB of data.', 'Reduce old data in Termius or use a smaller local profile, then retry.'],
  [/TERMIUS_PROFILE_NOT_FOUND/i, 'TERMIUS_PROFILE', 'Termius profile was not found', 'No local Termius database was found for this user.', 'Install and sign in to Termius on this computer, let it load your data, then retry import.'],
  [/TERMIUS_KEY_UNAVAILABLE/i, 'TERMIUS_KEY', 'Termius data could not be unlocked', 'The local Termius encryption key is missing or does not match this profile.', 'Run Hopdock as the same user as Termius. Open and sign in to Termius, then retry import.'],
  [/TERMIUS_DECRYPT_FAILED|TERMIUS_ENCRYPTION_UNSUPPORTED/i, 'TERMIUS_DECRYPT', 'Termius data could not be decrypted', 'The saved profile has unsupported encryption or its data could not be authenticated.', 'Open Termius and verify your data is available, then retry. Your Hopdock library was left unchanged.'],
  [/TERMIUS_PROFILE_LOCKED|TERMIUS_READ_FAILED/i, 'TERMIUS_READ', 'Termius data could not be read', 'The local profile is locked, unavailable or uses an unsupported storage format.', 'Close Termius and retry import. Your existing library was left unchanged.'],
  [/TERMIUS_READER_UNAVAILABLE/i, 'TERMIUS_READER', 'Termius importer is unavailable', 'The built-in profile reader is missing from this build.', 'Use a complete Hopdock release build containing the Termius reader.'],
  [/invalid termius migration bundle/i, 'IMPORT_FORMAT', 'Termius data could not be imported', 'The profile reader returned unsupported or invalid data.', 'Close Termius and retry import. Your library was left unchanged.'],
  [/termius migration file is too large/i, 'IMPORT_SIZE', 'Termius profile is too large', 'Imported profile data exceeds the supported 64 MiB limit.', 'Reduce old data in Termius or use a smaller local profile, then retry.'],
  [/termius import .*already exists/i, 'IMPORT_CONFLICT', 'Import could not be completed', 'Imported credentials conflict with an existing local file or secret.', 'Your existing data was preserved. Restore the vault record or remove the orphaned imported credential before retrying.'],
  [/stored (?:vault|secrets) data is corrupt/i, 'VAULT_CORRUPT', 'Saved library could not be loaded', 'A local vault or credentials file is damaged or has an invalid format.', 'Your saved file was left unchanged. Restore it from a backup or report this error.'],
  [/latest.*yml|release.*not.*found/i, 'UPDATE_SOURCE', 'Update source unavailable', 'A compatible published update could not be found.', 'You can keep using this version. Check again after a new release is published.'],
  [/handshake failed|no matching.*(?:cipher|key|algorithm)|key exchange failed/i, 'SSH_INCOMPATIBLE', 'SSH configuration is incompatible', 'The client and server could not agree on a supported SSH algorithm.', 'Update the SSH server or choose a supported key type.'],
  [/snippet exited with non.zero/i, 'COMMAND_FAILED', 'Snippet command failed', 'The remote command finished with a non-zero exit status.', 'Check the script and the command output below.'],
  [/private key (?:file missing|is not available)|key storage is unavailable/i, 'KEY_MISSING', 'Private key unavailable', 'The private key is missing on this device.', 'Sync your vault or import the private key again in Keychain.', 'keys'],
  [/referenced key not found|unknown key|select a key from keychain/i, 'KEY_NOT_FOUND', 'SSH key not found', 'The selected key is no longer in Keychain.', 'Choose another key in the host settings, or import it again.', 'keys'],
  [/no stored password|password is required/i, 'PASSWORD_MISSING', 'Password needed', 'No account password is saved for this host.', 'Edit the host and save its account password.', 'hosts'],
  [/bad passphrase|incorrect passphrase|encrypted.*(?:passphrase|decrypt)|bad decrypt|integrity check failed/i, 'KEY_PASSPHRASE', 'Key could not be unlocked', 'The private key is encrypted and its passphrase is missing or incorrect.', 'Open the key in Keychain and enter the passphrase used to encrypt it.', 'keys'],
  [/unable to import private key|cannot read private key|private key is required|select a private ssh key|unsupported key format|invalid private key/i, 'KEY_INVALID', 'Invalid private key', 'The supplied text or file is not a supported private SSH key.', 'Import the complete private key, including its BEGIN and END lines. Check its passphrase.', 'keys'],
  [/unsupported private key component|putty export supports/i, 'KEY_FORMAT', 'Key format not supported', 'This key cannot be exported to PuTTY format.', 'Export the original private-key file instead.', 'keys'],
  [/key name is required/i, 'KEY_NAME', 'Give the key a name', 'The key label is empty.', 'Enter a label so you can identify this key.'],
  [/outside the managed keychain folder/i, 'EXPORT_LOCATION', 'Choose another export folder', 'The managed Keychain folder cannot be used for exports.', 'Save the exported key to a folder such as Documents.'],
  [/unsupported export format/i, 'EXPORT_FORMAT', 'Export format not supported', 'This export format is unavailable.', 'Choose Original private key or PuTTY (.ppk).'],
  [/winscp was not found/i, 'WINSCP_MISSING', 'WinSCP is not installed', 'Hopdock could not find WinSCP on this device.', 'Install WinSCP, or choose WinSCP.exe in Settings.', 'settings'],
  [/choose the winscp.exe/i, 'WINSCP_PATH', 'Choose the WinSCP application', 'The selected file is not a valid WinSCP.exe.', 'Choose WinSCP.exe from the installation folder.', 'settings'],
  [/unable to launch winscp/i, 'WINSCP_START', 'WinSCP could not start', 'Windows could not launch the configured application.', 'Check the WinSCP path in Settings and try opening it directly.', 'settings'],
  [/winscp integration is available on windows/i, 'WINSCP_PLATFORM', 'WinSCP needs Windows', 'WinSCP integration is unavailable on this operating system.', 'Use Hopdock’s built-in SFTP view instead.'],
  [/jump hosts are not configured/i, 'WINSCP_JUMP', 'Jump host is not supported', 'This WinSCP integration cannot open a connection through a jump host.', 'Configure the tunnel directly in WinSCP.'],
  [/certificate authentication is not supported/i, 'CERT_UNSUPPORTED', 'Certificate login is unavailable', 'SSH certificate authentication is not supported yet.', 'Choose SSH key, password or SSH agent in the host settings.', 'hosts'],
  [/ssh agent is unavailable/i, 'AGENT_MISSING', 'SSH agent unavailable', 'No SSH agent is configured for Hopdock.', 'Start an SSH agent and expose its socket, or select a key from Keychain.', 'hosts'],
  [/interactive challenge/i, 'AUTH_CHALLENGE', 'Additional verification required', 'The server requested a challenge that cannot use your saved password.', 'Use a supported password challenge or configure another server authentication method.'],
  [/all configured authentication methods failed|authentication (?:failed|failure)|permission denied \((?:publickey|password)|invalid credentials/i, 'AUTH_FAILED', 'Authentication failed', 'The server did not accept the supplied credentials.', 'Check the username, account password, selected key and its passphrase.', 'hosts'],
  [/ENOTFOUND|EAI_AGAIN|hostname.*not.*found|host.*does not exist/i, 'DNS_FAILED', 'Host could not be found', 'The server address could not be resolved.', 'Check the hostname and your network or VPN connection.', 'hosts'],
  [/ECONNREFUSED|connection refused/i, 'CONNECTION_REFUSED', 'Server refused the connection', 'Nothing accepted the connection at this address and port.', 'Check the SSH port, server status and firewall.', 'hosts'],
  [/ETIMEDOUT|ready timeout|timed? out|timeout/i, 'TIMEOUT', 'Connection timed out', 'The server did not respond in time.', 'Check your network, VPN and firewall, then try again.'],
  [/ENETUNREACH|EHOSTUNREACH|network.*unreachable|offline|fetch failed|failed to fetch/i, 'NETWORK', 'Connection unavailable', 'The network or remote service could not be reached.', 'Check your internet or VPN connection, then try again.'],
  [/ECONNRESET|EPIPE|connection.*closed|no session|SFTP connection is unavailable|not connected/i, 'CONNECTION_LOST', 'Connection interrupted', 'The SSH session has ended or is no longer available.', 'Reconnect to the host and repeat the operation.'],
  [/unknown host|pick a target host|no hosts to copy|unknown snippet/i, 'ENTRY_MISSING', 'Saved item unavailable', 'The selected host or snippet is no longer available.', 'Refresh the library and select an existing item.', 'hosts'],
  [/EACCES|EPERM|permission denied|access denied|not permitted/i, 'ACCESS_DENIED', 'Access denied', 'The operation is not allowed for this file or account.', 'Choose a writable location or check the SSH account’s file permissions.'],
  [/ENOENT|no such file|file not found/i, 'FILE_MISSING', 'File not found', 'The requested file or folder is no longer available.', 'Refresh the folder and choose an existing path.'],
  [/ENOSPC|disk.*full|quota exceeded/i, 'STORAGE_FULL', 'Not enough storage', 'There is not enough space to complete this operation.', 'Free space on the destination device and retry.'],
  [/EEXIST|already exists/i, 'FILE_EXISTS', 'Destination already exists', 'A file or folder with this name already exists.', 'Choose another name or explicitly replace the existing file.'],
  [/EBUSY|resource busy|file.*locked/i, 'FILE_BUSY', 'File is in use', 'Another application is using the selected file.', 'Close the application using it and try again.'],
  [/ENOTDIR|EISDIR|choose a folder|absolute local file path/i, 'PATH_INVALID', 'Invalid file location', 'The selected path is not suitable for this operation.', 'Choose a file or folder of the expected type.'],
  [/same file/i, 'SAME_FILE', 'Choose a different destination', 'The source and destination refer to the same file.', 'Select another folder or file name.'],
  [/valid octal mode/i, 'PERMISSIONS_INVALID', 'Invalid permissions', 'The permissions value is not valid.', 'Use three or four octal digits, for example 644 or 0755.'],
  [/invalid host address or port/i, 'HOST_INVALID', 'Check the host address', 'The host address or port is invalid.', 'Use a hostname or IP address and a port between 1 and 65535.', 'hosts'],
  [/sync is in progress|wait for key generation/i, 'OPERATION_BUSY', 'Another operation is running', 'The vault is being synced or a key is being written.', 'Wait for that operation to finish, then retry.'],
  [/cannot decrypt synced vault data/i, 'SYNC_DECRYPT', 'Vault could not be decrypted', 'The sync encryption password does not match, or the encrypted data is damaged.', 'Use the same sync encryption password on every device. No changes were applied.', 'settings'],
  [/set a sync encryption password|use at least 12 characters/i, 'SYNC_PASSWORD', 'Sync encryption password needed', 'Sync requires an encryption password of at least 12 characters.', 'Save the same encryption password on every device in Settings.', 'settings'],
  [/encryption password is already in use/i, 'SYNC_PASSWORD_LOCKED', 'Encryption password cannot be changed', 'This vault already uses an encryption password.', 'Keep the original password on all devices.', 'settings'],
  [/sign in to sync|sync not configured|enter your account email/i, 'SYNC_ACCOUNT', 'Sign in to sync', 'No sync account is configured on this device.', 'Enter your account email and password in Settings.', 'settings'],
  [/no supabase configuration|sync is unavailable in this build/i, 'SYNC_BUILD', 'Sync is unavailable in this build', 'The app was built without the cloud connection settings.', 'Use a build configured for your Supabase project.'],
  [/PGRST205|could not find.*table|relation.*does not exist/i, 'SYNC_DATABASE', 'Cloud database is not ready', 'The required sync table is missing or unavailable.', 'Apply the project’s database schema and check its API access settings.'],
  [/invalid login credentials|email not confirmed|invalid.*refresh.*token|jwt.*expired/i, 'SYNC_LOGIN', 'Sync sign-in failed', 'The cloud service did not accept this account or session.', 'Check your email and password, confirm your email, and sign in again.', 'settings'],
  [/row.level security|violates.*policy|PGRST301|42501/i, 'SYNC_ACCESS', 'Cloud access denied', 'The sync account does not have access to the vault data.', 'Check the project’s database permissions and vault ownership.'],
  [/invalid synced|invalid key id|invalid.*identity|invalid.*material/i, 'SYNC_DATA', 'Vault data is invalid', 'Received data could not be validated.', 'Retry sync. If it repeats, check the other device’s vault. No remote changes were applied.'],
  [/update checks are available in installed/i, 'UPDATE_DEV', 'Updates require a release build', 'Update checks are available in installed release builds.', 'Install a packaged Hopdock release to use automatic updates.'],
  [/no downloaded update is ready/i, 'UPDATE_NOT_READY', 'Update is not ready', 'No downloaded update is ready to install.', 'Check for updates and wait for the download to finish.'],
  [/(?:HTTP|status(?: code)?)[ :]+404|latest.*yml|release.*not.*found/i, 'SERVICE_NOT_FOUND', 'Remote resource unavailable', 'The requested remote resource could not be found.', 'Check the service configuration or try again later.'],
  [/(?:HTTP|status(?: code)?)[ :]+429|too many requests|rate limit/i, 'RATE_LIMIT', 'Too many requests', 'The service temporarily limited requests.', 'Wait a moment before trying again.'],
  [/(?:HTTP|status(?: code)?)[ :]+5\d\d|service unavailable|bad gateway/i, 'SERVICE_DOWN', 'Service temporarily unavailable', 'The remote service could not complete the request.', 'Try again later.'],
  [/application window is unavailable|context.*destroyed|no handler registered|hopdock.*undefined/i, 'APP_UNAVAILABLE', 'Application service unavailable', 'An internal application service is not ready.', 'Restart Hopdock and repeat the operation.'],
];

/** Stable, credential-free messages. Unknown exceptions never become raw UI text. */
export function explainError(error: unknown, operation = ''): AppIssue {
  const value = error as { message?: unknown; code?: unknown; status?: unknown } | null;
  const message = typeof error === 'string' ? error : String(value?.message ?? '');
  const marker = message.indexOf('HOPDOCK_ERROR:');
  if (marker >= 0) {
    try {
      const issue = JSON.parse(message.slice(marker + 14));
      const source = typeof issue.operation === 'string' && /^[\w: -]{0,80}$/.test(issue.operation) ? issue.operation : operation;
      const rule = rules.find((entry) => entry[1] === issue.code);
      if (rule) { const [, code, title, body, hint, action] = rule; return { code, title, message: body, hint, action, operation: source }; }
      if (issue.code === 'KEYGEN_MISSING') return explainError({ code: 'ENOENT' }, 'keys:generate');
      if (issue.code === 'SFTP_UNSUPPORTED' || issue.code === 'SFTP_FAILED') return explainError({ code: issue.code === 'SFTP_UNSUPPORTED' ? 8 : 4 }, source.startsWith('sftp:') ? source : 'sftp:operation');
    } catch {}
  }
  const searchable = `${value?.code ?? ''} ${value?.status ? 'HTTP ' + value.status : ''} ${message}`;
  if (operation === 'keys:generate' && /ENOENT|ssh-keygen.*not.*found/i.test(searchable)) return { code: 'KEYGEN_MISSING', title: 'SSH key generator unavailable', message: 'ssh-keygen is not installed or cannot be found.', hint: 'Install OpenSSH tools and add ssh-keygen to PATH, or import an existing key.', operation, action: 'keys' };
  if (value?.status === 401 || value?.status === 403) {
    if (operation.startsWith('sync:')) return explainError(value.status === 401 ? 'invalid login credentials' : 'row level security', operation);
    return explainError('access denied', operation);
  }
  for (const [match, code, title, body, hint, action] of rules) if (match.test(searchable)) return { code, title, message: body, hint, action, operation };
  if (typeof value?.code === 'number' && operation.startsWith('sftp:')) {
    if (value.code === 2) return explainError('ENOENT', operation);
    if (value.code === 3) return explainError('EACCES', operation);
    if (value.code === 8) return { code: 'SFTP_UNSUPPORTED', title: 'File operation not supported', message: 'The server does not support this SFTP operation.', hint: 'Choose another operation or check the server’s SFTP configuration.', operation };
    return { code: 'SFTP_FAILED', title: 'File operation failed', message: 'The server could not complete the file operation.', hint: 'Refresh the folder and check the path, permissions and available storage.', operation };
  }
  return { code: 'UNEXPECTED', title: 'Operation could not be completed', message: 'An unexpected error interrupted this operation.', hint: 'Try again. If it repeats, restart Hopdock and report the error code.', operation };
}
