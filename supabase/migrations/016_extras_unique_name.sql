-- One extra per name. The seed scripts match extras by name, but nothing stopped two copies: a re-run or two overlapping
-- runs listed every extra twice (the live site had 8 duplicates until 2026-11-26, the demo 10).
--
-- Stops with a clear message if duplicate names exist: remove them first, keeping the copy that bookings use
-- (booking_extras.extra_id; ON DELETE RESTRICT refuses to delete a used one anyway).
-- Safe to apply before or after the seed change that ships with it, and safe to run twice.
-- Rollback:  alter table extras drop constraint if exists extras_name_key;
do $$
begin
  if exists (select 1 from extras group by name having count(*) > 1) then
    raise exception 'extras has duplicate names; remove the duplicates first (see this file''s header)';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'extras_name_key' and conrelid = 'public.extras'::regclass) then
    alter table extras add constraint extras_name_key unique (name);
  end if;
end $$;
