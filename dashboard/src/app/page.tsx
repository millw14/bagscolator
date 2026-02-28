import StatsPanel from "@/components/StatsPanel";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-bags-text">
          Bagscolator
        </h1>
        <p className="mt-2 text-sm text-bags-muted">
          Deflationary launch primitive — fees auto-buy the token and
          permanently lock it. All on-chain, all verifiable.
        </p>
      </header>
      <StatsPanel />
      <footer className="mt-16 border-t border-bags-border pt-6 text-center text-xs text-bags-muted">
        All data read directly from Solana. No backend, no trust assumptions.
      </footer>
    </main>
  );
}
