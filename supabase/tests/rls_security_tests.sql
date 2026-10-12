-- ==============================================================================
-- SPOTLY · PRUEBAS DE PERMISOS (RLS, privilegios por columna y guardas de servidor)
-- ==============================================================================
-- Cómo usarlo: copia este archivo completo en Supabase → SQL Editor y ejecútalo
-- DESPUÉS de supabase/reset-and-setup.sql.
--
-- No deja rastros: crea usuarios y datos de prueba, ejecuta cada operación con el
-- rol correspondiente (anon / authenticated / admin) y al final lanza un error a
-- propósito para que Postgres REVIERTA TODO. El resultado aparece como mensaje de
-- error con el detalle de cada prueba ("OK" o "FALLA"). Si ves "28 OK, 0 FALLA",
-- todas las pruebas pasaron.
--
-- Limitación: la concurrencia real de dos sesiones no se puede simular en un solo
-- script; se prueba el límite de usos del descuento y la exclusión de horarios en
-- secuencia (la atomicidad la garantizan el UPDATE con bloqueo de fila y la
-- restricción EXCLUDE de la base).
-- ==============================================================================

CREATE SCHEMA spotly_rls_test;
GRANT USAGE ON SCHEMA spotly_rls_test TO anon, authenticated;

-- Cambia el rol y la identidad JWT simulada de la transacción.
CREATE FUNCTION spotly_rls_test.become(p_uid UUID, p_role TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role, 'email', 'rls-test@spotly.test')::text,
    true
  );
  EXECUTE format('SET LOCAL ROLE %I', p_role);
END;
$$;

CREATE FUNCTION spotly_rls_test.restore()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

