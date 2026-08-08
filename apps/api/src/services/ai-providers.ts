import type {
  ValuationAiProtocol,
  ValuationConfidence,
  ValuationEvidence,
  ValuationForecastSegment,
  ValuationOutboundSummary,
} from '@thingcost/contracts';

import type { SearchResultItem } from './search-providers.js';

export interface AiValuationDraft {
  lowMinor: string;
  midMinor: string;
  highMinor: string;
  confidence: ValuationConfidence;
  summary: string;
  evidence: ValuationEvidence[];
  forecasts: ValuationForecastSegment[];
  provider: string;
  protocol: ValuationAiProtocol;
  model: string;
}

export interface AiProvider {
  readonly name: string;
  readonly protocol: ValuationAiProtocol;
  readonly model: string;
  generateValuation(input: {
    outboundSummary: ValuationOutboundSummary;
    searchResults: SearchResultItem[];
  }): Promise<AiValuationDraft>;
}

export class AiProviderError extends Error {
  constructor(
    readonly code: 'NOT_CONFIGURED' | 'REQUEST_FAILED' | 'INVALID_RESPONSE',
    message: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

const structuredReportJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'lowMinor',
    'midMinor',
    'highMinor',
    'confidence',
    'summary',
    'evidence',
    'forecasts',
  ],
  properties: {
    lowMinor: { type: 'string', pattern: '^(0|[1-9]\\d*)$' },
    midMinor: { type: 'string', pattern: '^(0|[1-9]\\d*)$' },
    highMinor: { type: 'string', pattern: '^(0|[1-9]\\d*)$' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    summary: { type: 'string' },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'sourceKind'],
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          snippet: { type: 'string' },
          observedPriceMinor: { type: 'string' },
          currency: { type: 'string' },
          observedOn: { type: 'string' },
          sourceKind: {
            type: 'string',
            enum: ['listing', 'sold', 'retail', 'other'],
          },
        },
      },
    },
    forecasts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['horizonYears', 'lowMinor', 'midMinor', 'highMinor'],
        properties: {
          horizonYears: { type: 'integer', minimum: 1, maximum: 10 },
          lowMinor: { type: 'string' },
          midMinor: { type: 'string' },
          highMinor: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
  },
} as const;

function buildPrompt(
  outboundSummary: ValuationOutboundSummary,
  searchResults: SearchResultItem[],
): string {
  return [
    'You are estimating a fair secondary-market value for a durable consumer item.',
    'Use only the provided public facts and search snippets.',
    'Do not invent private identifiers. Amounts are integer minor currency units.',
    'Return JSON only matching the schema fields.',
    '',
    'Item facts:',
    JSON.stringify(outboundSummary, null, 2),
    '',
    'Search evidence:',
    JSON.stringify(searchResults, null, 2),
  ].join('\n');
}

