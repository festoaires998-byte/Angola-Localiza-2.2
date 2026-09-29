-- Export records are user-owned operational data; anonymous access is not required.
ALTER POLICY "Ver os próprios exports" ON public.exports TO authenticated;
