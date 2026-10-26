/**
 * What the Link Cleaner removes, and the redirect wrappers it unwraps.
 *
 * This is the one place either list lives. Each entry says who adds the
 * parameter, because that sentence is shown to the visitor next to everything
 * removed: "fbclid: Meta (Facebook, Instagram) click ID" is the explanation, not
 * decoration.
 *
 * The rule for adding a parameter: it must identify a click, a campaign, a
 * share or a person, and removing it must never change what the page shows.
 * That is why `ref` is not here (GitHub's ?ref=main picks a branch), nor
 * Amazon's `tag` (an affiliate code, not a tracker of the reader), nor
 * YouTube's `t` (the timestamp to start at). A name that is only tracking on
 * one site, such as `si` or `t`, is scoped to that site's hosts.
 *
 * Names are compared lower-cased. Hosts match the domain itself and every
 * subdomain; a host ending in `.*` matches that name under any country domain
 * (google.com, google.co.uk, google.com.au).
 *
 * Sources: each vendor's own documentation where it exists (Google Analytics
 * campaign URLs, Google Ads auto-tagging, Microsoft Advertising, Meta, Matomo,
 * HubSpot, Mailchimp), cross-checked against the rules maintained by the
 * ClearURLs project and Firefox's query-parameter stripping list.
 */

export interface TrackingRule {
  /** Exact parameter names, lower-case. */
  names?: readonly string[];
  /** A name prefix, lower-case: every parameter starting with it. */
  prefix?: string;
  /** Only on these sites. Omitted means on every site. */
  hosts?: readonly string[];
  /** Who adds it and what it records. Shown to the visitor. */
  source: string;
}

