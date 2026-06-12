import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin'; 
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class NovelArchivePlugin implements Plugin.PluginBase {
  id = 'novelarchive-cc';
  name = 'NovelArchive';
  icon = 'src/en/novelarchivecc/icon.png';
  site = 'https://novelarchive.cc';
  version = '1.0.0';

  private apiUrl = 'https://novelarchive.cc/api';

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: this.site,
    },
  };

  filters = {
    sort: {
      label: 'Sort By',
      options: [
        { label: 'Recent', value: 'recent' },
        { label: 'Popular', value: 'popular' },
        { label: 'Top Rated', value: 'rating' },
        { label: 'Most Chapters', value: 'chapters' },
      ],
      type: FilterTypes.Picker,
      value: 'recent',
    },
    status: {
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus', value: 'hiatus' },
      ],
      type: FilterTypes.Picker,
      value: 'all',
    },
  } satisfies Filters;

  private async safeFetch(url: string): Promise<any> {
    const res = await fetchApi(url);
    if (!res.ok)
      throw new Error(
        `NovelArchive: HTTP ${res.status} — essayez d'ouvrir dans WebView.`,
      );
    return res.json();
  }

  // La cover est servie via /api/novels/<id>/cover
  private resolveCover(id: string): string {
    return `${this.apiUrl}/novels/${id}/cover?w=640&q=72&format=webp`;
  }

  private resolveStatus(raw?: string): string {
    switch (raw?.toLowerCase()) {
      case 'ongoing':   return NovelStatus.Ongoing;
      case 'completed': return NovelStatus.Completed;
      case 'hiatus':    return NovelStatus.OnHiatus;
      default:          return NovelStatus.Unknown;
    }
  }

  // ─── popularNovels ────────────────────────────────────────────────────────
  // Endpoint confirmé : GET /api/novels?page=1&per_page=24
  // Réponse : { novels: [ { id, title, author, genres, total_chapters, ... } ] }

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

    const data = await this.safeFetch(`${this.apiUrl}/novels?${params}`);
    const list: any[] = data?.novels ?? [];

    return list.map(n => ({
      name:  n.title ?? 'Unknown',
      path:  n.id,                       // ex: "6a2b07f54f942c668d6da4aa"
      cover: this.resolveCover(n.id),
    }));
  }

  // ─── searchNovels ─────────────────────────────────────────────────────────
  // Même endpoint avec paramètre search=

  async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      page:     String(pageNo),
      per_page: '24',
      search:   searchTerm,
    });

    const data = await this.safeFetch(`${this.apiUrl}/novels?${params}`);
    const list: any[] = data?.novels ?? [];

    return list.map(n => ({
      name:  n.title ?? 'Unknown',
      path:  n.id,
      cover: this.resolveCover(n.id),
    }));
  }

  // ─── parseNovel ───────────────────────────────────────────────────────────
  // Endpoint confirmé : GET /api/novels/<id>
  // Réponse confirmée :
  //   novel: { id, title, author, genres (string csv), description,
  //            novel_image, cover_url, total_chapters, release_status,
  //            ongoing, updated_at, rating, ... }
  //   chapter_names: string[]   ← tableau de tous les titres de chapitres

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const data = await this.safeFetch(`${this.apiUrl}/novels/${novelPath}`);

    const n = data?.novel ?? {};
    const chapterNames: string[] = data?.chapter_names ?? [];

    const chapters: Plugin.ChapterItem[] = chapterNames.map((name, i) => ({
      name,
      path:          `${novelPath}/chapters/${i + 1}`,
      chapterNumber: i + 1,
    }));

    return {
      path:    novelPath,
      name:    n.title       ?? 'Untitled',
      author:  n.author      ?? '',
      cover:   this.resolveCover(novelPath),
      genres:  n.genres      ?? '',          // déjà une string csv
      status:  this.resolveStatus(n.release_status ?? n.ongoing),
      summary: n.description ?? '',
      chapters,
    };
  }

  // ─── parseChapter ─────────────────────────────────────────────────────────
  // D'après les captures :
  //   - Page URL : reader?novel=<id>&chapter=<number>
  //   - Requête réseau "File: 1" depuis api.js → endpoint : GET /api/novels/<id>/<number>
  //     (le chapitre est inclus dans la réponse de parseNovel mais aussi fetchable seul)
  //   - Réponse confirmée :
  //       chapter: { number, name, content (texte brut \n-séparé) }
  //       navigation: { prev, next }
  //       chapter_names: string[]   (répété)

  async parseChapter(chapterPath: string): Promise<string> {
    // chapterPath = "<novelId>/chapters/<number>"  ex: "6a2b07f54f942c668d6da4aa/chapters/1"
    // Endpoint confirmé : GET /api/novels/<novelId>/chapters/<number>
    const data = await this.safeFetch(`${this.apiUrl}/novels/${chapterPath}`);

    const content: string = data?.chapter?.content ?? '';
    if (!content) return '<p>Chapter content not available.</p>';

    // Le contenu est du texte brut avec \n → on convertit en HTML
    return content
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .map((line: string) => `<p>${line}</p>`)
      .join('\n');
  }

  resolveUrl = (path: string, isNovel?: boolean) => {
    if (isNovel) return `${this.site}/novel?id=${path}`;
    // path = "<novelId>/chapters/<number>"
    const [novelId, , chapterNum] = path.split('/');
    return `${this.site}/reader?novel=${novelId}&chapter=${chapterNum}`;
  };
}

export default new NovelArchivePlugin();
