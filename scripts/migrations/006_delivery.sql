-- 006_delivery: did the owner actually get the message?
--
-- Sending can fail for reasons that have nothing to do with us — a
-- recipient the messaging account is not allowed to text, for instance.
-- When it does, the escalation is still valid and still waiting in the
-- inbox, but the product must not claim a text was sent. NULL means the
-- question predates this column.
ALTER TABLE escalations ADD COLUMN delivery TEXT;
