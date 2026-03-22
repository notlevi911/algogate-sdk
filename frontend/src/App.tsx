import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import ShinyText from "@/components/ShinyText"
import SpotlightCard from "@/components/SpotlightCard"
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Chrome,
  Coins,
  Github,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  WalletCards,
  Workflow,
  type LucideIcon,
} from "lucide-react"
import { lazy, Suspense } from "react"

const Silk = lazy(() => import("@/components/Silk"))

type Feature = {
  icon: LucideIcon
  title: string
  description: string
}

type GuideStep = {
  step: string
  title: string
  description: string
  note: string
}

type CodePanelProps = {
  label: string
  title: string
  code: string
  className?: string
}

type IconLinkProps = {
  href: string
  icon: LucideIcon
  label: string
  className?: string
}

const heroBullets = [
  "402 -> pay -> verify -> retry",
  "FastAPI middleware and helper routes",
  "Scaffolded Chrome extension",
  "Algorand testnet and mainnet support",
]

const helperRoutes = [
  "GET /algogate/dashboard",
  "WS /algogate/events",
  "GET /algogate/routes",
  "GET /algogate/health",
  "POST /algogate/verify",
]

const features: Feature[] = [
  {
    icon: ShieldCheck,
    title: "Protect premium endpoints",
    description:
      "Decorate a route and let AlgoGate block unpaid requests before the handler runs.",
  },
  {
    icon: Coins,
    title: "Return a payment challenge",
    description:
      "Clients receive a 402 challenge flow instead of a dead end when a premium route needs payment.",
  },
  {
    icon: WalletCards,
    title: "Ship the wallet experience",
    description:
      "The extension scaffold handles wallet onboarding, payment approval, storage, and route retry.",
  },
  {
    icon: Workflow,
    title: "Verify and unlock access",
    description:
      "After payment lands, the SDK verifies the transaction and turns the retry into the premium API response.",
  },
]

const guideSteps: GuideStep[] = [
  {
    step: "01",
    title: "Install the package",
    description:
      "Use the standard package install, the TestPyPI package page, or a local editable install while developing.",
    note: "Start with the package command below, then move into your FastAPI app.",
  },
  {
    step: "02",
    title: "Create a gate",
    description:
      "Configure the receiver address, price in microALGO, network, and API name that the extension will show to users.",
    note: "You can also provide an optional api_key if your client requests need it.",
  },
  {
    step: "03",
    title: "Initialize the app",
    description:
      "Run gate.init_app(app) to attach middleware, helper routes, and the browser-extension scaffold beside your app.",
    note: "The extension folder is generated once and reused on later runs.",
  },
  {
    step: "04",
    title: "Expose a premium route",
    description:
      "Mark a route with @gate.protect so the normal API flow becomes challenge, payment, verification, and retry.",
    note: "If one route should cost more, switch to protect_with_price for that endpoint.",
  },
  {
    step: "05",
    title: "Load the extension",
    description:
      "Open chrome://extensions, enable developer mode, and load the generated algogate_extension folder.",
    note: "That gives you the popup UI, wallet setup, and payment approval flow.",
  },
  {
    step: "06",
    title: "Call the API normally",
    description:
      "Users hit the route, approve payment if required, and the original request is retried with the paid result.",
    note: "The process feels like a normal API call, just with payment in the middle.",
  },
]

const paymentFlow = [
  "A client calls a premium FastAPI route.",
  "The SDK returns 402 Payment Required with X-Payment-Required.",
  "The extension pays on Algorand and verifies the transaction.",
  "The route is retried with X-Payment-Signature and returns premium data.",
]

const installCode = `pip install algogate-sdk

# TestPyPI release page
pip install -i https://test.pypi.org/simple/ algogate-sdk

# local editable development
python3 -m pip install -e .`