function parseDraft(
  content: string,
  meta: { provider: string; protocol: ValuationAiProtocol; model: string },
): AiValuationDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Some models wrap JSON in fences.
    const fenced = /```(?:json)?\s*([\s\S]*?)```/u.exec(content);
    if (!fenced?.[1]) {
      throw new AiProviderError('INVALID_RESPONSE', '模型未返回可解析 JSON');
    }
    parsed = JSON.parse(fenced[1]);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new AiProviderError('INVALID_RESPONSE', '模型返回不是对象');
  }

  const row = parsed as Record<string, unknown>;
  const lowMinor =
    typeof row.lowMinor === 'string' || typeof row.lowMinor === 'number'
      ? String(row.lowMinor)
      : '';
  const midMinor =
    typeof row.midMinor === 'string' || typeof row.midMinor === 'number'
      ? String(row.midMinor)
      : '';
  const highMinor =
    typeof row.highMinor === 'string' || typeof row.highMinor === 'number'
      ? String(row.highMinor)
      : '';
  const confidence = row.confidence;
  const summary = typeof row.summary === 'string' ? row.summary.trim() : '';

  if (
    !/^(0|[1-9]\d*)$/u.test(lowMinor) ||
    !/^(0|[1-9]\d*)$/u.test(midMinor) ||
    !/^(0|[1-9]\d*)$/u.test(highMinor)
  ) {
    throw new AiProviderError('INVALID_RESPONSE', '估值金额格式无效');
  }
  if (BigInt(lowMinor) > BigInt(midMinor) || BigInt(midMinor) > BigInt(highMinor)) {
    throw new AiProviderError('INVALID_RESPONSE', '估值区间顺序无效');
  }
  if (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high') {
    throw new AiProviderError('INVALID_RESPONSE', '置信度无效');
  }
  if (!summary) {
    throw new AiProviderError('INVALID_RESPONSE', '缺少估值摘要');
  }

  const evidence = Array.isArray(row.evidence)
    ? row.evidence.flatMap((item) => {
        if (typeof item !== 'object' || item === null) return [];
        const evidenceRow = item as Record<string, unknown>;
        if (typeof evidenceRow.title !== 'string' || !evidenceRow.title.trim()) return [];
        const sourceKind = evidenceRow.sourceKind;
        const kind =
          sourceKind === 'listing' ||
          sourceKind === 'sold' ||
          sourceKind === 'retail' ||
          sourceKind === 'other'
            ? sourceKind
            : ('other' as const);
        const entry: ValuationEvidence = {
          title: evidenceRow.title.trim().slice(0, 300),
          sourceKind: kind,
        };
        if (typeof evidenceRow.url === 'string') entry.url = evidenceRow.url;
        if (typeof evidenceRow.snippet === 'string') {
          entry.snippet = evidenceRow.snippet.slice(0, 1_000);
        }
        if (typeof evidenceRow.observedPriceMinor === 'string') {
          entry.observedPriceMinor = evidenceRow.observedPriceMinor;
        }
        if (typeof evidenceRow.currency === 'string') {
          entry.currency = evidenceRow.currency;
        }
        if (typeof evidenceRow.observedOn === 'string') {
          entry.observedOn = evidenceRow.observedOn;
        }
        return [entry];
      })
    : [];

  const forecasts = Array.isArray(row.forecasts)
    ? row.forecasts.flatMap((item) => {
        if (typeof item !== 'object' || item === null) return [];
        const forecast = item as Record<string, unknown>;
        const horizonYears = Number(forecast.horizonYears);
        if (!Number.isInteger(horizonYears) || horizonYears < 1 || horizonYears > 10) {
          return [];
        }
        const low =
          typeof forecast.lowMinor === 'string' || typeof forecast.lowMinor === 'number'
            ? String(forecast.lowMinor)
            : '';
        const mid =
          typeof forecast.midMinor === 'string' || typeof forecast.midMinor === 'number'
            ? String(forecast.midMinor)
            : '';
        const high =
          typeof forecast.highMinor === 'string' || typeof forecast.highMinor === 'number'
            ? String(forecast.highMinor)
            : '';
        if (![low, mid, high].every((value) => /^(0|[1-9]\d*)$/u.test(value))) return [];
        return [
          {
            horizonYears,
            lowMinor: low,
            midMinor: mid,
            highMinor: high,
            note:
              typeof forecast.note === 'string' ? forecast.note.slice(0, 500) : undefined,
          },
        ];
      })
    : [];

  return {
    lowMinor,
    midMinor,
    highMinor,
    confidence,
    summary: summary.slice(0, 2_000),
    evidence,
    forecasts,
    ...meta,
  };
}

export class ChatCompletionsAiProvider implements AiProvider {
  readonly protocol = 'chat_completions' as const;

