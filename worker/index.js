/**
 * BeanScan CORS proxy — Cloudflare Worker
 *
 * Routes POST /v1/messages → api.anthropic.com, adding CORS headers so
 * the browser on GitHub Pages can call the Anthropic API directly.
 *
 * The API key travels from the browser → this Worker → Anthropic.
 * It is never stored here; the Worker is stateless.
 *
 * Deploy steps:
 *   1. Go to https://workers.cloudflare.com — sign up free
 *   2. Create a new Worker, paste this file, click Deploy
 *   3. Copy the worker URL (e.g. https://beanscan-proxy.YOUR_NAME.workers.dev)
 *   4. Paste it into BeanScan Settings → Proxy URL
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access',
  'Access-Control-Max-Age':       '86400',
};

export default {
  async fetch(request) {
    // Respond to preflight so the browser proceeds with the real request
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: request.headers,
      body:    request.body,
    });

    // Forward response body and status; add CORS header so browser accepts it
    return new Response(upstream.body, {
      status:  upstream.status,
      headers: { ...Object.fromEntries(upstream.headers), ...CORS_HEADERS },
    });
  },
};
