window.ALGO_PROTOCOLS = {
  "app.tinyman.org": {
    name: "Tinyman",
    category: "DEX",
    riskScore: 42,
    trustLevel: "Moderate",
    summary:
      "Tinyman is a known Algorand DEX. The main user risks are pool token quality, slippage, and liquidity fragmentation.",
    checks: [
      "Recognized Tinyman host",
      "Known Algorand DEX interface",
      "Pool token legitimacy still needs user verification",
      "Thin pools can increase slippage"
    ],
    premiumFocus: [
      "Pool token concentration",
      "Liquidity depth concerns",
      "Protocol and governance context",
      "Plain-English trading risk"
    ]
  },
  "app.folks.finance": {
    name: "Folks Finance",
    category: "Lending",
    riskScore: 38,
    trustLevel: "Moderate",
    summary:
      "Folks Finance is a lending and DeFi protocol on Algorand. Main risks include liquidation, rate shifts, and collateral quality.",
    checks: [
      "Recognized Folks Finance host",
      "Likely lending/borrowing flow",
      "Liquidation risk depends on collateral health",
      "Yield assumptions may change quickly"
    ],
    premiumFocus: [
      "Collateral stress scenarios",
      "Treasury and governance overview",
      "Borrow rate and liquidation explanation",
      "Protocol dependency review"
    ]
  },
  "vestige.fi": {
    name: "Vestige",
    category: "Market data",
    riskScore: 28,
    trustLevel: "General",
    summary:
      "Vestige is generally a token analytics and market-tracking surface. Risks depend more on the asset under review than the page itself.",
    checks: [
      "Recognized Vestige host",
      "Analytics-style interface detected",
      "Token legitimacy still varies by asset",
      "Market data is informational, not safety assurance"
    ],
    premiumFocus: [
      "Token holder concentration",
      "Whale and float concerns",
      "Narrative vs fundamentals",
      "Governance and treasury context where available"
    ]
  }
};
