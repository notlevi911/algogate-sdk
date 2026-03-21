declare const chrome: any;

interface Window {
  ALGO_PROTOCOLS?: Record<string, AlgoProtocolProfile>;
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
