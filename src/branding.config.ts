/**
 * Mesnium Central Product Branding & Identity Configuration
 * 
 * Provides centralized branding metadata, product naming, and asset paths
 * across the Mesnium application and UI layers.
 */

export interface MesniumProductBranding {
  readonly productName: string;
  readonly productShortName: string;
  readonly productTagline: string;
  readonly productDescription: string;
  readonly version: string;
  readonly assets: {
    readonly logo: string;
    readonly icon: string;
    readonly favicon: string;
    readonly appleTouchIcon: string;
  };
  readonly links: {
    readonly website: string;
    readonly docs: string;
    readonly support: string;
    readonly github: string;
  };
  readonly engine: {
    readonly name: string;
    readonly version: string;
  };
}

export const MESNIUM_BRANDING: MesniumProductBranding = {
  productName: "Mesnium",
  productShortName: "Mesnium",
  productTagline: "Autonomous Local-First Operating System",
  productDescription: "Intelligent multimodal desktop agent, document intelligence, and omnichannel workspace.",
  version: "1.0.0-alpha",
  assets: {
    logo: "/brand/logo.png",
    icon: "/brand/icon.png",
    favicon: "/favicon.svg",
    appleTouchIcon: "/apple-touch-icon.png"
  },
  links: {
    website: "https://mesnium.ai",
    docs: "https://docs.mesnium.ai",
    support: "https://support.mesnium.ai",
    github: "https://github.com/m33tshah/claw"
  },
  engine: {
    name: "OpenClaw Engine",
    version: "2026.7.1"
  }
};

export default MESNIUM_BRANDING;
