-- Sửa dữ liệu cũ: tên "fanpage" bị lấy nhầm từ đường dẫn (vd link reel → "reel").
-- Chạy lại nhiều lần vẫn an toàn.
update public.posts set page_name = null, page_url = null
where lower(page_name) in ('reel', 'reels', 'watch', 'share', 'videos', 'photo', 'photos', 'permalink.php', 'story.php', 'groups', 'posts');

update public.mentions set page_name = null, page_url = null
where lower(page_name) in ('reel', 'reels', 'watch', 'share', 'videos', 'photo', 'photos', 'permalink.php', 'story.php', 'groups', 'posts');
