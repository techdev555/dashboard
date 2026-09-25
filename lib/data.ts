import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv";

export const RECEPTORS = [
  { key: "ERalpha", label: "ERα" },
  { key: "ERbeta", label: "ERβ" },
  { key: "AR", label: "AR" },
  { key: "TRbeta", label: "TRβ" },
] as const;

export const WEIGHTS = { binding: 0.4, divergence: 0.3, exposure: 0.3 } as const;

export type Receptor = {
  key: string;
  label: string;
  score: number;
  threshold: number;
  engages: boolean;
};

export type Flag = { field: string; term: string; excerpt: string };

export type Docking = {
  heavyAtoms: number;
  breadth: number;
  meanDocking: number;
  receptors: Receptor[];
};

export type Stratum1Chemical = {
  rank: number;
  chemical: string;
  cas: string;
  indiaStatus: string;
  euStatus: string;
  verification: string;
  divergenceScore: number;
  divergenceRationale: string;
  divergenceSource: string;
  exposureScore: number;
  exposureTier: number;
  exposureRationale: string;
  exposureSource: string;
  docking: Docking;
  bindingNorm: number;
  divergenceNorm: number;
  exposureNorm: number;
  rpi: number;
  flags: Flag[];
};

export type Stratum2Chemical = {
  chemical: string;
  cas: string;
  indiaStatus: string;
  euStatus: string;
  indiaCitation: string;
  euCitation: string;
  rationale: string;
  docking: Docking;
};

export type Dataset = {
  stratum1: Stratum1Chemical[];
  stratum2: Stratum2Chemical[];
  bounds: {
    meanDocking: [number, number];
    divergence: [number, number];
    exposure: [number, number];
  };
};

// Terms that mark a row as pending verification. The first four come from the
// methodology doc; the rest catch open questions the authors left in the text.
const FLAG_TERMS: { term: string; re: RegExp }[] = [
  { term: "FLAG", re: /\bflag\b/i },
  { term: "verification", re: /\bverification\b/i },
  { term: "inference", re: /\binference\b/i },
  { term: "precedent", re: /\bprecedent\b/i },
  { term: "still to be", re: /\bstill to be\b/i },
  { term: "confirm", re: /\bconfirm\b(?!ed)/i },
  { term: "consider whether", re: /\bconsider whether\b/i },
];

function findFlags(fields: Record<string, string>): Flag[] {
  const flags: Flag[] = [];
  for (const [field, text] of Object.entries(fields)) {
    for (const { term, re } of FLAG_TERMS) {
      const m = re.exec(text);
      if (!m) continue;
      flags.push({ field, term, excerpt: sentenceAround(text, m.index) });
    }
  }
  return flags;
}

// Return the clause (split on ". ", "; " or " - ") that contains position idx.
function sentenceAround(text: string, idx: number): string {
  const sep = /(\. |; | - )/g;
  let start = 0;
  for (const m of text.matchAll(sep)) {
    const end = m.index! + m[0].length;
    if (m.index! >= idx) return text.slice(start, m.index! + (m[0] === ". " ? 1 : 0)).trim();
    start = end;
  }
  return text.slice(start).trim();
}

function readCsv(name: string) {
  return parseCsv(fs.readFileSync(path.join(process.cwd(), "data", name), "utf8"));
}

