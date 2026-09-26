# EDC Regulatory-Divergence Screen

Next.js dashboard for the 22-chemical EDC panel: an India-vs-EU Risk-Priority Index (RPI) ranking for
Stratum 1 and a separate "convergent prohibitions" view for Stratum 2.

- Data lives in `data/*.csv` and is read **at build time** (`lib/data.ts`). No database, no API calls.
- RPI = 0.4 × binding_anchored + 0.3 × divergence_norm + 0.3 × exposure_norm, all three read straight
  from the CSVs. The dashboard does no normalization; binding is control-anchored (glucose 0, agonist 1).

## Update the data

Replace the CSVs in `data/` (same column names) and redeploy. The build fails loudly if a chemical is
missing from a file or its stratum disagrees between files.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

Push this folder to a Git repo and import it in Vercel (framework preset: Next.js). No environment
variables are needed.
