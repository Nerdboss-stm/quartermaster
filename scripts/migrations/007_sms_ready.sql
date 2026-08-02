-- 007_sms_ready: has this number messaged us yet?
--
-- Linq sandbox will not deliver to a recipient who has not messaged the
-- line first (error 2008, "recipients must message you first"). So texting
-- is something an owner switches on by sending one message, and the
-- product has to know whether they have. 0 means escalations wait in the
-- in-app inbox instead, which is a working product, not a broken one.
ALTER TABLE users ADD COLUMN sms_ready INTEGER NOT NULL DEFAULT 0;

-- The demo account's number has been messaging this line all along.
UPDATE users SET sms_ready = 1 WHERE id = 'usr_demo';
