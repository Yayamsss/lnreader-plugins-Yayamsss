import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

class NovelArchivePlugin implements Plugin.PluginBase {
  id = 'novelarchive-cc';
  name = 'NovelArchive';
  icon = 'src/en/novelarchivecc/icon.png';
  site = 'https://novelarchive.cc';
  version = '1.0.0';

  apiUrl = 'https://novelarchive.cc/api';

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: 'https://novelarchive.cc',
    },
  };

  filters = {
    sort: {
      label: 'Sort By',
      options: [
        { label: 'Recent',        value: 'recent'   },
        { label: 'Popular',       value: 'popular'  },
        { label: 'Top Rated',     value: 'rating'   },
        { label: 'Most Chapters', value: 'chapters' },
      ],
      type: FilterTypes.Picker,
      value: 'recent',
    },
    status: {
      label: 'Status',
      options: [
        { label: 'All',       value: 'all'       },
        { label: 'Ongoing',   value: 'ongoing'   },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus',    value: 'hiatus'    },
      ],
      type: FilterTypes.Picker,
      value: 'all',
    },
  } satisfies Filters;

  resolveCover(id: string): string {
    return `${this.apiUrl}/novels/${id}/cover?w=640&q=72&format=webp`;
  }

  resolveStatus(raw?: string): string {
    switch (raw?.toLowerCase()) {
      case 'ongoing':   return NovelStatus.Ongoing;
      case 'completed': return NovelStatus.Completed;
      case 'hiatus':    return NovelStatus.OnHiatus;
      default:          return NovelStatus.Unknown;
    }
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels, filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      page:     String(pageNo),
      per_page: '24',
      sort:     showLatestNovels ? 'recent' : (filters?.sort?.value ?? 'recent'),
      status:   filters?.status?.value ?? 'all',
    });

    const res = await fetchApi(`${this.apiUrl}/novels?${params}`);
    if (!res.ok) throw new Error(`NovelArchive: HTTP ${res.status}`);
    const data = await res.json();
    const list: Plugin.NovelItem[] = [];

    for (const n of data?.novels ?? []) {
      if (!n.id) continue;
      list.push({
        name:  n.title ?? 'Unknown',
        path:  n.id,
        cover: this.resolveCover(n.id),
      });
    }
    return list;
  }

  async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      page:     String(pageNo),
      per_page: '24',
      search:   searchTerm,
    });

    const res = await fetchApi(`${this.apiUrl}/novels?${params}`);
    if (!res.ok) throw new Error(`NovelArchive: HTTP ${res.status}`);
    const data = await res.json();
    const list: Plugin.NovelItem[] = [];

    for (const n of data?.novels ?? []) {
      if (!n.id) continue;
      list.push({
        name:  n.title ?? 'Unknown',
        path:  n.id,
        cover: this.resolveCover(n.id),
      });
    }
    return list;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const res = await fetchApi(`${this.apiUrl}/novels/${novelPath}`);
    if (!res.ok) throw new Error(`NovelArchive: HTTP ${res.status}`);
    const data = await res.json();

    const n = data?.novel ?? {};
    const chapterNames: string[] = data?.chapter_names ?? [];

    const chapters: Plugin.ChapterItem[] = chapterNames.map(
      (chName: string, i: number) => ({
        name:          chName || `Chapter ${i + 1}`,
        path:          `${novelPath}/chapters/${i + 1}`,
        chapterNumber: i + 1,
      }),
    );

    return {
      path:    novelPath,
      name:    n.title       ?? 'Untitled',
      author:  n.author      ?? '',
      cover:   this.resolveCover(novelPath),
      genres:  n.genres      ?? '',
      status:  this.resolveStatus(n.release_status),
      summary: n.description ?? '',
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    // chapterPath = "<novelId>/chapters/<number>"
    const res = await fetchApi(`${this.apiUrl}/novels/${chapterPath}`);
    if (!res.ok) throw new Error(`NovelArchive: HTTP ${res.status}`);
    const data = await res.json();

    const content: string = data?.chapter?.content ?? '';
    if (!content) return '<p>Chapter content not available.</p>';

    return content
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .map((line: string) => `<p>${line}</p>`)
      .join('\n');
  }

  resolveUrl = (path: string, isNovel?: boolean): string => {
    if (isNovel) return `${this.site}/novel?id=${path}`;
    const parts = path.split('/chapters/');
    return `${this.site}/reader?novel=${parts[0]}&chapter=${parts[1]}`;
  };
}

export default new NovelArchivePlugin();
