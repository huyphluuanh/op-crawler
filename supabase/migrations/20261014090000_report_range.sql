-- Dữ liệu cho web báo cáo: lọc theo khoảng ngày [p_from, p_to) và fanpage (tên chính xác).
-- Ngày của lượt nhắc = thời điểm bài/bình luận được đăng (nếu không có thì lúc crawl).
-- Chạy lại nhiều lần vẫn an toàn.

create or replace function public.report_range(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_page text default null
)
returns json
language sql stable
set search_path = public
as $$
  with m as (
    select * from mentions
    where (p_page is null or page_name = p_page)
      and (p_from is null or coalesce(mentioned_at, created_at) >= p_from)
      and (p_to is null or coalesce(mentioned_at, created_at) < p_to)
  ),
  p as (
    select * from posts
    where (p_page is null or page_name = p_page)
      and (p_from is null or coalesce(posted_at, crawled_at) >= p_from)
      and (p_to is null or coalesce(posted_at, crawled_at) < p_to)
  ),
  c as (
    select c.* from comments c
    left join posts pp on pp.post_key = c.post_key
    where (p_page is null or pp.page_name = p_page)
      and (p_from is null or coalesce(c.commented_at, c.crawled_at) >= p_from)
      and (p_to is null or coalesce(c.commented_at, c.crawled_at) < p_to)
  )
  select json_build_object(
    'models', coalesce((
      select json_agg(r order by r.total desc, r.model)
      from (
        select brand, model,
               count(*) filter (where source = 'post') as post_mentions,
               count(*) filter (where source = 'comment') as comment_mentions,
               count(*) as total
        from m group by brand, model
      ) r
    ), '[]'::json),
    'scope', json_build_object(
      'posts', (select count(*) from p),
      'comments', (select count(*) from c),
      'pages', (select count(distinct coalesce(page_url, page_name)) from p)
    ),
    'pages', coalesce((
      select json_agg(x order by x) from (select distinct page_name as x from posts where page_name is not null) s
    ), '[]'::json),
    'data_range', json_build_object(
      'min', (select min(coalesce(mentioned_at, created_at)) from mentions),
      'max', (select max(coalesce(mentioned_at, created_at)) from mentions)
    ),
    'last_crawl', (select max(finished_at) from jobs where status = 'done')
  )
$$;

revoke all on function public.report_range(timestamptz, timestamptz, text) from public, anon, authenticated;
