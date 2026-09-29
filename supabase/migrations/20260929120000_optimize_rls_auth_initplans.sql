-- Optimize RLS auth lookups by evaluating auth.uid() once per statement.
ALTER POLICY "delivery_deixa_aqui_insert_own" ON public.delivery_deixa_aqui WITH CHECK ((selected_by = (SELECT auth.uid())) AND EXISTS (SELECT 1 FROM deliveries d WHERE d.id = delivery_deixa_aqui.delivery_id AND d.created_by = (SELECT auth.uid())) AND EXISTS (SELECT 1 FROM deixa_aqui_points p WHERE p.id = delivery_deixa_aqui.point_id AND p.status = 'ACTIVE' AND p.accepts_deliveries = true));
ALTER POLICY "delivery_deixa_aqui_select_own" ON public.delivery_deixa_aqui USING ((selected_by = (SELECT auth.uid())) OR EXISTS (SELECT 1 FROM deliveries d WHERE d.id = delivery_deixa_aqui.delivery_id AND d.created_by = (SELECT auth.uid())));
ALTER POLICY "Administradores vêem candidaturas de motorista" ON public.driver_applications USING (is_admin((SELECT auth.uid())));
ALTER POLICY "Candidato vê a própria candidatura" ON public.driver_applications USING (user_id = (SELECT auth.uid()));
ALTER POLICY "Administradores vêem perfis de motorista" ON public.driver_profiles USING (is_admin((SELECT auth.uid())));
ALTER POLICY "Motorista vê o próprio perfil" ON public.driver_profiles USING (user_id = (SELECT auth.uid()));
ALTER POLICY "user_country_profiles_insert_own" ON public.user_country_profiles WITH CHECK (user_id = (SELECT auth.uid()));
ALTER POLICY "user_country_profiles_select_own" ON public.user_country_profiles USING (user_id = (SELECT auth.uid()));
ALTER POLICY "user_country_profiles_update_own" ON public.user_country_profiles USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
