export const INAT_PLACE_ID = '12446,13301,13302'; // Amazonas, Bolivar, Delta Amacuro (Venezuela)
export const INAT_API_BASE = 'https://api.inaturalist.org/v2';

export const REQUEST_HEADERS = {
  'User-Agent': 'BioLife-App/1.0 (contact@biolife.dev)',
  Accept: 'application/json',
};

export const COLORS = {
  background: '#EDF4E9',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F9F2',
  border: '#D0E3CD',
  primary: '#96E0A0',
  primaryMuted: 'rgba(150,224,160,0.2)',
  accent: '#2D5A27',
  danger: '#E05252',
  dangerMuted: 'rgba(224,82,82,0.15)',
  warning: '#D4883A',
  warningMuted: 'rgba(212,136,58,0.15)',
  success: '#4CAF6E',
  successMuted: 'rgba(76,175,110,0.15)',
  textPrimary: '#1A2E1A',
  textSecondary: '#4A5D4A',
  textMuted: '#7D947D',
  skeletonBase: '#DCEBDB',
  skeletonHighlight: '#EDF4E9',
};

export interface ConservationStatus {
  status: string;
  status_name?: string;
}

export interface TaxonResult {
  id: number;
  name: string;
  preferred_common_name?: string;
  rank: string;
  iconic_taxon_name?: string;
  default_photo?: { medium_url: string };
  conservation_status?: ConservationStatus;
  establishment_means?: any;

  ancestry?: string;
  ancestor_ids?: number[];
  wikipedia_summary?: string;
  order?: string;
  family?: string;
  kingdom?: string;
}

export interface SpeciesCountResult {
  count?: number; // count is optional because v2/taxa/${id} doesn't return count directly like species_counts does.
  taxon?: TaxonResult;
  // If we fetch from v2/taxa/${id}, the result is directly a TaxonResult in the results array
}

export interface SpeciesDisplay {
  id: number;
  commonName: string;
  scientificName: string;
  rank: string;
  count: number;
  photoUrl?: string;
  isInvasive: boolean;
  conservationStatus?: string;
  conservationLabel?: string;
  isNative: boolean;
  order?: string;
  family?: string;
  kingdom?: string;
  taxonSummary?: string;
}

export function getConservationLabel(code: string): string {
  const map: Record<string, string> = {
    CR: 'En Peligro Crítico (CR)',
    EN: 'En Peligro (EN)',
    VU: 'Vulnerable (VU)',
    NT: 'Casi Amenazada (NT)',
    LC: 'Preocupación Menor (LC)',
    DD: 'Datos Insuficientes (DD)',
    EX: 'Extinta (EX)',
    EW: 'Extinta en Vida Silvestre (EW)',
  };
  return map[code.toUpperCase()] ?? code;
}

export function mapSpeciesResult(result: SpeciesCountResult | TaxonResult, countOverride?: number): SpeciesDisplay {
  // Maneja tanto el objeto de species_counts ({ count, taxon }) como el objeto taxon directo
  let taxon: TaxonResult;
  let count = countOverride ?? 0;

  if ('taxon' in result && result.taxon) {
    taxon = result.taxon;
    count = result.count ?? count;
  } else {
    taxon = result as TaxonResult;
  }

  let establishment = '';
  if (typeof taxon.establishment_means === 'string') {
    establishment = taxon.establishment_means.toLowerCase();
  } else if (taxon.establishment_means && typeof taxon.establishment_means.establishment_means === 'string') {
    establishment = taxon.establishment_means.establishment_means.toLowerCase();
  }

  const conservCode = taxon.conservation_status?.status?.toUpperCase();

  return {
    id: taxon.id,
    commonName: taxon.preferred_common_name ?? taxon.name,
    scientificName: taxon.name,
    rank: taxon.rank,
    count,
    photoUrl: taxon.default_photo?.medium_url,
    isInvasive: establishment === 'introduced',
    conservationStatus: conservCode,
    conservationLabel: conservCode ? getConservationLabel(conservCode) : undefined,
    isNative: establishment === 'native',
    kingdom: taxon.iconic_taxon_name ?? taxon.kingdom,
    taxonSummary: taxon.wikipedia_summary,
  };
}

export const fetchWikiDescription = async (scientificName: string) => {
  try {
    const wikiUrl = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      scientificName
    )}`;
    const wikiRes = await fetch(wikiUrl);
    if (wikiRes.ok) {
      const wikiJson = await wikiRes.json();
      return wikiJson.extract as string;
    }
  } catch (e) {
    console.warn('Wikipedia fetch failed:', e);
  }
  return null;
};
