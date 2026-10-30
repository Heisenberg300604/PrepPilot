import { describe, expect, it } from 'vitest';
import { parsePlaylistUrl, parseVideoUrl } from './youtubeUrl';

describe('parseVideoUrl', () => {
  const id = 'dQw4w9WgXcQ';
  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&list=PLabcdefghijk`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=x`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `youtube.com/watch?v=${id}`,
  ])('accepts %s', (u) => expect(parseVideoUrl(u)).toBe(id));
  it.each(['', 'nope', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short', 'javascript:alert(1)'])('rejects %j', (u) => expect(parseVideoUrl(u)).toBeNull());
});

describe('parsePlaylistUrl', () => {
  it('reads list ids', () => {
    expect(parsePlaylistUrl('https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')).toBe('PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf');
    expect(parsePlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghijk')).toBe('PLabcdefghijk');
  });
  it('rejects private/auto lists and foreign hosts', () => {
    for (const u of ['https://www.youtube.com/playlist?list=WL', 'https://www.youtube.com/playlist?list=RDdQw4w9WgXcQ', 'https://evil.com/playlist?list=PLabcdefghijk', 'https://www.youtube.com/playlist']) expect(parsePlaylistUrl(u)).toBeNull();
  });
});
