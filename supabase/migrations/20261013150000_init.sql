-- Lưu kết quả crawl fanpage + các dòng máy được nhắc tới.
-- Chạy lại nhiều lần vẫn an toàn (if not exists / or replace).
-- Chỉ Edge Function (service_role) đọc/ghi: bật RLS, không tạo policy nào → khóa với anon.

create table if not exists public.jobs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  input_urls text[] not null,
  posts_limit int not null default 20,
  comments_per_post int not null default 30,
  status text not null default 'queued'
    check (status in ('queued', 'crawling_posts', 'processing_posts', 'crawling_comments',
                      'processing_comments', 'done', 'failed')),
  error text,
  apify_posts_run text,
  apify_comments_run text,
  post_count int not null default 0,
  comment_count int not null default 0,
  -- Discord: gửi kết quả lại cho đúng người / kênh
  discord_app_id text,
  discord_token text,
  discord_channel_id text,
  discord_user text
);

create table if not exists public.posts (
  post_key text primary key,              -- postId của Facebook (hoặc URL nếu không có)
  url text,
  page_url text,
  page_name text,
  text text,
  posted_at timestamptz,
  likes int,
  comments int,
  shares int,
  job_id bigint references public.jobs(id) on delete set null,
  crawled_at timestamptz not null default now()
);
create index if not exists posts_page_idx on public.posts (page_name);

create table if not exists public.comments (
  comment_key text primary key,
  post_key text references public.posts(post_key) on delete cascade,
  text text,
  author text,
  commented_at timestamptz,
  likes int,
  job_id bigint references public.jobs(id) on delete set null,
  crawled_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_key);

create table if not exists public.mentions (
  id bigint generated always as identity primary key,
  source text not null check (source in ('post', 'comment')),
  source_key text not null,
  post_key text,
  page_name text,
  page_url text,
  brand text not null,
  model text not null,
  matched text,
  mentioned_at timestamptz,
  job_id bigint references public.jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source, source_key, model)
);
create index if not exists mentions_model_idx on public.mentions (model);
create index if not exists mentions_page_idx on public.mentions (page_name);
create index if not exists mentions_time_idx on public.mentions (mentioned_at);

alter table public.jobs enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.mentions enable row level security;

-- Bảng xếp hạng dòng máy. Lọc tùy chọn theo fanpage (tên hoặc URL chứa chuỗi), số ngày, job.
create or replace function public.report_models(
  p_page text default null,
  p_days int default null,
  p_job bigint default null
)
returns table (brand text, model text, post_mentions bigint, comment_mentions bigint, total bigint)
language sql stable
set search_path = public
as $$
  select m.brand, m.model,
         count(*) filter (where m.source = 'post'),
         count(*) filter (where m.source = 'comment'),
         count(*)
  from mentions m
  where (p_page is null or m.page_name ilike '%' || p_page || '%' or m.page_url ilike '%' || p_page || '%')
    and (p_days is null or coalesce(m.mentioned_at, m.created_at) >= now() - make_interval(days => p_days))
    and (p_job is null or m.job_id = p_job)
  group by m.brand, m.model
  order by 5 desc, 4 desc, 2
$$;

-- Tổng quan nguồn dữ liệu cho báo cáo (số bài, số bình luận đã quét, số fanpage).
create or replace function public.report_scope(p_page text default null, p_days int default null)
returns table (pages bigint, posts bigint, comments bigint)
language sql stable
set search_path = public
as $$
  with p as (
    select * from posts
    where (p_page is null or page_name ilike '%' || p_page || '%' or page_url ilike '%' || p_page || '%')
      and (p_days is null or coalesce(posted_at, crawled_at) >= now() - make_interval(days => p_days))
  )
  select (select count(distinct coalesce(page_url, page_name)) from p),
         (select count(*) from p),
         (select count(*) from comments c join p on p.post_key = c.post_key)
$$;

revoke all on function public.report_models(text, int, bigint) from public, anon, authenticated;
revoke all on function public.report_scope(text, int) from public, anon, authenticated;
