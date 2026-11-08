export function bangumiImageSource(source: string) {
  try {
    const url = new URL(source)
    if (
      url.protocol === 'https:' &&
      url.hostname === 'lain.bgm.tv' &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^\/(?:r\/\d+(?:x\d+)?\/)?pic\/cover\//.test(url.pathname)
    ) {
      url.search = ''
      url.hash = ''
      return '/api/bangumi/cover?image=' + encodeURIComponent(url.href)
    }
  } catch {}
  return source
}
