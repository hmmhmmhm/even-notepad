export function installComputerFixture() {
  const entries = [
    { name: 'Fixture A', url: 'http://127.0.0.1:3456', token: 'fixture-a' },
    { name: 'Fixture B', url: 'http://192.0.2.10:3456', token: 'fixture-b' },
  ];
  const originalFetch = window.fetch.bind(window);
  window.fetch = (resource, options) => {
    const url = new URL(typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url, location.href);
    if (!entries.some(entry => entry.url === url.origin)) return originalFetch(resource, options);
    if (url.pathname === '/api/sessions') return Promise.resolve(Response.json({ sessions: [{ id: 'fixture-session', title: (entries.find(entry => entry.url === url.origin)?.name ?? 'Fixture') + ' session' }] }));
    if (url.pathname.endsWith('/history')) return Promise.resolve(Response.json({ history: [] }));
    if (url.pathname === '/api/messages') return Promise.resolve(Response.json({ state: 'idle', messages: [] }));
    return Promise.resolve(new Response('', { status: 404 }));
  };
  return JSON.stringify(entries);
}
