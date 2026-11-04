/**
 * The page background of each theme, read from the theme definitions in
 * `styles/01-base.css` (`--background` on `:root` and on
 * `:root[data-theme="dark"]`), so the browser/installed-app chrome
 * (`<meta name="theme-color">`, the manifest) matches the page without a
 * second copy of the colors. DOM-free: vite.config.ts uses it at build time.
 */
export interface ThemeBackgrounds {
  readonly light: string;
  readonly dark: string;
}

function blockBackground(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Theme block ${selector} not found`);
  const block = css.slice(start, css.indexOf("}", start));
  const match = /--background:\s*([^;]+);/.exec(block);
  if (!match?.[1]) throw new Error(`${selector} defines no --background`);
  return match[1].trim();
}

export function themeBackgrounds(baseCss: string): ThemeBackgrounds {
  return {
    light: blockBackground(baseCss, ":root"),
    dark: blockBackground(baseCss, ':root[data-theme="dark"]'),
  };
}
