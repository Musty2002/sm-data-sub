REVOKE ALL ON FUNCTION public.process_aspfiy_deposit(uuid, text, numeric, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_aspfiy_deposit(uuid, text, numeric, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.process_aspfiy_deposit(uuid, text, numeric, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_aspfiy_deposit(uuid, text, numeric, text, jsonb) TO service_role;