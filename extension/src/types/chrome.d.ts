declare const chrome: any;

interface Window {
  ALGO_PROTOCOLS?: Record<string, AlgoProtocolProfile>;
  detectPageType?: (url: string, title: string) => PageActionDetection;
}

interface AlgoProtocolProfile {
  name: string;
  category: string;
  riskScore: number;
  trustLevel: string;
  summary: string;
  checks: string[];
  premiumFocus: string[];
}

interface PageActionDetection {
  type: string;
  action: string;
  label: string;
  price: number;
  tier: "free" | "paid" | "none" | "backend";
}