-- Ejecuta p_sql y espera que falle con el SQLSTATE indicado.
CREATE FUNCTION spotly_rls_test.expect_error(p_name TEXT, p_sql TEXT, p_state TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = p_state THEN
      RETURN 'OK     ' || p_name;
    END IF;
    RETURN 'FALLA  ' || p_name || ' → error ' || SQLSTATE || ' (se esperaba ' || p_state || '): ' || SQLERRM;
  END;
  RETURN 'FALLA  ' || p_name || ' → la operación se permitió (se esperaba error ' || p_state || ')';
END;
$$;

-- Ejecuta p_sql y espera que funcione.
CREATE FUNCTION spotly_rls_test.expect_ok(p_name TEXT, p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'OK     ' || p_name;
EXCEPTION WHEN OTHERS THEN
  RETURN 'FALLA  ' || p_name || ' → ' || SQLSTATE || ': ' || SQLERRM;
END;
$$;

-- Ejecuta una consulta que devuelve un número y lo compara.
CREATE FUNCTION spotly_rls_test.expect_count(p_name TEXT, p_sql TEXT, p_expected BIGINT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v BIGINT;
BEGIN
  EXECUTE p_sql INTO v;
  IF v = p_expected THEN
    RETURN 'OK     ' || p_name;
  END IF;
  RETURN 'FALLA  ' || p_name || ' → se obtuvo ' || v || ', se esperaba ' || p_expected;
EXCEPTION WHEN OTHERS THEN
  RETURN 'FALLA  ' || p_name || ' → ' || SQLSTATE || ': ' || SQLERRM;
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA spotly_rls_test TO anon, authenticated;

DO $test$
DECLARE
  v_owner UUID := gen_random_uuid();
  v_tenant UUID := gen_random_uuid();
  v_other UUID := gen_random_uuid();
  v_admin UUID := gen_random_uuid();
  v_space TEXT;
  v_res TEXT;
  v_day DATE := public.chile_today() + 5;
  v_lines TEXT[] := ARRAY[]::TEXT[];
  v_line TEXT;
  v_ok INT := 0;
  v_fail INT := 0;
  v_insert_tpl TEXT;
BEGIN
  -- --------------------------------------------------------------------------
  -- Datos de prueba (como postgres)
  -- --------------------------------------------------------------------------
  INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role) VALUES
    (v_owner,  'rls-owner@spotly.test',  '{"full_name":"Propietario Prueba","rut":"90.000.001-1","role":"owner","owner_terms_accepted":true}', 'authenticated', 'authenticated'),
    (v_tenant, 'rls-tenant@spotly.test', '{"full_name":"Arrendatario Prueba","rut":"90.000.002-2"}', 'authenticated', 'authenticated'),
    (v_other,  'rls-other@spotly.test',  '{"full_name":"Otro Arrendatario","rut":"90.000.003-3"}', 'authenticated', 'authenticated'),
    (v_admin,  'rls-admin@spotly.test',  '{"full_name":"Admin Prueba","rut":"90.000.004-4"}', 'authenticated', 'authenticated');

  UPDATE public.profiles SET verification_status = 'verified' WHERE id IN (v_owner, v_tenant, v_other);
  UPDATE public.profiles SET role = 'admin' WHERE id = v_admin;

  INSERT INTO public.spaces (owner_id, owner_name, owner_rut, title, category, commune, region, address,
                             price_per_day, security_deposit, status, is_verified)
  VALUES (v_owner, 'Propietario Prueba', '90.000.001-1', 'Sala RLS', 'office', 'Providencia', 'Metropolitana',
          'Calle Privada 123', 100000, 50000, 'active', true)
  RETURNING id INTO v_space;

  INSERT INTO public.discount_codes (code, percent_off, max_uses) VALUES ('RLSUNO', 10, 1);

  -- Plantilla de inserción de reserva de 1 día (subtotal 100.000 + 5 % + garantía 50.000).
  v_insert_tpl := 'INSERT INTO public.reservations (space_id, space_title, tenant_id, tenant_name, tenant_email,
      tenant_rut, owner_id, owner_name, start_date, end_date, total_days, daily_rate_clp, price_unit,
      subtotal_clp, platform_fee_clp, security_deposit_clp, total_clp, intended_use, discount_code)
    VALUES (%L, ''Sala RLS'', %L, ''Prueba'', ''t@spotly.test'', ''1-9'', %L, ''x'', %L, %L, 1, 100000, ''day'',
            100000, 5000, 50000, %s, ''Reunión'', %L)';

  -- --------------------------------------------------------------------------
  -- 1. Visitante anónimo
  -- --------------------------------------------------------------------------
  PERFORM spotly_rls_test.become(NULL, 'anon');
  v_lines := v_lines || spotly_rls_test.expect_count('T01 anon ve las columnas públicas del espacio activo',
    format('SELECT count(*) FROM public.spaces WHERE id = %L', v_space), 1);
  v_lines := v_lines || spotly_rls_test.expect_error('T02 anon no puede leer owner_rut',
    'SELECT owner_rut FROM public.spaces LIMIT 1', '42501');
  v_lines := v_lines || spotly_rls_test.expect_error('T03 anon no puede leer la dirección exacta',
    'SELECT address FROM public.spaces LIMIT 1', '42501');
  v_lines := v_lines || spotly_rls_test.expect_error('T04 anon no puede consultar el estado de bloqueo de cuentas',
    'SELECT public.login_lock_status(''rls-tenant@spotly.test'', ''1.1.1.1'')', '42501');
  v_lines := v_lines || spotly_rls_test.expect_error('T05 anon no puede registrar intentos fallidos (bloquear cuentas ajenas)',
    'SELECT public.register_failed_login(''rls-tenant@spotly.test'', ''1.1.1.1'')', '42501');
  v_lines := v_lines || spotly_rls_test.expect_error('T06 no existe consulta pública de existencia de RUT',
    'SELECT public.rut_available(''90.000.002-2'')', '42883');
  v_lines := v_lines || spotly_rls_test.expect_error('T07 anon no puede leer intentos de acceso',
    'SELECT count(*) FROM public.login_attempts', '42501');
  v_lines := v_lines || spotly_rls_test.expect_error('T08 anon no puede leer pagos',
    'SELECT count(*) FROM public.payments', '42501');
  v_lines := v_lines || spotly_rls_test.expect_error('T09 anon no puede obtener datos privados de espacios',
    'SELECT count(*) FROM public.get_spaces_private_details()', '42501');
  PERFORM spotly_rls_test.restore();

  -- --------------------------------------------------------------------------
  -- 2. Bitácora de auditoría
  -- --------------------------------------------------------------------------
  PERFORM spotly_rls_test.become(v_tenant, 'authenticated');
  v_lines := v_lines || spotly_rls_test.expect_error('T10 usuario autenticado no puede insertar en audit_logs',
    format('INSERT INTO public.audit_logs (action, user_id, user_email, user_role, severity) VALUES (''FALSO'', %L, ''x'', ''tenant'', ''info'')', v_tenant),
    '42501');
  v_lines := v_lines || spotly_rls_test.expect_error('T11 usuario autenticado no puede modificar audit_logs',
    'UPDATE public.audit_logs SET action = ''X''', '42501');
  v_lines := v_lines || spotly_rls_test.expect_error('T12 usuario autenticado no puede usar write_audit',
    format('SELECT public.write_audit(''FALSO'', ''info'', %L, ''{}''::jsonb)', v_tenant), '42501');
  PERFORM spotly_rls_test.restore();

  PERFORM spotly_rls_test.become(v_admin, 'authenticated');
  v_lines := v_lines || spotly_rls_test.expect_error('T13 ni un administrador puede borrar audit_logs desde la app',
    'DELETE FROM public.audit_logs', '42501');
  PERFORM spotly_rls_test.restore();
  v_lines := v_lines || spotly_rls_test.expect_error('T14 la bitácora rechaza UPDATE incluso con permisos de dueño',
    'UPDATE public.audit_logs SET action = action', 'P0001');

  -- --------------------------------------------------------------------------
  -- 3. Reservas: creación, sobreventa e inmutabilidad
  -- --------------------------------------------------------------------------
  PERFORM spotly_rls_test.become(v_tenant, 'authenticated');
  BEGIN
    EXECUTE format(v_insert_tpl, v_space, v_tenant, v_owner, v_day, v_day, 155000, NULL) || ' RETURNING id' INTO v_res;
    v_lines := v_lines || 'OK     T15 arrendatario verificado crea una reserva con montos correctos'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    v_lines := v_lines || ('FALLA  T15 arrendatario verificado crea una reserva → ' || SQLSTATE || ': ' || SQLERRM);
  END;
  v_lines := v_lines || spotly_rls_test.expect_error('T16 la base rechaza montos manipulados',
    format(v_insert_tpl, v_space, v_tenant, v_owner, v_day + 1, v_day + 1, 1000, NULL), 'P0001');
  v_lines := v_lines || spotly_rls_test.expect_error('T17 el arrendatario no puede cambiar el total de su reserva',
    format('UPDATE public.reservations SET total_clp = 1 WHERE id = %L', v_res), 'P0001');
  v_lines := v_lines || spotly_rls_test.expect_error('T18 el arrendatario no puede autoconfirmar su reserva',
    format('UPDATE public.reservations SET status = ''confirmed'' WHERE id = %L', v_res), 'P0001');
  v_lines := v_lines || spotly_rls_test.expect_error('T19 el arrendatario no puede marcar su reserva como pagada',
    format('UPDATE public.reservations SET payment_status = ''paid'' WHERE id = %L', v_res), 'P0001');
  v_lines := v_lines || spotly_rls_test.expect_count('T20 quien reservó obtiene RUT y dirección del espacio',
    format('SELECT count(*) FROM public.get_spaces_private_details() WHERE space_id = %L AND address = ''Calle Privada 123''', v_space), 1);
  v_lines := v_lines || spotly_rls_test.expect_error('T21 el arrendatario no puede suspender cuentas',
    format('SELECT public.admin_set_user_suspension(%L, true, ''x'')', v_other), 'P0001');
  v_lines := v_lines || spotly_rls_test.expect_error('T22 el arrendatario no puede ver KPI',
    'SELECT public.admin_kpis(30)', 'P0001');
  PERFORM spotly_rls_test.restore();

  PERFORM spotly_rls_test.become(v_other, 'authenticated');
  v_lines := v_lines || spotly_rls_test.expect_error('T23 un segundo arrendatario no puede reservar el mismo horario (sobreventa)',
    format(v_insert_tpl, v_space, v_other, v_owner, v_day, v_day, 155000, NULL), '23P01');
  v_lines := v_lines || spotly_rls_test.expect_count('T24 un tercero no ve la reserva ajena',
    format('SELECT count(*) FROM public.reservations WHERE id = %L', v_res), 0);
  v_lines := v_lines || spotly_rls_test.expect_count('T25 un tercero sin reserva no obtiene los datos privados del espacio',
    format('SELECT count(*) FROM public.get_spaces_private_details() WHERE space_id = %L', v_space), 0);

  -- --------------------------------------------------------------------------
  -- 4. Código de descuento con un solo cupo
  -- --------------------------------------------------------------------------
  v_lines := v_lines || spotly_rls_test.expect_ok('T26 el primer uso del código con 1 cupo se acepta',
    format(v_insert_tpl, v_space, v_other, v_owner, v_day + 2, v_day + 2, 145000, 'RLSUNO'));
  PERFORM spotly_rls_test.restore();

  PERFORM spotly_rls_test.become(v_tenant, 'authenticated');
  v_lines := v_lines || spotly_rls_test.expect_error('T27 el segundo uso del mismo código se rechaza (cupo agotado)',
    format(v_insert_tpl, v_space, v_tenant, v_owner, v_day + 4, v_day + 4, 145000, 'RLSUNO'), 'P0001');
  PERFORM spotly_rls_test.restore();

  -- --------------------------------------------------------------------------
  -- 5. Administración
  -- --------------------------------------------------------------------------
  PERFORM spotly_rls_test.become(v_admin, 'authenticated');
  v_lines := v_lines || spotly_rls_test.expect_ok('T28 el administrador obtiene los KPI',
    'SELECT public.admin_kpis(30)');
  PERFORM spotly_rls_test.restore();

  -- --------------------------------------------------------------------------
  -- Resumen y reversión total
  -- --------------------------------------------------------------------------
  FOREACH v_line IN ARRAY v_lines LOOP
    IF v_line LIKE 'OK%' THEN v_ok := v_ok + 1; ELSE v_fail := v_fail + 1; END IF;
  END LOOP;

  RAISE EXCEPTION E'RESULTADO DE PRUEBAS: % OK, % FALLA (todo fue revertido; este error es intencional)\n%',
    v_ok, v_fail, array_to_string(v_lines, E'\n');
END;
$test$;
