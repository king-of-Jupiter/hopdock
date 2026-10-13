/* Preview harness: fake window.hopdock so the built renderer runs in a plain browser. */
(function () {
  var enc = function (s) {
    var bytes = new TextEncoder().encode(s);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  };
  var G = '\x1b[32m';
  var X = '\x1b[0m';
  var P = G + 'root@web-02:~#' + X + ' ';

  var groups = [
    { id: 'g-prod', vaultId: 'v-personal', name: 'Production', sort: 1 },
    { id: 'g-staging', vaultId: 'v-personal', name: 'Staging', sort: 2 },
    { id: 'g-dev', vaultId: 'v-personal', name: 'Development', sort: 3 },
    { id: 'g-homelab', vaultId: 'v-shared', name: 'Homelab', sort: 4 },
  ];
  function H(id, groupId, name, username, host, tags, ms, extra) {
    return Object.assign(
      { id: id, vaultId: 'v-personal', groupId: groupId, name: name, host: host, port: 22, username: username, auth: { type: 'key', keyId: 'k-ed' }, portForwards: [], tags: tags, remark: '', sort: 0, starred: false, latencyMs: ms, updatedAt: '' },
      extra || {},
    );
  }
  var hosts = [
    H('web-01', 'g-prod', 'web-01', 'root', '3.12.44.10', ['ubuntu', 'nginx'], 24),
    H('web-02', 'g-prod', 'web-02', 'root', '3.12.44.11', ['ubuntu', 'nginx', 'prod'], 22, { starred: true }),
    H('db-01', 'g-prod', 'db-01', 'ubuntu', '10.0.1.5', ['debian', 'postgres'], 31),
    H('vps-fi', 'g-prod', 'vps-fi', 'root', '95.216.10.4', ['ubuntu', 'backup'], 41),
    H('staging-app', 'g-staging', 'staging-app', 'ubuntu', '18.213.24.7', ['ubuntu'], 48),
    H('staging-db', 'g-staging', 'staging-db', 'ubuntu', '18.213.24.8', ['debian', 'postgres'], 51),
    H('dev-box', 'g-dev', 'dev-box', 'alex', '192.168.1.22', ['arch'], 3, { auth: { type: 'agent' } }),
    H('k8s-node', 'g-dev', 'k8s-node', 'alex', '10.10.0.3', ['k3s'], 6),
    H('ci-runner', 'g-dev', 'ci-runner', 'gitlab', '10.10.0.5', ['docker'], 7),
    H('monitoring', 'g-dev', 'monitoring', 'alex', '10.10.0.9', ['grafana'], 5),
    H('home-lab', 'g-homelab', 'home-lab', 'pi', '192.168.0.10', ['pi'], 2, { vaultId: 'v-shared' }),
    H('nas', 'g-homelab', 'nas', 'admin', '192.168.0.20', ['backup'], 2, { vaultId: 'v-shared', auth: { type: 'password' } }),
  ];
  var keys = [
    { id: 'k-ed', vaultId: 'v-personal', name: 'id_ed25519', kind: 'Ed25519', fingerprint: 'SHA256:mQ3vKp9xF2nL8sDfSHOT', publicKey: 'ssh-ed25519 AAAAshot alex@hopdock', privateRef: '', updatedAt: '' },
    { id: 'k-rsa', vaultId: 'v-shared', name: 'id_rsa (legacy)', kind: 'RSA', fingerprint: 'SHA256:7HbT2wQzSHOT', publicKey: 'ssh-rsa AAAAshot friends@hopdock', privateRef: '', updatedAt: '' },
  ];
  var snippets = [
    { id: 's-sysinfo', vaultId: 'v-personal', folder: 'diagnostics', name: 'sysinfo', script: 'uname -a && uptime && df -h /', vars: [], updatedAt: '' },
    { id: 's-dclean', vaultId: 'v-personal', folder: 'docker', name: 'docker cleanup', script: 'docker system prune -af --filter "until=${hours}h"', vars: ['hours'], updatedAt: '' },
  ];

  if (!window.HOPDOCK_TEST_FIXTURES) {
    hosts = []; groups = []; keys = []; snippets = [];
  }
  var dataCbs = new Set();
  var BANNER =
    'Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-105-generic x86_64)\r\n' +
    'Last login: Fri Oct  9 22:14:03 2026 from 10.0.0.7\r\n' +
    P + 'neofetch\r\n' +
    '            .-/+oossssoo+/-               ' + G + 'root@web-02' + X + '\r\n' +
    '        `:+ssssssssssssssssss+:`           OS: Ubuntu 22.04.4 LTS x86_64\r\n' +
    '      -+ssssssssssssssssssyyssss+-         Kernel: 5.15.0-105-generic\r\n' +
    '    .ossssssssssssssssssdMMMnysssso.       Uptime: 24 days, 6 hours, 13 mins\r\n' +
    '   /ssssssssssshdmmNNmmyNMMMMhssssss/      Packages: 1124 (dpkg)\r\n' +
    '  +ssssssssshmydMMMMMMMNddddyssssss+       Shell: bash 5.1.16\r\n' +
    ' /sssssssshNMMMyhhhhyyyyhmNMMMNhssss/      CPU: 2 x Intel Xeon Platinum 8171M\r\n' +
    '.ssssssssdMMNdhhhhhhhhddddhhMMNssssss.     Memory: 1.2GiB / 3.8GiB (32%)\r\n' +
    P + 'uptime\r\n' +
    ' 15:42:17 up 24 days,  6:13,  1 user,  load average: 0.08, 0.12, 0.09\r\n' +
    P + 'df -h /\r\n' +
    'Filesystem      Size  Used Avail Use% Mounted on\r\n' +
    '/dev/sda1        78G   12G   62G  17% /\r\n' +
    P + 'free -h\r\n' +
    '               total        used        free      shared  buff/cache   available\r\n' +
    'Mem:           3.8Gi       1.2Gi       1.9Gi        12Mi       800Mi       2.4Gi\r\n' +
    'Swap:             0B          0B          0B\r\n' +
    P + 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"\r\n' +
    'NAMES            STATUS              PORTS\r\n' +
    'nginx            Up 24 days          0.0.0.0:80->80/tcp\r\n' +
    'postgres         Up 24 days (healthy) 5432/tcp\r\n' +
    'redis            Up 12 days          6379/tcp\r\n' +
    P;

  function entriesFor(path) {
    var deep = path !== '/';
    var dirs = deep
      ? ['etc', 'var', 'home', 'opt', 'srv', 'usr']
      : ['etc', 'var', 'home', 'root', 'opt', 'srv', 'tmp', 'mnt'];
    var files = deep
      ? [
          ['nginx.conf', 2341, 1727097600],
          ['fastcgi_params', 1053, 1719792000],
          ['sites-enabled', 0, 0],
          ['app.log', 48210, 1727184000],
          ['deploy.sh', 640, 1719792000],
          ['docker-compose.yml', 1120, 1719792000],
        ]
      : [
          ['.bashrc', 3110, 1719792000],
          ['.profile', 807, 1719792000],
          ['.viminfo', 12288, 1727184000],
          ['notes.txt', 420, 1727097600],
        ];
    var out = dirs.map(function (d, i) {
      return { filename: d, longname: 'drwxr-xr-x', size: 4096, mtime: 1719792000 + i * 86400, mode: 16877, isDirectory: true };
    });
    return out.concat(
      files
        .filter(function (f) {
          return f[1] > 0;
        })
        .map(function (f, i) {
          return { filename: f[0], longname: '-rw-r--r--', size: f[1], mtime: f[2] + i * 3600, mode: 33188, isDirectory: false };
        }),
    );
  }

  window.hopdock = {
    version: '0.0.6',
    files: {
      pick: function () { return Promise.resolve(null); },
      places: function () { return Promise.resolve([{ name: 'Home', path: '/home/demo' }, { name: 'Downloads', path: '/home/demo/Downloads' }]); },
      list: function (path) { return Promise.resolve({ path: path, parent: '/home/demo', separator: '/', entries: [{ name: 'id_ed25519', path: path + '/id_ed25519', directory: false, size: 411 }, { name: 'Documents', path: path + '/Documents', directory: true, size: 0 }] }); },
      exists: function () { return Promise.resolve(false); },
    },
    vault: {
      get: function () { return Promise.resolve({ hosts: hosts, groups: groups, keys: keys, snippets: snippets }); },
      onHostUpdated: function () { return function () {}; },
      readHostPassword: function () { return Promise.resolve('preview-password'); },
      importTermius: function () { return Promise.resolve({ hosts: 0, groups: 0, keys: 0, snippets: 0, skipped: 0, warnings: [] }); },
      saveGroup: function (name) { var existing = groups.find(function (g) { return g.name.toLowerCase() === name.trim().toLowerCase(); }); if (existing) return Promise.resolve(existing); var g = { id: 'g-' + Date.now(), vaultId: 'v-personal', name: name.trim(), sort: groups.length }; groups.push(g); return Promise.resolve(g); },
      saveHost: function (input, id) {
        var h = { id: id || 'h-' + Date.now(), vaultId: 'v-personal', groupId: input.groupId || null, name: input.name, host: input.host, port: input.port, username: input.username, auth: input.auth, portForwards: [], tags: input.tags, remark: '', sort: 99, starred: false, updatedAt: '' };
        hosts = hosts.filter(function (entry) { return entry.id !== h.id; }); hosts.push(h);
        return Promise.resolve(h);
      },
      deleteHost: function (id) { hosts = hosts.filter(function (h) { return h.id !== id; }); return Promise.resolve(); },
      setSecret: function () { return Promise.resolve(); },
    },
    ssh: {
      connect: function (p) {
        var id = p.hostId;
        setTimeout(function () {
          dataCbs.forEach(function (cb) { cb({ id: id, data: enc(BANNER) }); });
        }, 200);
        return Promise.resolve(id);
      },
      write: function () { return Promise.resolve(); },
      resize: function () { return Promise.resolve(); },
      exec: function () { return Promise.resolve({ stdout: 'shot-ok\n', stderr: '', code: 0 }); },
      close: function () { return Promise.resolve(); },
      onData: function (cb) { dataCbs.add(cb); return function () { dataCbs.delete(cb); }; },
      onClose: function () { return function () {}; },
    },
    sftp: {
      realpath: function () { return Promise.resolve('/root'); },
      list: function (id, path) { return Promise.resolve(entriesFor(path)); },
      downloadTo: function () { return Promise.resolve(null); },
      uploadFrom: function () { return Promise.resolve(null); },
      mkdir: function () { return Promise.resolve(); },
      remove: function () { return Promise.resolve(); },
      rename: function () { return Promise.resolve(); },
      chmod: function () { return Promise.resolve(); },
      copy: function () { return Promise.resolve(); },
      onProgress: function () { return function () {}; },
    },
    keys: {
      read: function () { return Promise.resolve({ privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nPreview key material\n-----END OPENSSH PRIVATE KEY-----', passphrase: '' }); },
      update: function (id, input) { var key = keys.find(function (key) { return key.id === id; }); key.name = input.name; return Promise.resolve(key); },
      export: function (id, path) { return Promise.resolve(path); },
      generate: function (name) { return Promise.resolve(keys[0]); },
      importFile: function () { return Promise.resolve(null); },
      delete: function () { return Promise.resolve(); },
      copyId: function () { return Promise.resolve('OK'); },
    },
    snippets: {
      run: function () { return Promise.resolve({ stdout: 'shot-ok\n', stderr: '', code: 0 }); },
      save: function (input, id) { return Promise.resolve({ id: id || 's-shot', vaultId: 'v-personal', name: input.name, folder: input.folder, script: input.script, vars: [], updatedAt: '' }); },
      remove: function () { return Promise.resolve(); },
    },
    sync: {
      status: function () { return Promise.resolve({ configured: false, backendConfigured: true, projectUrl: 'https://preview.supabase.co', passwordsConfigured: !!this.passwordsConfigured, lastSyncAt: 'never', lastError: null }); },
      saveCreds: function () { return Promise.resolve(); },
      setEncryptionPassword: function () { this.passwordsConfigured = true; return Promise.resolve(); },
      syncNow: function () { return Promise.resolve({ pushed: 0, pulled: 0 }); },
    },
    winscp: {
      status: function () { return Promise.resolve({ supported: true, path: 'C:\\Program Files (x86)\\WinSCP\\WinSCP.exe' }); },
      configure: function () { return Promise.resolve(); },
      open: function () { return Promise.resolve(); },
    },
    updater: {
      status: function () { return Promise.resolve({ state: 'idle', revision: 0 }); },
      install: function () { return Promise.resolve(); },
      check: function () { return Promise.resolve(); },
      onStatus: function () { return function () {}; },
    },
  };
})();
