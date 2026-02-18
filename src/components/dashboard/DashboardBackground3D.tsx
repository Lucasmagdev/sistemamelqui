export default function DashboardBackground3D() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden [perspective:1200px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.08),transparent_36%),radial-gradient(circle_at_80%_10%,hsl(var(--accent)/0.05),transparent_28%),radial-gradient(circle_at_50%_80%,hsl(var(--secondary)/0.08),transparent_40%)]" />
      <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-primary/20 blur-3xl motion-orb" />
      <div className="absolute right-10 top-8 h-64 w-64 rounded-full bg-secondary/20 blur-3xl motion-orb-reverse" />
      <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-accent/10 blur-3xl motion-orb" />
      <div className="absolute right-1/4 top-1/2 h-40 w-40 rounded-full border border-primary/25 bg-card/30 [transform:translateZ(28px)] motion-orb-reverse" />
      <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--border)/0.2)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.15)_1px,transparent_1px)] bg-[size:90px_90px] opacity-20" />
    </div>
  );
}
