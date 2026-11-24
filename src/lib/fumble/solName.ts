/** The name as it is looked up: lower case, without `.sol`, or null when the text is not a plain `.sol` name. (Nothing server-only here, so the page can use it too.) */
export function solName(input: string): string | null {
  const m = /^([a-z0-9_-]{1,63})\.sol$/i.exec(input.trim());
  return m ? m[1].toLowerCase() : null;
}
