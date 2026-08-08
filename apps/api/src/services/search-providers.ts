export interface SearchResultItem {
  title: string;
  url?: string | undefined;
  snippet?: string | undefined;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, options?: { maxResults?: number }): Promise<SearchResultItem[]>;
}

export class SearchProviderError extends Error {
  constructor(
    readonly code: 'NOT_CONFIGURED' | 'REQUEST_FAILED' | 'INVALID_RESPONSE',
    message: string,
  ) {
    super(message);
    this.name = 'SearchProviderError';
  }
}

export class TavilySearchProvider implements SearchProvider {
  readonly name = 'tavily';

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly timeoutMs = 15_000,
  ) {}

  async search(
    query: string,
    options: { maxResults?: number } = {},
  ): Promise<SearchResultItem[]> {
    const maxResults = options.maxResults ?? 6;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/u, '')}/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          search_depth: 'basic',
          include_answer: false,
          max_results: maxResults,
        }),
      });
    } catch (error) {
      throw new SearchProviderError(
        'REQUEST_FAILED',
        `Tavily 请求失败：${error instanceof Error ? error.message : '网络错误'}`,
      );
    }

    if (!response.ok) {
      throw new SearchProviderError(
        'REQUEST_FAILED',
        `Tavily 返回 ${String(response.status)}`,
      );
    }

    const payload: unknown = await response.json();
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('results' in payload) ||
      !Array.isArray(payload.results)
    ) {
      throw new SearchProviderError('INVALID_RESPONSE', 'Tavily 响应格式无效');
    }

    return payload.results.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const row = item as Record<string, unknown>;
      if (typeof row.title !== 'string' || !row.title.trim()) return [];
      const result: SearchResultItem = {
        title: row.title.trim().slice(0, 300),
      };
      if (typeof row.url === 'string') result.url = row.url;
      if (typeof row.content === 'string') {
        result.snippet = row.content.trim().slice(0, 1_000);
      }
      return [result];
    });
  }
}

export class FixtureSearchProvider implements SearchProvider {
  readonly name = 'fixture';

  search(query: string): Promise<SearchResultItem[]> {
    return Promise.resolve([
      {
        title: `${query} second-hand listing`,
        url: 'https://example.com/listing',
        snippet: 'Public second-hand market reference used in tests.',
      },
    ]);
  }
}
