import type { Handle } from '@sveltejs/kit';

// the tags between <!-- app --> and <!-- /app --> in app.html are for the
// cockpit at /. it is only drawn in the browser, so they have to be in the html
// already. every other page brings its own title and canonical link. the one
// font file is preloaded with the scripts, so the text turns into it early
export const handle: Handle = ({ event, resolve }) =>
  resolve(event, {
    preload: ({ type }) => type === 'js' || type === 'css' || type === 'font',
    transformPageChunk: ({ html }) =>
      event.url.pathname === '/' ? html : html.replace(/\s*<!-- app -->[\s\S]*?<!-- \/app -->/, '')
  });
