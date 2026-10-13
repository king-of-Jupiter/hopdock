import http from 'node:http';
export async function startSyncServer() {
  const rows = new Map();
  const metrics = { signIns: 0, refreshes: 0 };
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid' };
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: user.aud, role: user.role })).toString('base64url'), 'test-signature'].join('.');
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    const url = new URL(req.url, 'http://localhost');
    let body = ''; for await (const chunk of req) body += chunk;
    if (url.pathname === '/auth/v1/token') {
      const credentials = JSON.parse(body);
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        metrics.refreshes++;
        if (credentials.refresh_token !== 'test-refresh') return send(400, { error: 'invalid_grant', error_description: 'Invalid refresh token' });
      } else {
        metrics.signIns++;
        if (credentials.email !== user.email || credentials.password !== 'test-account-password') return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      }
      return send(200, { access_token: token, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user });
    }
    if (url.pathname === '/auth/v1/signup') return send(200, { id: '22222222-2222-4222-8222-222222222222', email: JSON.parse(body).email });
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { message: 'Authentication required' });
    if (url.pathname === '/auth/v1/logout') return send(200, {});
    if (url.pathname === '/auth/v1/user') return send(200, user);
    if (url.pathname === '/rest/v1/vault_items') {
      if (req.method === 'POST') {
        const items = JSON.parse(body);
        for (const row of items) { if (row.user_id !== user.id) return send(403, { message: 'RLS denied' }); rows.set(row.id, row); }
        return send(201, null);
      }
      const since = (url.searchParams.get('updated_at') ?? 'gt.').slice(3);
      const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 1000);
      return send(200, [...rows.values()].filter((row) => row.user_id === user.id && row.updated_at > since).sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id)).slice(offset, offset + limit));
    }
    send(404, { message: 'Unknown fixture endpoint' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, rows, metrics, close: () => new Promise((resolve) => server.close(resolve)) };
}
