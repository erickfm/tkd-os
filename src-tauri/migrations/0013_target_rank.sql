-- Optional override on a testing registration: promote straight to a chosen
-- rank instead of the automatic next rank ("Rank Skip" — also how a Tiger
-- Cub registers to test directly for Black Stripe / early graduation).
-- NULL (the default) keeps the existing automatic-next-rank behavior.
ALTER TABLE testing_registration ADD COLUMN target_rank_id INTEGER REFERENCES belt_ranks(id);
