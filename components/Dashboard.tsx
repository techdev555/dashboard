"use client";

import { Fragment, useMemo, useState } from "react";
import type { Dataset, Docking, Stratum1Chemical, Stratum2Chemical } from "@/lib/data";

const WEIGHTS = { binding: 0.4, divergence: 0.3, exposure: 0.3 };

const COMPONENTS = [
  { key: "binding", label: "Binding", weight: WEIGHTS.binding, color: "var(--series-1)" },
  { key: "divergence", label: "Divergence", weight: WEIGHTS.divergence, color: "var(--series-2)" },
  { key: "exposure", label: "Exposure", weight: WEIGHTS.exposure, color: "var(--series-3)" },
] as const;

type SortKey = "rpi" | "binding" | "divergence" | "exposure" | "breadth";

const SORTS: { key: SortKey; label: string; value: (c: Stratum1Chemical) => number }[] = [
  { key: "rpi", label: "RPI", value: (c) => c.rpi },
  { key: "binding", label: "Binding", value: (c) => c.docking.bindingAnchored },
  { key: "divergence", label: "Divergence", value: (c) => c.divergenceNorm },
  { key: "exposure", label: "Exposure", value: (c) => c.exposureNorm },
  { key: "breadth", label: "Receptor breadth", value: (c) => c.docking.breadth + c.docking.bindingAnchored / 10 },
];

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

const f2 = (n: number) => n.toFixed(2);
const f3 = (n: number) => n.toFixed(3);
const f4 = (n: number) => n.toFixed(4);

