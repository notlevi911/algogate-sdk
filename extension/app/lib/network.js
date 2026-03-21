export function getPeraChainId(network) {
  switch (network) {
    case "mainnet":
      return 416001;
    case "betanet":
      return 416003;
    case "testnet":
      return 416002;
    default:
      return 416002;
  }
}
