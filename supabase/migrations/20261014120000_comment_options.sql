-- Lựa chọn khi lấy bình luận: thứ tự (viewOption của Apify) và có lấy bình luận trả lời không.
-- Chạy lại nhiều lần vẫn an toàn.
alter table public.jobs add column if not exists comments_sort text not null default 'RECENT_ACTIVITY';
alter table public.jobs add column if not exists include_replies boolean not null default false;
