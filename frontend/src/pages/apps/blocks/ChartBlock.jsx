import { AreaChart, ChartLegend } from '../../../components/ui/charts/AreaChart.jsx';
import { BarChart } from '../../../components/ui/charts/BarChart.jsx';
import { Donut } from '../../../components/ui/charts/Donut.jsx';
import { Spinner } from '../../../components/ui/Spinner.jsx';
import { useBlockData } from '../useApps.js';
import { BlockFrame, SampleNote } from './BlockFrame.jsx';

const COLOR = { brand: 'var(--accent)', gray: 'var(--muted)', blue: 'var(--fi-blue)', green: 'var(--success)', amber: 'var(--warning)', red: 'var(--danger)', purple: 'var(--fi-purple)', pink: 'var(--fi-pink)', teal: 'var(--fi-teal)', indigo: 'var(--fi-indigo)' };
const PALETTE = ['var(--accent)', 'var(--fi-blue)', 'var(--fi-teal)', 'var(--fi-orange)', 'var(--fi-pink)', 'var(--fi-indigo)', 'var(--fi-purple)'];
const MEASURE = { count: 'Records', sum: 'Total', avg: 'Average', min: 'Smallest', max: 'Largest' };

/** The chart kinds draw what the server aggregated. */
export default function ChartBlock({ block, onSettings }) {
  const s = block.settings; const data = useBlockData(block.id, {}); const d = data.data;
  const color = COLOR[s.color] ?? COLOR.brand;
  if (!block.object) return <BlockFrame block={block} onSettings={onSettings}><p className="text-sm text-muted">Choose an object for this chart in its settings.</p></BlockFrame>;
  let body = <div className="grid place-items-center py-10"><Spinner /></div>;
  if (d) {
    if (d.type === 'kpi') body = <div className="py-2"><p className="text-4xl font-semibold tracking-tight text-ink">{d.kpi.value.toLocaleString()}</p><p className="mt-1 text-sm text-muted">{MEASURE[d.measure.fn]}{d.measure.field ? ` of ${d.measure.field}` : ''}</p><p className={`mt-2 text-sm font-medium ${d.kpi.delta >= 0 ? 'text-success' : 'text-danger'}`}>{d.kpi.delta >= 0 ? '+' : ''}{d.kpi.delta}% vs. last period</p></div>;
    else if (d.type === 'pie' || d.type === 'donut') body = <Donut data={d.series.map((x, i) => ({ label: x.label, value: x.value, color: PALETTE[i % PALETTE.length] }))} thickness={d.type === 'pie' ? 74 : 20} size={d.type === 'pie' ? 160 : 148} centerValue={d.type === 'pie' ? '' : d.total.toLocaleString()} centerLabel={d.type === 'pie' ? '' : MEASURE[d.measure.fn]} />;
    else if (d.type === 'line' || d.type === 'area') body = <><AreaChart labels={d.series.map((x) => x.label)} series={[{ key: 'v', label: MEASURE[d.measure.fn], color, values: d.series.map((x) => x.value) }]} every={Math.ceil(d.series.length / 6)} />{s.showLegend && <div className="pt-2"><ChartLegend items={[{ label: MEASURE[d.measure.fn], color }]} /></div>}</>;
    else body = <BarChart data={d.series} color={color} showLabels={s.showLabels} />;
  }
  return <BlockFrame block={block} onSettings={onSettings}>{body}<SampleNote sample={d?.sample} /></BlockFrame>;
}