export default function Dashboard({ data }: { data: Dataset }) {
  const { stratum1, stratum2 } = data;
  const [sortKey, setSortKey] = useState<SortKey>("rpi");
  const [open, setOpen] = useState<string | null>(stratum1[0]?.chemical ?? null);
  const [tip, setTip] = useState<Tip>(null);

  const sorted = useMemo(() => {
    const s = SORTS.find((x) => x.key === sortKey)!;
    return [...stratum1].sort((a, b) => s.value(b) - s.value(a));
  }, [stratum1, sortKey]);

  const top = stratum1[0];
  const fullBans = stratum1.filter((c) => c.divergenceScore >= 1).length;
  const allFour = [...stratum1, ...stratum2].filter((c) => c.docking.breadth === 4).length;

  const showTip = (e: React.MouseEvent, title: string, lines: string[]) =>
    setTip({ x: e.clientX, y: e.clientY, title, lines });

  return (
    <main className="page">
      <header className="masthead">
        <p className="eyebrow">createED · EDC Regulatory-Divergence Screen</p>
        <h1>Which endocrine disruptors does India still permit that the EU does not?</h1>
        <p className="lede">
          22 cosmetic chemicals, docked against four nuclear receptors and compared across India&rsquo;s
          IS&nbsp;4707 and EU Regulation 1223/2009. The {stratum1.length} chemicals where the two
          jurisdictions diverge are ranked by a Risk-Priority Index; the {stratum2.length} already
          prohibited in both are shown separately.
        </p>
      </header>

      <section className="kpis" aria-label="Summary">
        <Kpi value={String(stratum1.length + stratum2.length)} label="Chemicals screened" note={`${stratum1.length} ranked · ${stratum2.length} convergent`} />
        <Kpi value={f3(top.rpi)} label="Highest RPI" note={top.chemical} />
        <Kpi value={String(fullBans)} label="Prohibited by the EU, not by India" note="Divergence score 1.0" />
        <Kpi value={String(allFour)} label="Engage all 4 receptors" note="Across both strata" />
      </section>

      <section className="panel" aria-labelledby="s1-title">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Stratum 1 · RPI-eligible · n={stratum1.length}</p>
            <h2 id="s1-title">Risk-Priority ranking</h2>
            <p className="sub">
              RPI = 0.4 × binding + 0.3 × divergence + 0.3 × exposure. Binding is control-anchored
              (glucose = 0, reference agonist = 1). Click a row for its full dossier.
            </p>
          </div>
          <div className="controls">
            <span className="control-label" id="sort-label">Sort by</span>
            <div className="seg" role="radiogroup" aria-labelledby="sort-label">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  role="radio"
                  aria-checked={sortKey === s.key}
                  className={sortKey === s.key ? "on" : ""}
                  onClick={() => setSortKey(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="legend" aria-label="Legend">
          {COMPONENTS.map((c) => (
            <span key={c.key} className="legend-item">
              <i style={{ background: c.color }} />
              {c.label} <span className="muted">× {c.weight}</span>
            </span>
          ))}
          <span className="legend-item muted">Bar length = RPI (0–1)</span>
        </div>

        <div className="rank-table" role="table" aria-label="Stratum 1 ranking">
          <div className="rank-row head" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">Chemical</span>
            <span role="columnheader">India → EU</span>
            <span role="columnheader">RPI composition</span>
            <span role="columnheader" className="num">RPI</span>
            <span role="columnheader" className="num">Receptors</span>
          </div>
          {sorted.map((c) => {
            const isOpen = open === c.chemical;
            return (
              <Fragment key={c.chemical}>
                <button
                  className={`rank-row ${isOpen ? "open" : ""}`}
                  role="row"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : c.chemical)}
                >
                  <span className="rank" role="cell">{c.rank}</span>
                  <span className="name" role="cell">
                    <strong>{c.chemical}</strong>
                    <span className="cas">CAS {c.cas}</span>
                  </span>
                  <span className="status" role="cell">
                    <span className="st-in">{c.indiaStatus}</span>
                    <span className="arrow" aria-hidden>→</span>
                    <span className="st-eu">{c.euStatus}</span>
                  </span>
                  <span className="bar-cell" role="cell" onMouseLeave={() => setTip(null)}>
                    <RpiBar c={c} onHover={showTip} />
                  </span>
                  <span className="num rpi" role="cell">{f4(c.rpi)}</span>
                  <span className="num" role="cell">
                    <BreadthDots docking={c.docking} />
                  </span>
                </button>
                {isOpen && <Dossier c={c} />}
              </Fragment>
            );
          })}
        </div>
      </section>

      <section className="panel" aria-labelledby="s2-title">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Stratum 2 · Convergent prohibitions · n={stratum2.length}</p>
            <h2 id="s2-title">Already prohibited in both India &amp; the EU</h2>
            <p className="sub">
              No divergence to rank, so no RPI, rank, divergence or exposure score — these are unscored
              by design. Docking is shown for context: these span the same range of receptor engagement as the
              divergent set, which is why regulatory status cannot be read as a proxy for hazard.
            </p>
          </div>
        </div>
        <div className="s2-grid">
          {stratum2.map((c) => (
            <S2Card key={c.chemical} c={c} />
          ))}
        </div>
      </section>

      <Methodology stratum2Count={stratum2.length} />

      {tip && (
        <div className="tooltip" style={{ left: tip.x + 14, top: tip.y + 14 }} role="tooltip">
          <strong>{tip.title}</strong>
          {tip.lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}
    </main>
  );
}

function Kpi({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="kpi">
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
      <span className="kpi-note">{note}</span>
    </div>
  );
}

function RpiBar({
  c,
  onHover,
}: {
  c: Stratum1Chemical;
  onHover: (e: React.MouseEvent, title: string, lines: string[]) => void;
}) {
  const parts = [
    { ...COMPONENTS[0], norm: c.docking.bindingAnchored },
    { ...COMPONENTS[1], norm: c.divergenceNorm },
    { ...COMPONENTS[2], norm: c.exposureNorm },
  ];
  return (
    <span className="rpi-bar" aria-label={`RPI ${f3(c.rpi)}`}>
      {parts.map((p) => {
        const contrib = p.weight * p.norm;
        if (contrib <= 0) return null;
        return (
          <span
            key={p.key}
            className="seg-fill"
            style={{ width: `${contrib * 100}%`, background: p.color }}
            onMouseMove={(e) =>
              onHover(e, `${c.chemical} · ${p.label}`, [
                `Term ${f4(p.norm)} × ${p.weight}`,
                `Contributes ${f3(contrib)} of ${f3(c.rpi)}`,
              ])
            }
          />
        );
      })}
    </span>
  );
}

function BreadthDots({ docking }: { docking: Docking }) {
  return (
    <span className="dots" aria-label={`${docking.breadth} of 4 receptors engaged`}>
      {docking.receptors.map((r) => (
        <span key={r.key} className={`dot ${r.engages ? "on" : ""}`} title={`${r.label}: ${r.engages ? "engages" : "below threshold"}`}>
          {r.label}
        </span>
      ))}
    </span>
  );
}

function ReceptorTable({ docking }: { docking: Docking }) {
  // Shared -4 → -10 kcal/mol axis so thresholds line up across rows and chemicals.
  const scale = (v: number) => `${Math.max(0, Math.min(100, ((-v - 4) / 6) * 100))}%`;
  return (
    <table className="receptors">
      <thead>
        <tr>
          <th>Receptor</th>
          <th className="num">Score</th>
          <th className="num">Threshold</th>
          <th className="num">Binding</th>
          <th aria-label="Score vs threshold" />
          <th>Engages</th>
        </tr>
      </thead>
      <tbody>
        {docking.receptors.map((r) => (
          <tr key={r.key}>
            <td>{r.label}</td>
            <td className="num">{f3(r.score)}</td>
            <td className="num muted">{f3(r.threshold)}</td>
            <td className="num">{f4(r.binding)}</td>
            <td className="rec-bar-cell">
              <span className="rec-bar">
                <span className={`rec-fill ${r.engages ? "on" : ""}`} style={{ width: scale(r.score) }} />
                <span className="rec-thresh" style={{ left: scale(r.threshold) }} />
              </span>
            </td>
            <td>{r.engages ? <span className="yes">Yes</span> : <span className="muted">No</span>}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Mean</td>
          <td className="num">{f3(docking.meanDocking)}</td>
          <td />
          <td className="num strong">{f4(docking.bindingAnchored)}</td>
          <td colSpan={2} className="muted">
            {docking.breadth}/4 engaged
          </td>
        </tr>
      </tfoot>
      <caption className="rec-caption">
        Scores in kcal/mol, more negative = stronger. Binding: glucose = 0, reference agonist = 1.{" "}
        {docking.heavyAtoms} heavy atoms.
      </caption>
    </table>
  );
}

function Dossier({ c }: { c: Stratum1Chemical }) {
  const breakdown = [
    {
      label: "Binding",
      raw: `${f3(c.docking.meanDocking)} kcal/mol mean`,
      note: "Control-anchored, mean of 4 receptors",
      term: c.docking.bindingAnchored,
      weight: WEIGHTS.binding,
    },
    {
      label: "Divergence",
      raw: f2(c.divergenceScore),
      note: "Min-max normalized in Stratum 1",
      term: c.divergenceNorm,
      weight: WEIGHTS.divergence,
    },
    {
      label: "Exposure",
      raw: `${f2(c.exposureScore)} (tier ${c.exposureTier})`,
      note: "Min-max normalized in Stratum 1",
      term: c.exposureNorm,
      weight: WEIGHTS.exposure,
    },
  ];

  return (
    <div className="dossier" role="region" aria-label={`${c.chemical} dossier`}>
      <div className="dossier-grid">
        <div className="dcol">
          <h3>Score breakdown</h3>
          <table className="breakdown">
            <thead>
              <tr>
                <th>Component</th>
                <th>Raw</th>
                <th className="num">Term</th>
                <th className="num">× w</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((b) => (
                <tr key={b.label}>
                  <td>{b.label}</td>
                  <td>
                    {b.raw}
                    <span className="range">{b.note}</span>
                  </td>
                  <td className="num">{f4(b.term)}</td>
                  <td className="num">{f4(b.term * b.weight)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>RPI (rank {c.rank})</td>
                <td className="num strong">{f4(c.rpi)}</td>
              </tr>
            </tfoot>
          </table>

          <h3>Receptor docking</h3>
          <ReceptorTable docking={c.docking} />
        </div>

        <div className="dcol">
          <h3>Regulatory divergence</h3>
          <dl className="facts">
            <dt>India</dt>
            <dd>{c.indiaStatus}</dd>
            <dt>EU</dt>
            <dd>{c.euStatus}</dd>
            <dt>Score</dt>
            <dd>
              {f2(c.divergenceScore)}
              {c.verification && <span className="verified">{c.verification}</span>}
            </dd>
          </dl>
          <p className="prose">{c.divergenceRationale}</p>
          <p className="source">{c.divergenceSource}</p>

          <h3>Exposure</h3>
          <dl className="facts">
            <dt>Score</dt>
            <dd>{f2(c.exposureScore)}</dd>
            <dt>Evidence tier</dt>
            <dd>{c.exposureTier} <span className="muted">(1 = strongest evidence)</span></dd>
          </dl>
          <p className="prose">{c.exposureRationale}</p>
          <p className="source">{c.exposureSource}</p>
        </div>
      </div>
    </div>
  );
}

function S2Card({ c }: { c: Stratum2Chemical }) {
  return (
    <article className="s2-card">
      <header>
        <h3>{c.chemical}</h3>
        <span className="cas">CAS {c.cas}</span>
      </header>
      <dl className="cites">
        <dt>India</dt>
        <dd>
          <span className="pill">{c.indiaStatus}</span> {c.indiaCitation}
        </dd>
        <dt>EU</dt>
        <dd>
          <span className="pill">{c.euStatus}</span> {c.euCitation}
        </dd>
      </dl>
      <div className="s2-dock">
        <BreadthDots docking={c.docking} />
        <span className="muted">
          binding {f3(c.docking.bindingAnchored)} · {c.docking.breadth}/4 · mean {f2(c.docking.meanDocking)} kcal/mol
        </span>
      </div>
    </article>
  );
}

function Methodology({ stratum2Count }: { stratum2Count: number }) {
  return (
    <footer className="method">
      <h2>Methodology</h2>
      <div className="method-grid">
        <div>
          <h3>Risk-Priority Index</h3>
          <p className="formula">RPI = 0.4 × binding + 0.3 × divergence + 0.3 × exposure</p>
          <p>
            Binding is control-anchored per receptor: glucose scores 0 and the reference agonist scores 1,
            so binding = (glucose − compound) / (glucose − agonist), averaged over ERα, ERβ, AR and TRβ.
            The scale does not depend on which chemicals are in the panel, so it is comparable across both
            strata. It is not clipped at zero: a chemical that binds more weakly than glucose, such as kojic
            acid, gets a negative value. Divergence and exposure are min-max normalized within Stratum 1 and
            supplied pre-computed in the CSVs; the dashboard does no normalization of its own.
          </p>
        </div>
        <div>
          <h3>Evidence tiering</h3>
          <p>
            Exposure scores are evidence-tiered, not measured prevalence. Most Stratum 1 exposure values rest
            on regulatory legality, supplier listings or category-level inference, because no compound-level
            Indian product survey or biomonitoring study was found. Lower tier numbers mean stronger evidence:
            tier 1 (0.65–0.80) is direct India product-survey data, tier 2 (0.50–0.60) category-level India
            data, tier 3 (0.40–0.50) a global product-survey proxy, tier 4 (0.35–0.45) a global category proxy
            and tier 5 (0.30–0.40) a regulatory-status proxy only. Every assigned score sits inside its own
            tier&rsquo;s band, a constraint the pipeline enforces.
          </p>
        </div>
        <div>
          <h3>Stratum 2 is unscored by design</h3>
          <p>
            The {stratum2Count} Stratum 2 chemicals are prohibited in both India (IS 4707 Annex A) and the EU
            (Reg. 1223/2009 Annex II). With no divergence to measure, they carry no RPI, rank, divergence or
            exposure score. That is deliberate, not missing data. Their anchored binding is shown because it
            is on the same fixed scale as Stratum 1&rsquo;s.
          </p>
        </div>
        <div>
          <h3>Receptor thresholds</h3>
          <p>
            A receptor&rsquo;s threshold is its glucose score minus 2.85 kcal/mol, AutoDock Vina&rsquo;s
            published standard error. Glucose is the inert negative control; the positive controls are
            estradiol at ERα and ERβ, DHT at AR, and GC-1 at TRβ. Across the 22 chemicals there are 23
            engagements (7 at ERα, 6 at ERβ, 3 at AR, 7 at TRβ), and 14 chemicals engage no receptor at all.
          </p>
        </div>
        <div>
          <h3>Scope</h3>
          <p>
            The comparison covers India vs the EU only; there is no US status in this dataset. Sources:
            <code>divergence_22.csv</code>, <code>docking_22.csv</code>, <code>exposure_22.csv</code>.
          </p>
        </div>
      </div>
    </footer>
  );
}
