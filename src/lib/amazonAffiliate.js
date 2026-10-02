export const AMAZON_ASSOCIATE_TAG = 'elicine-21';

/**
 * Adds Amazon attribution without serializing the destination or other parameters.
 * Only HTTP(S) URLs on amazon.fr / primevideo.com and their subdomains qualify.
 */
export function withAmazonAffiliateTag(url) {
  if (typeof url !== 'string') return url;

  let parsed;
  try {
    parsed = new URL(url.startsWith('//') ? `https:${url}` : url);
  } catch {
    return url;
  }

  const host = parsed.hostname;
  const isAmazon = ['amazon.fr', 'primevideo.com'].some(domain =>
    host === domain || host.endsWith(`.${domain}`));
  if (!isAmazon || !['http:', 'https:'].includes(parsed.protocol)) return url;

  const hashAt = url.indexOf('#');
  const fragment = hashAt < 0 ? '' : url.slice(hashAt);
  const beforeFragment = hashAt < 0 ? url : url.slice(0, hashAt);
  const queryAt = beforeFragment.indexOf('?');
  const destination = queryAt < 0 ? beforeFragment : beforeFragment.slice(0, queryAt);
  const query = queryAt < 0 ? '' : beforeFragment.slice(queryAt + 1);
  let hasTag = false;
  const parameters = query ? query.split('&').flatMap(parameter => {
    if (!new URLSearchParams(parameter).has('tag')) return [parameter];
    if (hasTag) return [];
    hasTag = true;
    return [`tag=${AMAZON_ASSOCIATE_TAG}`];
  }).join('&') : '';

  const taggedQuery = hasTag
    ? parameters
    : `${query}${query && !query.endsWith('&') ? '&' : ''}tag=${AMAZON_ASSOCIATE_TAG}`;
  return `${destination}?${taggedQuery}${fragment}`;
}

export const PRIME_VIDEO_TRIAL_URL = withAmazonAffiliateTag('https://www.primevideo.com/');
