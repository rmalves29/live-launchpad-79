import { useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  PolarAngleAxis, RadialBar, RadialBarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Radar, BarChart3 } from 'lucide-react';

export interface TimelinePoint {
  bucket: string;      // ISO bucket start
  label: string;       // display label (e.g. "12/07" or "14h")
  clicks: number;
  entries: number;
  exits: number;
}

interface GroupSlice {
  name: string;
  entries: number;
  exits: number;
  net: number;
}

interface Props {
  timeline: TimelinePoint[];
  topGroups: GroupSlice[];
  conversion: number;         // 0-100
  entries: number;
  exits: number;
  clicks: number;
}

const CHART_COLORS = {
  clicks: 'hsl(var(--primary))',
  entries: 'hsl(158 84% 52%)',
  exits: 'hsl(var(--destructive))',
  grid: 'hsl(var(--border) / 0.4)',
  axis: 'hsl(var(--muted-foreground))',
};

function FuturisticTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-primary/30 bg-background/95 px-3 py-2 shadow-[0_0_20px_hsl(var(--primary)/0.35)] backdrop-blur">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color, boxShadow: `0 0 8px ${p.color}` }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold tabular-nums text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportsCharts({
  timeline, topGroups, conversion, entries, exits, clicks,
}: Props) {

  const conversionData = useMemo(() => [{
    name: 'Conversão',
    value: Math.min(100, Math.max(0, conversion)),
    fill: 'url(#gradConversion)',
  }], [conversion]);

  const compositionData = useMemo(() => {
    const items = [
      { name: 'Clicks', value: clicks, color: CHART_COLORS.clicks },
      { name: 'Entradas', value: entries, color: CHART_COLORS.entries },
      { name: 'Saídas', value: exits, color: CHART_COLORS.exits },
    ];
    return items;
  }, [clicks, entries, exits]);

  const topGroupsData = useMemo(() => topGroups.slice(0, 8).map((g) => ({
    name: g.name.length > 22 ? `${g.name.slice(0, 22)}…` : g.name,
    entries: g.entries,
    exits: g.exits,
  })), [topGroups]);

  const hasTimeline = timeline.some((t) => t.clicks + t.entries + t.exits > 0);
  const hasTopGroups = topGroupsData.some((g) => g.entries + g.exits > 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Timeline — spans 2 cols */}
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-background via-background to-primary/5 lg:col-span-2">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-20 right-0 h-56 w-56 rounded-full bg-[hsl(158_84%_52%_/_0.15)] blur-3xl" />
        </div>
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Fluxo ao longo do tempo
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          {!hasTimeline ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Sem movimentação no período.
            </p>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradClicks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.clicks} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={CHART_COLORS.clicks} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradEntries" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.entries} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={CHART_COLORS.entries} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradExits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.exits} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={CHART_COLORS.exits} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 6" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke={CHART_COLORS.axis}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke={CHART_COLORS.axis}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={36}
                  />
                  <Tooltip content={<FuturisticTooltip />} cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '3 3' }} />
                  <Area
                    type="monotone" dataKey="clicks" name="Clicks"
                    stroke={CHART_COLORS.clicks} strokeWidth={2}
                    fill="url(#gradClicks)"
                    activeDot={{ r: 4, style: { filter: `drop-shadow(0 0 6px ${CHART_COLORS.clicks})` } }}
                  />
                  <Area
                    type="monotone" dataKey="entries" name="Entradas"
                    stroke={CHART_COLORS.entries} strokeWidth={2}
                    fill="url(#gradEntries)"
                    activeDot={{ r: 4, style: { filter: `drop-shadow(0 0 6px ${CHART_COLORS.entries})` } }}
                  />
                  <Area
                    type="monotone" dataKey="exits" name="Saídas"
                    stroke={CHART_COLORS.exits} strokeWidth={2}
                    fill="url(#gradExits)"
                    activeDot={{ r: 4, style: { filter: `drop-shadow(0 0 6px ${CHART_COLORS.exits})` } }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Radial de conversão */}
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.15),transparent_60%)]" />
        </div>
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="h-4 w-4 text-primary" />
            Taxa de conversão
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <div className="relative h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="70%" outerRadius="100%"
                data={conversionData} startAngle={220} endAngle={-40}
              >
                <defs>
                  <linearGradient id="gradConversion" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="100%" stopColor="hsl(158 84% 52%)" />
                  </linearGradient>
                </defs>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar background={{ fill: 'hsl(var(--muted) / 0.4)' }} dataKey="value" cornerRadius={12} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-4xl font-bold tracking-tight text-foreground drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)]">
                {conversion.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground">clicks → entradas</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {compositionData.map((c) => (
              <div key={c.name} className="rounded-lg border border-border/60 bg-muted/30 p-2">
                <div className="flex items-center justify-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color, boxShadow: `0 0 6px ${c.color}` }} />
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.name}</span>
                </div>
                <p className="mt-1 text-sm font-bold tabular-nums text-foreground">{c.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top grupos — full width */}
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-background via-background to-primary/5 lg:col-span-3">
        <div className="pointer-events-none absolute inset-0 opacity-30">
          <div className="absolute right-0 top-0 h-40 w-1/2 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.25),transparent_70%)]" />
        </div>
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            Top grupos por movimentação
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          {!hasTopGroups ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Sem movimentação por grupo no período.
            </p>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topGroupsData}
                  layout="vertical"
                  margin={{ top: 8, right: 20, left: 8, bottom: 0 }}
                  barCategoryGap={10}
                >
                  <defs>
                    <linearGradient id="gradBarEntries" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={CHART_COLORS.entries} stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                    </linearGradient>
                    <linearGradient id="gradBarExits" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={CHART_COLORS.exits} stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(340 82% 60%)" stopOpacity={0.9} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 6" horizontal={false} />
                  <XAxis type="number" stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis
                    type="category" dataKey="name" stroke={CHART_COLORS.axis}
                    fontSize={11} tickLine={false} axisLine={false} width={160}
                  />
                  <Tooltip content={<FuturisticTooltip />} cursor={{ fill: 'hsl(var(--primary) / 0.08)' }} />
                  <Bar dataKey="entries" name="Entradas" fill="url(#gradBarEntries)" radius={[6, 6, 6, 6]} />
                  <Bar dataKey="exits" name="Saídas" fill="url(#gradBarExits)" radius={[6, 6, 6, 6]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
