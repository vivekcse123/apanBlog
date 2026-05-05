import {
  Component, OnInit, inject, signal, computed, DestroyRef, PLATFORM_ID, HostListener
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostService } from '../../../post/services/post-service';
import { PostCache } from '../../../post/services/post-cache';
import { UserService } from '../../../user/services/user-service';
import { Post } from '../../../../core/models/post.model';
import { User } from '../../../user/models/user.mode';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago-pipe';

@Component({
  selector: 'app-author-page',
  standalone: true,
  imports: [RouterLink, CommonModule, DatePipe, TimeAgoPipe],
  templateUrl: './author-page.html',
  styleUrl: './author-page.css',
})
export class AuthorPage implements OnInit {
  private route       = inject(ActivatedRoute);
  private router      = inject(Router);
  private postService = inject(PostService);
  private postCache   = inject(PostCache);
  private userService = inject(UserService);
  private destroyRef  = inject(DestroyRef);
  private platformId  = inject(PLATFORM_ID);
  private meta        = inject(Meta);
  private titleSvc    = inject(Title);
  private document    = inject(DOCUMENT);

  author    = signal<User | null>(null);
  allPosts  = signal<Post[]>([]);
  isLoading = signal(true);
  notFound  = signal(false);

  posts = computed(() =>
    this.allPosts()
      .filter(p => {
        const uid = (p.user as any)?._id ?? p.user;
        return p.status === 'published' && uid?.toString() === (this.author() as any)?._id?.toString();
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  );

  totalViews = computed(() => this.posts().reduce((sum, p) => sum + (p.views ?? 0), 0));
  totalLikes = computed(() => this.posts().reduce((sum, p) => sum + (p.likesCount ?? 0), 0));

  get authorName(): string    { return (this.author() as any)?.name     ?? 'Anonymous'; }
  get authorInitial(): string { return this.authorName.charAt(0).toUpperCase(); }
  get authorAvatar(): string  { return (this.author() as any)?.avatar   ?? ''; }
  get authorBio(): string     { return (this.author() as any)?.bio      ?? ''; }
  get joinedDate(): string    { return (this.author() as any)?.createdAt ?? ''; }

  currentYear = new Date().getFullYear();

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = params.get('id');
      if (!id) { this.router.navigate(['/']); return; }

      this.isLoading.set(true);
      this.notFound.set(false);
      this.author.set(null);
      this.allPosts.set([]);

      this.userService.getUserById(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (res) => {
            const user = res.data;
            if (!user) { this.notFound.set(true); this.isLoading.set(false); return; }
            this.author.set(user);
            this.setMeta(user);
            this.loadPosts();
          },
          error: () => { this.notFound.set(true); this.isLoading.set(false); },
        });
    });
  }

  private loadPosts(): void {
    const cached = this.postCache.get();
    if (cached?.length) {
      this.allPosts.set(cached as unknown as Post[]);
      this.isLoading.set(false);
      return;
    }
    this.postService.getAllPost(1, 500).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        const posts = res.data ?? [];
        if (posts.length) this.postCache.set(posts.map((p: Post) => ({ ...p, _ts: Date.now() })));
        this.allPosts.set(posts);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  private setMeta(user: User): void {
    const name = (user as any).name ?? 'Author';
    const bio  = (user as any).bio  ?? `Read all blogs by ${name} on ApnaInsights.`;
    const url  = `https://apnainsights.com/author/${(user as any)._id}`;

    this.titleSvc.setTitle(`${name} — Author | ApnaInsights`);
    this.meta.updateTag({ name: 'description',        content: bio });
    this.meta.updateTag({ name: 'robots',             content: 'index, follow' });
    this.meta.updateTag({ property: 'og:title',       content: `${name} — Author | ApnaInsights` });
    this.meta.updateTag({ property: 'og:description', content: bio });
    this.meta.updateTag({ property: 'og:url',         content: url });
    this.meta.updateTag({ property: 'og:type',        content: 'profile' });

    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name,
      url,
      description: bio,
      worksFor: { '@type': 'Organization', name: 'ApnaInsights', url: 'https://apnainsights.com' },
    };
    let el = this.document.getElementById('author-schema');
    if (!el) {
      el = this.document.createElement('script');
      el.id = 'author-schema';
      (el as HTMLScriptElement).type = 'application/ld+json';
      this.document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(schema);
  }

  navigateToBlog(post: Post): void {
    this.router.navigate(['/blog', (post as any).slug || post._id]);
    if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  readingTime(content: string): number {
    return Math.max(1, Math.ceil(content.replace(/<[^>]*>/g, '').trim().split(/\s+/).length / 200));
  }
}
