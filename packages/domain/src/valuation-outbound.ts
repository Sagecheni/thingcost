export interface ValuationOutboundSummary {
  assetId: string;
  name: string;
  brand: string | null;
  model: string | null;
  categoryName: string;
  acquisitionDate: string;
  acquisitionType: string;
  conditionGrade: 'new' | 'like_new' | 'good' | 'fair' | 'poor' | null;
  defectSummary: string[];
  regionHint: string;
  baseCurrency: string;
  publicDescription: string | null;
}

export interface ValuationAssetSource {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  categoryName: string;
  acquisitionDate: string;
  acquisitionType: string;
  conditionGrade: 'new' | 'like_new' | 'good' | 'fair' | 'poor' | null;
  /** Short public-facing defect labels only — never free-form private notes. */
  defectLabels: string[];
  /** Optional short public description; private notes must not be passed in. */
  publicDescription: string | null;
}

/**
 * Build the only payload allowed to leave the server for AI valuation.
 * Serial numbers, invoices, borrowers, attachments, and private notes are excluded by construction.
 */
export function buildValuationOutboundSummary(input: {
  asset: ValuationAssetSource;
  regionHint: string;
  baseCurrency: string;
}): ValuationOutboundSummary {
  const description = input.asset.publicDescription?.trim() || null;

  return {
    assetId: input.asset.id,
    name: input.asset.name.trim().slice(0, 160),
    brand: input.asset.brand?.trim().slice(0, 120) || null,
    model: input.asset.model?.trim().slice(0, 160) || null,
    categoryName: input.asset.categoryName.trim().slice(0, 80),
    acquisitionDate: input.asset.acquisitionDate,
    acquisitionType: input.asset.acquisitionType,
    conditionGrade: input.asset.conditionGrade,
    defectSummary: input.asset.defectLabels
      .map((label) => label.trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((label) => label.slice(0, 200)),
    regionHint: input.regionHint.trim().slice(0, 80) || 'CN',
    baseCurrency: input.baseCurrency,
    publicDescription: description ? description.slice(0, 500) : null,
  };
}

export function valuationSearchQuery(summary: ValuationOutboundSummary): string {
  const parts = [
    summary.brand,
    summary.model,
    summary.name,
    summary.categoryName,
    summary.conditionGrade ? `condition ${summary.conditionGrade}` : null,
    summary.regionHint,
    'resale value',
    'second hand price',
  ].filter(Boolean);

  return parts.join(' ').replaceAll(/\s+/gu, ' ').trim();
}
