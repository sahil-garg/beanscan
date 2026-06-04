const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
  'Access-Control-Max-Age':       '86400',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Strip Origin so Anthropic treats this as a server-to-server request
    // and add the browser-access header it requires for CORS requests
    const upstreamHeaders = new Headers(request.headers);
    upstreamHeaders.delete('origin');
    upstreamHeaders.set('anthropic-dangerous-direct-browser-access', 'true');

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: upstreamHeaders,
      body:    request.body,
    });

    // Return only content-type + our CORS headers — avoids the duplicate
    // access-control-* header bug caused by spreading upstream.headers
    const headers = new Headers(CORS_HEADERS);
    headers.set('Content-Type', upstream.headers.get('content-type') || 'application/json');

    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
