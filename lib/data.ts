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
  binding: number;
};

export type Docking = {
  heavyAtoms: number;
  breadth: number;
  meanDocking: number;
  receptors: Receptor[];
  // Control-anchored: glucose = 0, reference agonist = 1, mean over the 4 receptors.
  // Comparable across strata. Not clipped, so it can be negative.
  bindingAnchored: number;
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
  divergenceNorm: number;
  exposureNorm: number;
  rpi: number;
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
};

function readCsv(name: string) {
  return parseCsv(fs.readFileSync(path.join(process.cwd(), "data", name), "utf8"));
}

function num(v: string, what: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Expected a number for ${what}, got "${v}"`);
  return n;
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
  const dockMap = byName(docking);

  // Every chemical must appear in all three files, spelled identically.
  const allNames = new Set([...divMap.keys(), ...expMap.keys(), ...dockMap.keys()]);
  for (const [file, m] of [["divergence_22.csv", divMap], ["exposure_22.csv", expMap], ["docking_22.csv", dockMap]] as const) {
    for (const name of allNames) {
      if (!m.has(name)) throw new Error(`"${name}" is missing from ${file}`);
    }
  }

  const dockingOf = (row: Record<string, string>): Docking => {
    const receptors = RECEPTORS.map(({ key, label }) => ({
      key,
      label,
      score: num(row[`score_${key}`], `${row.chemical} score_${key}`),
      threshold: num(row[`threshold_${key}`], `${row.chemical} threshold_${key}`),
      engages: row[`engages_${key}`].toLowerCase() === "yes",
      binding: num(row[`binding_${key}`], `${row.chemical} binding_${key}`),
    }));
    return {
      heavyAtoms: num(row.heavy_atoms, `${row.chemical} heavy_atoms`),
      breadth: receptors.filter((r) => r.engages).length,
      meanDocking: receptors.reduce((s, r) => s + r.score, 0) / receptors.length,
      receptors,
      bindingAnchored: num(row.binding_anchored, `${row.chemical} binding_anchored`),
    };
  };

  const s1Raw: Omit<Stratum1Chemical, "rank" | "rpi">[] = [];
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
        divergenceNorm: num(div.divergence_norm, `${d.chemical} divergence_norm`),
        divergenceRationale: div.rationale,
        divergenceSource: div.source,
        exposureScore: num(exp.exposure_score, `${d.chemical} exposure_score`),
        exposureTier: num(exp.exposure_tier, `${d.chemical} exposure_tier`),
        exposureNorm: num(exp.exposure_norm, `${d.chemical} exposure_norm`),
        exposureRationale: exp.rationale,
        exposureSource: exp.source,
        docking: dockingOf(d),
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

  // All three RPI terms come pre-computed from the CSVs; the dashboard does no normalization.
  // Stratum 2 is unscored by design.
  const stratum1 = s1Raw
    .map((c) => {
      const rpi =
        WEIGHTS.binding * c.docking.bindingAnchored +
        WEIGHTS.divergence * c.divergenceNorm +
        WEIGHTS.exposure * c.exposureNorm;
      return { ...c, rpi, rank: 0 };
    })
    .sort((a, b) => b.rpi - a.rpi)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  stratum2.sort((a, b) => b.docking.bindingAnchored - a.docking.bindingAnchored);

  return { stratum1, stratum2 };
}
