import { domainOf, platformOf } from './resourceUtils';

const HUES = [250, 160, 20, 200, 300, 40, 120, 340];

/** Letter tile coloured by domain. Avoids fetching third-party favicons (no request leaks which sites a user studies on). */
export function SiteMark({ url, size = 36 }: { url: string; size?: number }) {
  const domain = domainOf(url);
  const hue = HUES[[...domain].reduce((h, c) => h + c.charCodeAt(0), 0) % HUES.length];
  return (
    <span className="sitemark" style={{ width: size, height: size, ['--hue' as string]: hue } as React.CSSProperties} aria-hidden>
      {platformOf(url).charAt(0)}
    </span>
  );
}