function num(v: string, what: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Expected a number for ${what}, got "${v}"`);
  return n;
}

function minMax(values: number[]): [number, number] {
  return [Math.min(...values), Math.max(...values)];
}

function norm(v: number, [lo, hi]: [number, number]): number {
  return hi === lo ? 0 : (v - lo) / (hi - lo);
}

function splitSource(source: string): { india: string; eu: string } {
  const [india = "", eu = ""] = source.split("|").map((s) => s.trim());
  return {
    india: india.replace(/^IN:\s*/, ""),
    eu: eu.replace(/^EU:\s*/, ""),
  };
}

export function loadDataset(): Dataset {
  const divergence = readCsv("divergence_22.csv");
  const docking = readCsv("docking_22.csv");
  const exposure = readCsv("exposure_22.csv");

  const byName = <T extends Record<string, string>>(rows: T[]) =>
    new Map(rows.map((r) => [r.chemical, r]));
  const divMap = byName(divergence);
  const expMap = byName(exposure);

  const dockingOf = (row: Record<string, string>): Docking => {
    const receptors = RECEPTORS.map(({ key, label }) => ({
      key,
      label,
      score: num(row[`score_${key}`], `${row.chemical} score_${key}`),
      threshold: num(row[`threshold_${key}`], `${row.chemical} threshold_${key}`),
      engages: row[`engages_${key}`].toLowerCase() === "yes",
    }));
    return {
      heavyAtoms: num(row.heavy_atoms, `${row.chemical} heavy_atoms`),
      breadth: receptors.filter((r) => r.engages).length,
      meanDocking: receptors.reduce((s, r) => s + r.score, 0) / receptors.length,
      receptors,
    };
  };

  const s1Raw: Omit<Stratum1Chemical, "rank" | "bindingNorm" | "divergenceNorm" | "exposureNorm" | "rpi">[] = [];
  const stratum2: Stratum2Chemical[] = [];

  for (const d of docking) {
    const div = divMap.get(d.chemical);
    const exp = expMap.get(d.chemical);
    if (!div || !exp) throw new Error(`"${d.chemical}" is missing from divergence or exposure CSV`);
    if (d.stratum !== div.stratum || d.stratum !== exp.stratum) {
      throw new Error(`Stratum mismatch for "${d.chemical}"`);
    }

    if (d.stratum === "S1") {
      s1Raw.push({
        chemical: d.chemical,
        cas: d.cas,
        indiaStatus: div.india_status,
        euStatus: div.eu_status,
        verification: div.verification,
        divergenceScore: num(div.divergence_score, `${d.chemical} divergence_score`),
        divergenceRationale: div.rationale,
        divergenceSource: div.source,
        exposureScore: num(exp.exposure_score, `${d.chemical} exposure_score`),
        exposureTier: num(exp.exposure_tier, `${d.chemical} exposure_tier`),
        exposureRationale: exp.rationale,
        exposureSource: exp.source,
        docking: dockingOf(d),
        flags: findFlags({
          "Divergence rationale": div.rationale,
          "Divergence source": div.source,
          "Exposure rationale": exp.rationale,
          "Exposure source": exp.source,
        }),
      });
    } else {
      const { india, eu } = splitSource(div.source);
      stratum2.push({
        chemical: d.chemical,
        cas: d.cas,
        indiaStatus: div.india_status,
        euStatus: div.eu_status,
        indiaCitation: india,
        euCitation: eu,
        rationale: div.rationale,
        docking: dockingOf(d),
      });
    }
  }

  // Normalize across Stratum 1 only; Stratum 2 is unscored by design.
  const bounds = {
    meanDocking: minMax(s1Raw.map((c) => c.docking.meanDocking)),
    divergence: minMax(s1Raw.map((c) => c.divergenceScore)),
    exposure: minMax(s1Raw.map((c) => c.exposureScore)),
  };

  const stratum1 = s1Raw
    .map((c) => {
      // More negative docking = stronger binding, so invert after normalizing.
      const bindingNorm = 1 - norm(c.docking.meanDocking, bounds.meanDocking);
      const divergenceNorm = norm(c.divergenceScore, bounds.divergence);
      const exposureNorm = norm(c.exposureScore, bounds.exposure);
      const rpi =
        WEIGHTS.binding * bindingNorm +
        WEIGHTS.divergence * divergenceNorm +
        WEIGHTS.exposure * exposureNorm;
      return { ...c, bindingNorm, divergenceNorm, exposureNorm, rpi, rank: 0 };
    })
    .sort((a, b) => b.rpi - a.rpi)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  stratum2.sort(
    (a, b) => b.docking.breadth - a.docking.breadth || a.docking.meanDocking - b.docking.meanDocking
  );

  return { stratum1, stratum2, bounds };
}
