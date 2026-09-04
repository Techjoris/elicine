export interface VpnPartnerConfig {
  name: string;
  defaultUrl: string;
  envUrl?: string;
}

export const VPN_PARTNERS: Record<'nordvpn' | 'surfshark', VpnPartnerConfig> = {
  nordvpn: {
    name: 'NordVPN',
    defaultUrl: 'https://nordvpn.com',
    envUrl: (import.meta as any).env?.VITE_NORDVPN_URL,
  },
  surfshark: {
    name: 'Surfshark',
    defaultUrl: 'https://surfshark.com',
    envUrl: (import.meta as any).env?.VITE_SURFSHARK_URL,
  },
};

export function getVpnAffiliateUrl(provider: 'nordvpn' | 'surfshark' = 'nordvpn'): string {
  if (typeof localStorage !== 'undefined') {
    const custom = localStorage.getItem(`elicine_${provider}_url`);
    if (custom && custom.startsWith('http')) {
      return custom;
    }
  }

  const partner = VPN_PARTNERS[provider] || VPN_PARTNERS.nordvpn;
  return partner.envUrl || partner.defaultUrl;
}
