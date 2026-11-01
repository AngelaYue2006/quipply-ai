import { SCORE_CONFIG } from '../config';
import type { FitChecklist, MatchResult, Verdict } from '../shared/match';
import { hardKind, type Eligibility } from './eligibility';

type ScoreConfig = typeof SCORE_CONFIG;

export function verdictFor(score: number, cfg: ScoreConfig = SCORE_CONFIG): Exclude<Verdict, 'ineligible'> {
  if (score >= cfg.verdicts.strong) return 'strong';
  if (score >= cfg.verdicts.good) return 'good';
  if (score >= cfg.verdicts.stretch) return 'stretch';
  return 'weak';
}

/** Weighted share of met requirements, 0-100. Unclear items are left out. Null when nothing could be judged. */
export function computeScore(fit: FitChecklist, cfg: ScoreConfig = SCORE_CONFIG): { score: number | null; judged: number } {
  const judged = fit.requirements.filter((r) => r.met !== 'unclear');
  if (judged.length === 0) return { score: null, judged: 0 };
  let earned = 0;
  let total = 0;
  for (const r of judged) {
    const w = cfg.weights[r.kind];
    total += w;
    earned += w * cfg.values[r.met as 'yes' | 'partial' | 'no'];
  }
  let score = Math.round((100 * earned) / total);
  const requiredNo = judged.filter((r) => r.kind === 'required' && r.met === 'no').length;
  if (requiredNo >= cfg.requiredNoCapCount) score = Math.min(score, cfg.requiredNoCap);
  return { score, judged: judged.length };
}

/** Turn eligibility + a quote-checked checklist into the result the dashboard shows. */
export function assemble(
  elig: Eligibility,
  fit: FitChecklist,
  extra: { quoteFailures: number; truncated: boolean },
  cfg: ScoreConfig = SCORE_CONFIG,
): MatchResult {
  const { score, judged } = computeScore(fit, cfg);
  const warnings = [...elig.warnings];
  if (extra.truncated) warnings.push(`Description was longer than ${cfg.descriptionCharLimit.toLocaleString()} characters and was cut.`);
  if (extra.quoteFailures > 0)
    warnings.push(`${extra.quoteFailures} item(s) quoted text that isn't in the posting or your profile, so they were ignored.`);
  if (judged < cfg.lowConfidenceBelow) warnings.push('low confidence');
  for (const h of fit.hardRequirements) {
    const kind = hardKind(`${h.text} ${h.jobQuote}`);
    if (!kind || !elig.handled.has(kind)) warnings.push(`posting mentions a ${kind?.replace('_', ' ') ?? 'hard'} requirement: "${h.jobQuote || h.text}"`);
  }

  const order = { required: 0, preferred: 1 } as const;
  const skillItems = fit.requirements.filter((r) => r.category === 'skill' && r.met !== 'unclear');
  return {
    status: 'scored',
    score,
    verdict: score === null ? null : verdictFor(score, cfg),
    eligibility: { eligible: true, blockers: [] },
    strengths: fit.requirements
      .filter((r) => r.met === 'yes')
      .map((r) => ({ point: r.text, evidence: { job: r.jobQuote, profile: r.profileEvidence ?? '' } })),
    gaps: fit.requirements
      .filter((r) => r.met === 'no' || r.met === 'partial')
      .sort((a, b) => order[a.kind] - order[b.kind])
      .map((r) => ({ point: r.met === 'partial' ? `${r.text} (partly)` : r.text, severity: r.kind })),
    skills: {
      required: skillItems.filter((r) => r.kind === 'required').map((r) => ({ skill: r.text, have: r.met === 'yes' })),
      preferred: skillItems.filter((r) => r.kind === 'preferred').map((r) => ({ skill: r.text, have: r.met === 'yes' })),
    },
    summary: fit.summary || null,
    warnings,
  };
}
