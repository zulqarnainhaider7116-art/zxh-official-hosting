export default function Background({ intense = false }: { intense?: boolean }) {
  return (
    <div className="noise pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-bg" />
      <div className="animate-drift absolute -left-[15%] -top-[25%] h-[70vh] w-[70vh] rounded-full opacity-60 blur-[110px]" style={{ background: 'radial-gradient(circle, color-mix(in oklab, var(--ember) 55%, transparent), transparent 70%)' }} />
      <div className="animate-drift-slow absolute -right-[10%] top-[10%] h-[60vh] w-[60vh] rounded-full opacity-40 blur-[120px]" style={{ background: 'radial-gradient(circle, color-mix(in oklab, var(--amber) 50%, transparent), transparent 70%)' }} />
      {intense && <div className="animate-drift absolute bottom-[-30%] left-[30%] h-[60vh] w-[60vh] rounded-full opacity-30 blur-[120px]" style={{ background: 'radial-gradient(circle, #ff2e63, transparent 70%)' }} />}
      <div className="grid-lines absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
    </div>
  );
}
