// Static, server-less SPA: render entirely on the client so the app works with
// no server and loads offline after first visit (adapter-static + fallback).
export const ssr = false;
export const prerender = false;
export const trailingSlash = 'never';