export const TRACKING_RULES: readonly TrackingRule[] = [
  // --- Campaign tags, on any site ----------------------------------------
  // Google Analytics campaign URLs: utm_source, utm_medium, utm_campaign,
  // utm_term, utm_content, utm_id and the GA4 additions (utm_source_platform,
  // utm_creative_format, utm_marketing_tactic). Read by most analytics tools.
  { prefix: 'utm_', source: 'Campaign tag (Google Analytics UTM)' },
  // Matomo's own campaign parameters (mtm_campaign, mtm_kwd, mtm_source...).
  { prefix: 'mtm_', source: 'Campaign tag (Matomo)' },
  // Matomo's older Piwik-era names. Listed exactly: a bare pk= is often a
  // database key.
  {
    names: ['pk_campaign', 'pk_kwd', 'pk_keyword', 'pk_source', 'pk_medium', 'pk_content', 'pk_cid'],
    source: 'Campaign tag (Matomo / Piwik)',
  },

  // --- Ad click IDs, on any site -----------------------------------------
  // Google Ads auto-tagging: gclid, its source marker, and the privacy-era
  // iOS variants gbraid and wbraid; gad_source and gad_campaignid since 2023.
  { names: ['gclid', 'gclsrc', 'gbraid', 'wbraid', 'gad_source', 'gad_campaignid'], source: 'Google Ads click ID' },
  // Campaign Manager / Display & Video 360 (formerly DoubleClick).
  { names: ['dclid'], source: 'Google display ad click ID' },
  // Google Merchant Center adds srsltid to product links in search results.
  { names: ['srsltid'], source: 'Google Shopping result ID' },
  // Google Analytics cross-domain linker (_gl), and the older _ga form.
  { names: ['_gl', '_ga'], source: 'Google Analytics cross-site visitor ID' },
  // Microsoft Advertising (Bing ads) auto-tagging.
  { names: ['msclkid'], source: 'Microsoft Advertising click ID' },
  // Meta adds fbclid to every outbound link from Facebook and Instagram.
  { names: ['fbclid'], source: 'Meta (Facebook, Instagram) click ID' },
  // Instagram's share sheet.
  { names: ['igshid', 'igsh'], source: 'Instagram share ID' },
  // X (Twitter) ads, and the ref_src / ref_url pair on embedded posts.
  { names: ['twclid'], source: 'X (Twitter) ad click ID' },
  { names: ['ref_src', 'ref_url'], source: 'X (Twitter) referral tag' },
  // TikTok ads.
  { names: ['ttclid'], source: 'TikTok ad click ID' },
  // LinkedIn first-party ad tracking.
  { names: ['li_fat_id'], source: 'LinkedIn ad click ID' },
  // Pinterest's enhanced-match click parameter.
  { names: ['epik'], source: 'Pinterest click ID' },
  // Snapchat ads (written ScCid).
  { names: ['sccid'], source: 'Snapchat ad click ID' },
  // Reddit ads.
  { names: ['rdt_cid'], source: 'Reddit ad click ID' },
  // Yandex Direct ads, Yandex search, and Yandex's Openstat counter.
  { names: ['yclid', 'ysclid', '_openstat'], source: 'Yandex click ID' },
  // Adobe Advertising and Adobe Analytics campaign IDs.
  { names: ['s_kwcid', 'ef_id', 's_cid'], source: 'Adobe ad click ID' },
  // Impact affiliate network click IDs.
  { names: ['irclickid', 'irgwc'], source: 'Impact affiliate click ID' },
  // Wicked Reports attribution.
  { names: ['wickedid'], source: 'Wicked Reports click ID' },
  // Branch.io deep-link attribution.
  { names: ['_branch_match_id', '_branch_referrer'], source: 'Branch deep-link ID' },

  // --- Email marketing, on any site --------------------------------------
  // Mailchimp: campaign ID and the subscriber's own ID.
  { names: ['mc_cid', 'mc_eid'], source: 'Mailchimp campaign and subscriber ID' },
  // HubSpot email and analytics (_hsenc, _hsmi, __hstc, __hssc, __hsfp,
  // hsCtaTracking) and HubSpot ads (hsa_acc, hsa_cam, hsa_grp...).
  {
    names: ['_hsenc', '_hsmi', '__hstc', '__hssc', '__hsfp', 'hsctatracking'],
    source: 'HubSpot email and visitor ID',
  },
  { prefix: 'hsa_', source: 'HubSpot ad tag' },
  // Marketo email link token.
  { names: ['mkt_tok'], source: 'Marketo email subscriber token' },
  // Klaviyo email subscriber ID.
  { names: ['_kx'], source: 'Klaviyo email subscriber ID' },
  // Kit (formerly ConvertKit) subscriber ID.
  { names: ['ck_subscriber_id'], source: 'Kit (ConvertKit) subscriber ID' },
  // Vero and Omeda email tracking.
  { names: ['vero_id', 'vero_conv'], source: 'Vero email subscriber ID' },
  { names: ['oly_anon_id', 'oly_enc_id'], source: 'Omeda subscriber ID' },

  // --- Site-specific: tracking only on these hosts ------------------------
  // YouTube share links carry si (who shared it), and search results pp. The
  // feature= marker records which button made the link. v, t and list stay.
  {
    names: ['si', 'pp', 'feature'],
    hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
    source: 'YouTube share and search tracking',
  },
  // Spotify share links: si identifies the person who shared.
  { names: ['si'], hosts: ['spotify.com', 'spotify.link'], source: 'Spotify share ID' },
  // x.com share links: s marks the share source, t is a per-share token.
  { names: ['s', 't'], hosts: ['x.com', 'twitter.com'], source: 'X (Twitter) share tracking' },
  // TikTok share links.
  {
    names: ['_t', '_r', 'is_from_webapp', 'sender_device', 'is_copy_url', 'share_app_id'],
    hosts: ['tiktok.com'],
    source: 'TikTok share tracking',
  },
  // LinkedIn link tracking (trk, trkInfo, lipi, trackingId, refId, midToken, midSig).
  {
    names: ['trk', 'trkinfo', 'lipi', 'trackingid', 'refid', 'midtoken', 'midsig'],
    hosts: ['linkedin.com'],
    source: 'LinkedIn link tracking',
  },
  // Facebook's own share and notification markers.
  { names: ['mibextid', '__tn__', 'sfnsn', 'rdid'], hosts: ['facebook.com'], source: 'Facebook share tracking' },
  { prefix: '__cft__', hosts: ['facebook.com'], source: 'Facebook share tracking' },
  // Reddit share links.
  { names: ['share_id'], hosts: ['reddit.com'], source: 'Reddit share ID' },
  // Google Search keeps q (the search itself) and drops the session and
  // click markers it adds around it, including oq, the query as first typed.
  {
    names: ['ei', 'ved', 'uact', 'sca_esv', 'sca_upv', 'oq', 'gs_lp', 'gs_lcrp', 'sclient', 'sxsrf', 'aqs', 'sourceid', 'iflsig', 'rlz', 'biw', 'bih', 'dpr'],
    hosts: ['google.*'],
    source: 'Google Search session tracking',
  },
  // Bing keeps q and drops the form and conversation markers.
  { names: ['form', 'cvid', 'pq', 'sk', 'sc', 'qs', 'sp', 'ghc'], hosts: ['bing.com'], source: 'Bing search tracking' },
  // Amazon product links: the page-placement and search-rank markers. The
  // product (in the path), th and psc (the chosen variant) and tag stay.
  {
    names: ['_encoding', 'ref_', 'crid', 'sprefix', 'qid', 'sr', 'dib', 'dib_tag', 'content-id', 'linkcode', 'linkid'],
    hosts: ['amazon.*'],
    source: 'Amazon placement and search tracking',
  },
  { prefix: 'pd_rd_', hosts: ['amazon.*'], source: 'Amazon placement tracking' },
  { prefix: 'pf_rd_', hosts: ['amazon.*'], source: 'Amazon placement tracking' },
  // eBay's tracking blobs.
  { names: ['_trkparms', '_trksid', 'amdata'], hosts: ['ebay.*'], source: 'eBay tracking' },
  // Alibaba group (AliExpress, Taobao) page-position and recommendation IDs.
  {
    names: ['spm', 'scm', 'pvid', 'algo_pvid', 'algo_exp_id'],
    hosts: ['aliexpress.com', 'aliexpress.us', 'alibaba.com', 'taobao.com', 'tmall.com'],
    source: 'Alibaba page-position tracking',
  },
];

