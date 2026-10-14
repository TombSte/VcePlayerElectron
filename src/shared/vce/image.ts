/** Reader/reference pools historically carry area images as an <img> tag.
 * Synthetic/session data can instead carry a data URL. Never use the tag itself
 * as an img.src or insert it into the DOM to extract the source.
 */
export function areaImageSource(image: string | undefined): string {
  if (!image) return ''
  if (!/^\s*<img\b/i.test(image)) return image
  return image.match(/\bsrc\s*=\s*["']([^"']*)["']/i)?.[1] ?? ''
}