  constructor(
    readonly name: string,
    readonly model: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  async generateValuation(input: {
    outboundSummary: ValuationOutboundSummary;
    searchResults: SearchResultItem[];
  }): Promise<AiValuationDraft> {
    const url = `${this.baseUrl.replace(/\/$/u, '')}/chat/completions`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You output only valid JSON for durable-goods secondary market valuation.',
            },
            {
              role: 'user',
              content: `${buildPrompt(input.outboundSummary, input.searchResults)}\n\nJSON schema hint:\n${JSON.stringify(structuredReportJsonSchema)}`,
            },
          ],
        }),
      });
    } catch (error) {
      throw new AiProviderError(
        'REQUEST_FAILED',
        `AI 请求失败：${error instanceof Error ? error.message : '网络错误'}`,
      );
    }

    if (!response.ok) {
      throw new AiProviderError('REQUEST_FAILED', `AI 返回 ${String(response.status)}`);
    }

    const payload: unknown = await response.json();
    let content: string | null = null;
    if (typeof payload === 'object' && payload !== null && 'choices' in payload) {
      const choices = (payload as { choices?: unknown }).choices;
      if (
        Array.isArray(choices) &&
        typeof choices[0] === 'object' &&
        choices[0] !== null
      ) {
        const message = (choices[0] as { message?: unknown }).message;
        if (
          typeof message === 'object' &&
          message !== null &&
          'content' in message &&
          typeof (message as { content?: unknown }).content === 'string'
        ) {
          content = (message as { content: string }).content;
        }
      }
    }

    if (!content) {
      throw new AiProviderError('INVALID_RESPONSE', 'AI 响应缺少 content');
    }

    return parseDraft(content, {
      provider: this.name,
      protocol: this.protocol,
      model: this.model,
    });
  }
}

export class ResponsesAiProvider implements AiProvider {
  readonly protocol = 'responses' as const;

  constructor(
    readonly name: string,
    readonly model: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  async generateValuation(input: {
    outboundSummary: ValuationOutboundSummary;
    searchResults: SearchResultItem[];
  }): Promise<AiValuationDraft> {
    const url = `${this.baseUrl.replace(/\/$/u, '')}/responses`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          input: [
            {
              role: 'system',
              content:
                'You output only valid JSON for durable-goods secondary market valuation.',
            },
            {
              role: 'user',
              content: `${buildPrompt(input.outboundSummary, input.searchResults)}\n\nJSON schema hint:\n${JSON.stringify(structuredReportJsonSchema)}`,
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'valuation_report',
              strict: true,
              schema: structuredReportJsonSchema,
            },
          },
        }),
      });
    } catch (error) {
      throw new AiProviderError(
        'REQUEST_FAILED',
        `AI Responses 请求失败：${error instanceof Error ? error.message : '网络错误'}`,
      );
    }

    if (!response.ok) {
      throw new AiProviderError(
        'REQUEST_FAILED',
        `AI Responses 返回 ${String(response.status)}`,
      );
    }

    const payload: unknown = await response.json();
    const content = extractResponsesText(payload);
    if (!content) {
      throw new AiProviderError('INVALID_RESPONSE', 'AI Responses 响应缺少 output_text');
    }

    return parseDraft(content, {
      provider: this.name,
      protocol: this.protocol,
      model: this.model,
    });
  }
}

function extractResponsesText(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const row = payload as Record<string, unknown>;
  if (typeof row.output_text === 'string' && row.output_text.trim()) {
    return row.output_text;
  }
  if (!Array.isArray(row.output)) return null;
  for (const item of row.output) {
    if (typeof item !== 'object' || item === null) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part !== 'object' || part === null) continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string' && text.trim()) return text;
    }
  }
  return null;
}

export class FixtureAiProvider implements AiProvider {
  readonly name = 'fixture';
  readonly protocol = 'chat_completions' as const;
  readonly model = 'fixture-model';

  generateValuation(input: {
    outboundSummary: ValuationOutboundSummary;
    searchResults: SearchResultItem[];
  }): Promise<AiValuationDraft> {
    const base = input.outboundSummary.baseCurrency === 'CNY' ? 2_500_00 : 250_00;
    return Promise.resolve({
      lowMinor: String(base),
      midMinor: String(base + 30_00),
      highMinor: String(base + 80_00),
      confidence: input.searchResults.length > 0 ? 'medium' : 'low',
      summary: `Fixture valuation for ${input.outboundSummary.name}`,
      evidence: input.searchResults.slice(0, 3).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        sourceKind: 'listing' as const,
      })),
      forecasts: [
        {
          horizonYears: 1,
          lowMinor: String(base - 20_00),
          midMinor: String(base),
          highMinor: String(base + 20_00),
          note: 'Fixture one-year outlook',
        },
      ],
      provider: this.name,
      protocol: this.protocol,
      model: this.model,
    });
  }
}