const quickStartCode = `from fastapi import FastAPI
from algogate import AlgoGate

gate = AlgoGate(
    receiver="YOUR_ALGORAND_ADDRESS",
    price_microalgo=500_000,
    network="testnet",
    api_name="My Premium API",
    api_key="optional-internal-api-key",
)

app = FastAPI()
gate.init_app(app)

@app.get("/api/free")
async def free_route():
    return {"message": "free response"}

@app.get("/api/premium")
@gate.protect
async def premium_route():
    return {"premium": True, "data": "paid content"}`

const extensionCode = `chrome://extensions

1. Turn on Developer mode
2. Click "Load unpacked"
3. Select ./algogate_extension
4. Open the popup
5. Create or import a wallet`

const overrideCode = `@app.get("/api/weather/detailed")
@gate.protect_with_price(1_000_000)
async def detailed_weather():
    return {
        "hourly": ["..."],
        "radar": "...",
    }`

const resourceLinks: IconLinkProps[] = [
  {
    href: "https://test.pypi.org/project/algogate-sdk/0.1.0/#description",
    icon: BookOpen,
    label: "Documentation",
    className:
      "border-[#f25f6c]/35 text-[#ff9aa4] hover:bg-[#f25f6c]/16 hover:text-white",
  },
  {
    href: "https://github.com/notlevi911/algogate-sdk",
    icon: Github,
    label: "GitHub",
    className:
      "border-[#137636]/35 text-[#9ce3b3] hover:bg-[#137636]/16 hover:text-white",
  },
]

function IconLink({ href, icon: Icon, label, className }: IconLinkProps) {
  return (
    <a
      aria-label={label}
      className={cn(
        "flex size-11 items-center justify-center rounded-full border bg-white/8 text-white/72 transition",
        className,
      )}
      href={href}
      rel="noreferrer"
      target="_blank"
      title={label}
    >
      <Icon className="size-4.5" />
    </a>
  )
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#8bd7a4]">
        {eyebrow}
      </p>
      <h2 className="mt-4 font-heading text-4xl leading-tight text-white sm:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-lg leading-8 text-white/72">{description}</p>
    </div>
  )
}

