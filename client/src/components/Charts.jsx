import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useChartColors } from '../hooks.js';
import { compact, money, money0, signedMoney } from '../format.js';

const axisProps = (c) => ({
  tick: { fill: c.muted, fontSize: 12 },
  axisLine: { stroke: c.axis },
  tickLine: false,
});

function Tip({ active, payload, label, labelFormat, rows }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="tip">
      <div className="tip-title">{labelFormat ? labelFormat(label, d) : label}</div>
      {rows(d).map((r) => (
        <div className="tip-row" key={r.name}>
          <span>{r.color && <i style={{ background: r.color }} />}{r.name}</span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.name}><i className={it.line ? 'line' : ''} style={{ background: it.color }} />{it.name}</span>
      ))}
    </div>
  );
}

/** Income vs expenses per period: two thin grouped bars on one RON axis. */
export function IncomeExpenseChart({ data, xKey, xFormat, height = 280 }) {
  const c = useChartColors();
  return (
    <div className="stack" style={{ gap: 10 }}>
      <Legend items={[{ name: 'Income', color: c.income }, { name: 'Expenses', color: c.expense }]} />
      <div className="chart" style={{ height }}>
        <ResponsiveContainer>
          <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey={xKey} tickFormatter={xFormat} {...axisProps(c)} />
            <YAxis tickFormatter={compact} {...axisProps(c)} axisLine={false} width={48} />
            <Tooltip
              cursor={{ fill: c.grid, opacity: 0.5 }}
              content={<Tip labelFormat={(l) => (xFormat ? xFormat(l) : l)} rows={(d) => [
                { name: 'Income', value: money(d.income), color: c.income },
                { name: 'Expenses', value: money(d.expenses), color: c.expense },
                { name: 'Profit', value: signedMoney(d.profit), color: d.profit >= 0 ? c.pos : c.neg },
              ]} />}
            />
            <Bar dataKey="income" name="Income" fill={c.income} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expenses" name="Expenses" fill={c.expense} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Profit per period, diverging around zero: blue above, red below. */
export function ProfitChart({ data, xKey, xFormat, height = 230 }) {
  const c = useChartColors();
  return (
    <div className="stack" style={{ gap: 10 }}>
      <Legend items={[{ name: 'Profit', color: c.pos }, { name: 'Loss', color: c.neg }]} />
      <div className="chart" style={{ height }}>
        <ResponsiveContainer>
          <BarChart data={data} barCategoryGap="30%" margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey={xKey} tickFormatter={xFormat} {...axisProps(c)} axisLine={false} />
            <YAxis tickFormatter={compact} {...axisProps(c)} axisLine={false} width={48} />
            <ReferenceLine y={0} stroke={c.axis} />
            <Tooltip
              cursor={{ fill: c.grid, opacity: 0.5 }}
              content={<Tip labelFormat={(l) => (xFormat ? xFormat(l) : l)} rows={(d) => [
                { name: d.profit >= 0 ? 'Profit' : 'Loss', value: signedMoney(d.profit), color: d.profit >= 0 ? c.pos : c.neg },
              ]} />}
            />
            <Bar dataKey="profit" radius={4} maxBarSize={28}>
              {data.map((d, i) => <Cell key={i} fill={d.profit >= 0 ? c.pos : c.neg} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Running total of profit across the periods. */
export function CumulativeChart({ data, xKey, xFormat, height = 230 }) {
  const c = useChartColors();
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey={xKey} tickFormatter={xFormat} {...axisProps(c)} />
          <YAxis tickFormatter={compact} {...axisProps(c)} axisLine={false} width={48} />
          <ReferenceLine y={0} stroke={c.axis} />
          <Tooltip
            cursor={{ stroke: c.axis }}
            content={<Tip labelFormat={(l) => (xFormat ? xFormat(l) : l)} rows={(d) => [
              { name: 'Cumulative', value: signedMoney(d.cumulative), color: c.series },
              { name: 'This period', value: signedMoney(d.profit) },
            ]} />}
          />
          <Line type="monotone" dataKey="cumulative" stroke={c.series} strokeWidth={2} dot={{ r: 3, fill: c.series, stroke: c.surface, strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Several money series side by side per category, on one RON axis.
 * series: [{ key, name, color }]. Thin bars, 2px gaps, legend above, tooltip lists every series.
 */
export function GroupedBars({ data, xKey, xFormat, series, height = 280, extraRows, allTicks = false }) {
  const c = useChartColors();
  return (
    <div className="stack" style={{ gap: 10 }}>
      <Legend items={series} />
      <div className="chart" style={{ height }}>
        <ResponsiveContainer>
          <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey={xKey} tickFormatter={xFormat} {...axisProps(c)} interval={allTicks ? 0 : 'preserveStartEnd'} minTickGap={8} />
            <YAxis tickFormatter={compact} {...axisProps(c)} axisLine={false} width={48} />
            <ReferenceLine y={0} stroke={c.axis} />
            <Tooltip
              cursor={{ fill: c.grid, opacity: 0.5 }}
              content={<Tip labelFormat={(l) => (xFormat ? xFormat(l) : l)} rows={(d) => [
                ...series.map((s) => ({ name: s.name, value: money(d[s.key]), color: s.color })),
                ...(extraRows ? extraRows(d) : []),
              ]} />}
            />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={18} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Line of a running balance over time (single series). */
export function BalanceLine({ data, xKey, yKey, xFormat, name = 'Balance', height = 220 }) {
  const c = useChartColors();
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey={xKey} tickFormatter={xFormat} {...axisProps(c)} />
          <YAxis tickFormatter={compact} {...axisProps(c)} axisLine={false} width={48} />
          <ReferenceLine y={0} stroke={c.axis} />
          <Tooltip cursor={{ stroke: c.axis }}
            content={<Tip labelFormat={(l) => (xFormat ? xFormat(l) : l)} rows={(d) => [{ name, value: money(d[yKey]), color: c.sportfund }]} />} />
          <Line type="linear" dataKey={yKey} stroke={c.sportfund} strokeWidth={2} isAnimationActive={false}
            dot={{ r: 3, fill: c.sportfund, stroke: c.surface, strokeWidth: 2 }} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Labelled horizontal bars that may be negative: they grow right from zero, or left in red.
 * items: [{ id, name, value, sub? }]
 */
export function SignedBarList({ items, color, onOpen, empty = 'No data yet' }) {
  const c = useChartColors();
  if (!items.length) return <div className="empty">{empty}</div>;
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  const hasNeg = items.some((i) => i.value < 0);
  return (
    <div className="bar-list">
      {items.map((it) => {
        const w = (Math.abs(it.value) / max) * (hasNeg ? 50 : 100);
        const left = hasNeg ? (it.value >= 0 ? 50 : 50 - w) : 0;
        return (
          <div className="bar-row" key={it.id ?? it.name} style={{ cursor: onOpen ? 'pointer' : undefined }} onClick={() => onOpen?.(it)}
            title={`${it.name}: ${money(it.value)}${it.sub ? ` · ${it.sub}` : ''}`}>
            <span className="name">{it.name}</span>
            <div className="track" style={{ position: 'relative', background: hasNeg ? 'transparent' : undefined }}>
              {hasNeg && <div style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 1, background: c.axis }} />}
              <div className="fill" style={{ position: 'absolute', left: `${left}%`, width: `${w}%`, background: it.value >= 0 ? color : c.neg }} />
            </div>
            <span className={`num ${it.value < 0 ? 'neg' : ''}`}>{money0(it.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal labelled bars in plain HTML: name, bar, value. Good for category breakdowns. */
export function BarList({ items, color, total, empty = 'No data yet' }) {
  if (!items.length) return <div className="empty">{empty}</div>;
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  const sum = total ?? items.reduce((s, i) => s + i.value, 0);
  return (
    <div className="bar-list">
      {items.map((it) => (
        <div className="bar-row" key={it.name} title={`${it.name}: ${money(it.value)}${sum ? ` (${Math.round((it.value / sum) * 100)}%)` : ''}`}>
          <span className="name">{it.name}</span>
          <div className="track"><div className="fill" style={{ width: `${(Math.abs(it.value) / max) * 100}%`, background: it.color || color }} /></div>
          <span className="num">
            {money0(it.value)}
            {sum > 0 && <span className="muted"> · {Math.round((it.value / sum) * 100)}%</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Event ranking by profit: bars grow right for profit, left for loss, from a shared zero. */
export function EventProfitList({ events, onOpen }) {
  const c = useChartColors();
  if (!events.length) return <div className="empty">No completed events in this period</div>;
  const max = Math.max(...events.map((e) => Math.abs(e.profit)), 1);
  const hasNeg = events.some((e) => e.profit < 0);
  return (
    <div className="bar-list">
      {events.map((e) => {
        const w = (Math.abs(e.profit) / max) * (hasNeg ? 50 : 100);
        const left = hasNeg ? (e.profit >= 0 ? 50 : 50 - w) : 0;
        return (
          <div className="bar-row" key={e.id} style={{ cursor: onOpen ? 'pointer' : undefined }} onClick={() => onOpen?.(e)}
            title={`${e.name} · ${e.date}: income ${money(e.income)}, expenses ${money(e.expenses)}`}>
            <span className="name">{e.name}</span>
            <div className="track" style={{ position: 'relative', background: 'transparent' }}>
              {hasNeg && <div style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 1, background: c.axis }} />}
              <div className="fill" style={{ position: 'absolute', left: `${left}%`, width: `${w}%`, background: e.profit >= 0 ? c.pos : c.neg }} />
            </div>
            <span className={`num ${e.profit >= 0 ? 'pos' : 'neg'}`}>{signedMoney(e.profit)}</span>
          </div>
        );
      })}
    </div>
  );
}