/**
 * A redirect wrapper: a link that only exists to send you on to another one,
 * logging the click on the way. The real destination is sitting in one of its
 * query parameters, so it can be read straight out, with no request at all.
 */
export interface RedirectWrapper {
  /** Shown as "Unwrapped from a <name> redirect". */
  name: string;
  hosts: readonly string[];
  /** The path the wrapper uses, exactly. Omitted means any path. */
  path?: string;
  /** Parameters that may hold the destination, tried in order. */
  params: readonly string[];
}

export const REDIRECT_WRAPPERS: readonly RedirectWrapper[] = [
  // Google Search and Gmail result links: google.com/url?q=... (or ?url=).
  { name: 'Google', hosts: ['google.*'], path: '/url', params: ['q', 'url'] },
  // Facebook, Messenger and Instagram outbound link shims.
  { name: 'Facebook', hosts: ['l.facebook.com', 'lm.facebook.com'], path: '/l.php', params: ['u'] },
  { name: 'Messenger', hosts: ['l.messenger.com'], path: '/l.php', params: ['u'] },
  { name: 'Instagram', hosts: ['l.instagram.com'], params: ['u'] },
  // Microsoft Defender Safe Links in Outlook and Teams:
  // eur01.safelinks.protection.outlook.com/?url=...&data=...
  { name: 'Outlook Safe Links', hosts: ['safelinks.protection.outlook.com'], params: ['url'] },
  // YouTube video descriptions.
  { name: 'YouTube', hosts: ['youtube.com'], path: '/redirect', params: ['q'] },
  // LinkedIn's outbound and safety-check pages.
  { name: 'LinkedIn', hosts: ['linkedin.com'], path: '/redir/redirect', params: ['url'] },
  { name: 'LinkedIn', hosts: ['linkedin.com'], path: '/safety/go', params: ['url'] },
  // Slack's outbound redirector.
  { name: 'Slack', hosts: ['slack-redir.net'], path: '/link', params: ['url'] },
  // Reddit's old outbound redirector.
  { name: 'Reddit', hosts: ['out.reddit.com'], params: ['url'] },
  // DuckDuckGo result links: duckduckgo.com/l/?uddg=...
  { name: 'DuckDuckGo', hosts: ['duckduckgo.com'], path: '/l/', params: ['uddg'] },
  // Steam's link filter page.
  { name: 'Steam', hosts: ['steamcommunity.com'], path: '/linkfilter/', params: ['url', 'u'] },
];
