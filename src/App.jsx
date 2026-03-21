import { useState } from "react";

const features = [
  {
    title: "Live protocol detection",
    body: "The extension recognizes supported Algorand DeFi pages and opens a trust panel right where the user needs it."
  },
  {
    title: "Free safety checks",
    body: "Users get hardcoded reputation, domain, and protocol-type checks instantly before they connect funds."
  },
  {
    title: "Premium OpenAI analysis",
    body: "A deeper paid-style scan explains governance risk, treasury health, whale concentration, and failure modes."
  },
  {
    title: "Wallet-first UX",
    body: "The extension includes an x402-style wallet section so premium actions can later map to a real payment flow."
  }
];

const steps = [
  "Open chrome://extensions in Chrome",
  "Turn on Developer mode",
  "Click Load unpacked",
  "Select the local extension folder: extension/"
];

export default function App() {
  const [showSteps, setShowSteps] = useState(false);

  return (
    <div className="page">
      <div className="bg-orb bg-orb-left" />
      <div className="bg-orb bg-orb-right" />

      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Algorand DeFi extension</p>
          <h1>Know the risk before you click swap, lend, or stake.</h1>
          <p className="hero-text">
            Algo DeFi Safety Layer adds a trust and risk panel to supported
            Algorand DeFi pages, mixing free protocol checks with deeper
            OpenAI-powered premium analysis.
          </p>

          <div className="hero-actions">
            <button className="chrome-button" onClick={() => setShowSteps(true)}>
              Add to Chrome
            </button>
            <a className="secondary-button" href="#features">
              See features
            </a>
          </div>

          <p className="hero-note">
            The extension is currently loaded locally as an unpacked Chrome
            extension.
          </p>
        </div>

        <div className="hero-card">
          <div className="browser-mock">
            <div className="mock-topbar">
              <div className="mock-dots">
                <span />
                <span />
                <span />
              </div>
              <div className="mock-address">app.tinyman.org</div>
            </div>

            <div className="mock-body">
              <div className="mock-content">
                <div className="mock-tag">Detected protocol</div>
                <h2>Tinyman</h2>
                <p>
                  Free checks warn about liquidity risk, token legitimacy, and
                  protocol category before premium analysis is unlocked.
                </p>
              </div>

              <aside className="mock-panel">
                <p className="panel-kicker">Risk panel</p>
                <h3>Moderate risk</h3>
                <ul>
                  <li>Known Algorand DEX domain</li>
                  <li>Pool token legitimacy matters</li>
                  <li>Thin liquidity can increase slippage</li>
                </ul>
                <button className="panel-button">Run deep analysis</button>
              </aside>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section id="features" className="section">
          <div className="section-heading">
            <p className="eyebrow">What it does</p>
            <h2>Built for real DeFi browsing, not dashboard tourism.</h2>
          </div>

          <div className="feature-grid">
            {features.map((feature) => (
              <article key={feature.title} className="feature-card">
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section split-section">
          <div className="split-card">
            <p className="eyebrow">Extension flow</p>
            <h2>From page detection to premium analysis</h2>
            <ol className="flow-list">
              <li>User visits Tinyman, Folks Finance, or Vestige.</li>
              <li>The extension injects a right-side safety panel.</li>
              <li>Free checks appear immediately.</li>
              <li>OpenAI analysis can be triggered for deeper explanation.</li>
              <li>Wallet connection is ready for future x402-style premium UX.</li>
            </ol>
          </div>

          <div className="split-card emphasis">
            <p className="eyebrow">Why it matters</p>
            <h2>Risk context where the money moves.</h2>
            <p>
              Instead of making users leave the protocol and open a separate
              dashboard, the extension brings the safety layer directly into the
              browser flow where the decision actually happens.
            </p>
          </div>
        </section>
      </main>

      {showSteps ? (
        <div className="modal-backdrop" onClick={() => setShowSteps(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Add to Chrome</h2>
              <button
                className="modal-close"
                onClick={() => setShowSteps(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p className="modal-text">
              This extension is not on the Chrome Web Store yet. Load it locally
              from the repo for now:
            </p>

            <ol className="modal-steps">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>

            <div className="path-box">extension/</div>

            <div className="modal-actions">
              <button className="chrome-button" onClick={() => setShowSteps(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