function CodePanel({ label, title, code, className }: CodePanelProps) {
  return (
    <SpotlightCard
      spotlightColor="rgba(242, 95, 108, 0.12)"
      className={cn(
        "overflow-hidden rounded-[2rem] border-white/12 bg-[#0e160f]/92 text-white",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/45">
            {label}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[#ff8f9c]" />
          <span className="size-2.5 rounded-full bg-[#ffc7cf]" />
          <span className="size-2.5 rounded-full bg-[#86efac]" />
        </div>
      </div>
      <pre className="overflow-x-auto px-5 py-5 text-sm leading-7 text-white/86">
        <code>{code}</code>
      </pre>
    </SpotlightCard>
  )
}

function App() {
  return (
    <main id="top" className="relative min-h-screen overflow-x-hidden text-white">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0">
          <Suspense
            fallback={
              <div className="h-full w-full bg-[#137636]" />
            }
          >
            <Silk
              speed={5}
              scale={1}
              color="#137636"
              noiseIntensity={1.4}
              rotation={0}
            />
          </Suspense>
        </div>
      </div>

      <div className="relative z-10">
        <header className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-white/75 backdrop-blur-md">
              AlgoGate SDK
            </div>
            <span className="hidden text-sm text-white/55 sm:inline">
              FastAPI paywalls for Algorand micropayments
            </span>
          </div>

          <div className="flex items-center gap-4">
            <nav className="flex flex-wrap items-center gap-3 text-sm text-white/70">
              <a className="transition hover:text-white" href="#modules">
                Modules
              </a>
              <a className="transition hover:text-white" href="#build">
                Build
              </a>
              <a className="transition hover:text-white" href="#flow">
                Flow
              </a>
            </nav>
            <div className="flex items-center gap-2">
              {resourceLinks.map((link) => (
                <IconLink key={link.label} {...link} />
              ))}
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-7xl px-6 pb-24 pt-14 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="max-w-3xl">
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-white/72 backdrop-blur-md">
                <Sparkles className="size-4 text-[#ff9aa4]" />
                <ShinyText
                  className="font-medium tracking-[0.02em]"
                  color="#a7f3d0"
                  delay={0}
                  direction="left"
                  shineColor="#ffffff"
                  speed={2}
                  spread={120}
                  text="402 -> pay -> verify -> retry"
                />
              </div>

              <h1 className="mt-7 font-heading text-5xl leading-[0.95] text-white sm:text-6xl lg:text-7xl">
                Build paid API access without building the payment client from
                scratch.
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/76 sm:text-xl">
                AlgoGate gives FastAPI apps a clean payment path on Algorand:
                premium routes challenge when needed, the client pays through a
                scaffolded extension, and the original request comes back with
                the premium result.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-11 rounded-full px-5 text-sm font-semibold shadow-[0_20px_60px_rgba(19,118,54,0.28)]",
                  )}
                  href="#build"
                >
                  Scroll to build
                  <ArrowDown className="size-4" />
                </a>
                <a
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-11 rounded-full border-white/15 bg-white/8 px-5 text-sm text-white hover:bg-white/14 hover:text-white",
                  )}
                  href="#modules"
                >
                  Explore modules
                  <ArrowRight className="size-4" />
                </a>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                {heroBullets.map((bullet) => (
                  <SpotlightCard
                    key={bullet}
                    className="rounded-[1.5rem] border-white/10 bg-white/8 px-4 py-4 text-sm text-white/80"
                    spotlightColor="rgba(156, 227, 179, 0.12)"
                  >
                    {bullet}
                  </SpotlightCard>
                ))}
              </div>
            </div>

            <div className="grid gap-5">
              <SpotlightCard
                className="rounded-[2rem] border-white/12 bg-white/10 p-6"
                spotlightColor="rgba(242, 95, 108, 0.14)"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/45">
                      Modular surface
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">
                      One SDK, several pieces working together.
                    </h2>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/8 p-3">
                    <TerminalSquare className="size-6 text-[#ff9aa4]" />
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {features.slice(0, 3).map((feature) => (
                    <SpotlightCard
                      key={feature.title}
                      className="rounded-[1.35rem] border-white/10 bg-black/18 px-4 py-4"
                      spotlightColor="rgba(156, 227, 179, 0.1)"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-2xl bg-[#137636]/18 text-[#9ce3b3]">
                          <feature.icon className="size-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {feature.title}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-white/66">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                    </SpotlightCard>
                  ))}
                </div>
              </SpotlightCard>

              <SpotlightCard
                className="rounded-[2rem] border-white/12 bg-black/20 p-6"
                spotlightColor="rgba(242, 95, 108, 0.12)"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/45">
                  Where the practical setup lives
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Installation and API setup sit below the fold.
                </h2>
                <p className="mt-4 text-[15px] leading-7 text-white/72">
                  The homepage stays product-first. Scroll down for the install
                  commands, the FastAPI example, extension loading, and the
                  normal path for shipping a premium endpoint.
                </p>
              </SpotlightCard>
            </div>
          </div>
        </section>

        <section
          id="modules"
          className="mx-auto max-w-7xl px-6 py-20 lg:px-10"
        >
          <div className="rounded-[2.5rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
            <SectionHeading
              eyebrow="Modules"
              title="A modular website for a modular SDK."
              description="Each part of the product has a clear place: protected routes, payment challenges, the extension surface, helper routes, and the retry flow that unlocks premium responses."
            />

            <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {features.map((feature) => (
                <SpotlightCard
                  key={feature.title}
                  className="rounded-[2rem] border-white/10 bg-white/86 p-6 text-[#182119]"
                  spotlightColor="rgba(242, 95, 108, 0.14)"
                >
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-[#e7f8ea] text-[#137636]">
                    <feature.icon className="size-5" />
                  </div>
                  <h3 className="mt-6 text-xl font-semibold">{feature.title}</h3>
                  <p className="mt-4 text-[15px] leading-7 text-[#49604d]">
                    {feature.description}
                  </p>
                </SpotlightCard>
              ))}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <SpotlightCard
                className="rounded-[2.25rem] border-white/10 bg-white/86 p-6 text-[#182119]"
                spotlightColor="rgba(156, 227, 179, 0.18)"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#137636]">
                      Client and route modules
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold">
                      The browser side and server side stay clearly separated.
                    </h3>
                  </div>
                  <div className="rounded-2xl bg-[#e7f8ea] p-3 text-[#137636]">
                    <WalletCards className="size-6" />
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-[#d7e5d0] bg-[#f8fdf8] p-4">
                    <p className="text-sm font-semibold">Extension module</p>
                    <p className="mt-2 text-sm leading-6 text-[#49604d]">
                      Wallet onboarding, payment approval, storage, and route
                      retry all live in the generated client.
                    </p>
                  </div>
                  <div className="rounded-[1.5rem] border border-[#d7e5d0] bg-[#f8fdf8] p-4">
                    <p className="text-sm font-semibold">Server module</p>
                    <p className="mt-2 text-sm leading-6 text-[#49604d]">
                      Protected routes, challenge headers, verification, and
                      response unlocks stay inside the FastAPI app.
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  {helperRoutes.map((route) => (
                    <span
                      key={route}
                      className="rounded-full border border-[#d7e5d0] bg-[#f8fdf8] px-3 py-2 text-sm text-[#35543b]"
                    >
                      {route}
                    </span>
                  ))}
                </div>
              </SpotlightCard>

              <SpotlightCard
                id="flow"
                className="rounded-[2.25rem] border-white/10 bg-white/86 p-6 text-[#182119]"
                spotlightColor="rgba(242, 95, 108, 0.16)"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#137636]">
                      Normal request flow
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold">
                      The payment process still feels like a normal API call.
                    </h3>
                  </div>
                  <div className="rounded-2xl bg-[#e7f8ea] p-3 text-[#137636]">
                    <Chrome className="size-6" />
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {paymentFlow.map((item, index) => (
                    <SpotlightCard
                      key={item}
                      className="flex gap-4 rounded-[1.35rem] border border-[#d7e5d0] bg-[#f8fdf8] px-4 py-4"
                      spotlightColor="rgba(242, 95, 108, 0.12)"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#137636] text-sm font-semibold text-white">
                        {index + 1}
                      </div>
                      <p className="text-sm leading-7 text-[#49604d]">{item}</p>
                    </SpotlightCard>
                  ))}
                </div>
              </SpotlightCard>
            </div>
          </div>
        </section>

        <section id="build" className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
          <div className="rounded-[2.5rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeading
                eyebrow="Build"
                title="Install the package and wire a paid FastAPI endpoint as you scroll."
                description="Everything practical lives here: installation, gate setup, route protection, extension loading, and the normal path for exposing a premium API."
              />
              <div className="flex items-center gap-2">
                {resourceLinks.map((link) => (
                  <IconLink key={`${link.label}-build`} {...link} />
                ))}
              </div>
            </div>

            <div className="mt-12 grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4">
                {guideSteps.map((item) => (
                  <SpotlightCard
                    key={item.step}
                    className="rounded-[1.75rem] border-white/10 bg-white/86 p-5 text-[#182119]"
                    spotlightColor="rgba(242, 95, 108, 0.16)"
                  >
                    <div className="flex gap-4">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#f25f6c] text-sm font-semibold text-white">
                        {item.step}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">{item.title}</h3>
                        <p className="mt-2 text-[15px] leading-7 text-[#49604d]">
                          {item.description}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-[#137636]">
                          {item.note}
                        </p>
                      </div>
                    </div>
                  </SpotlightCard>
                ))}
              </div>

              <div className="space-y-6">
                <CodePanel
                  label="Install"
                  title="Package install options"
                  code={installCode}
                />
                <CodePanel
                  label="FastAPI"
                  title="Minimal API setup"
                  code={quickStartCode}
                />
                <div className="grid gap-6 xl:grid-cols-2">
                  <CodePanel
                    label="Extension"
                    title="Load the client"
                    code={extensionCode}
                  />
                  <CodePanel
                    label="Optional"
                    title="Per-route pricing"
                    code={overrideCode}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
