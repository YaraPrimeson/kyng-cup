-- PostgreSQL requires UPDATE privilege to take the tournament draw row lock.
grant update on telegram_demo.cup to service_role;
