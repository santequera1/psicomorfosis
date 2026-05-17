-- ────────────────────────────────────────────────────────────────────────────
-- Seed de contenido demo para Dr. Pruebas Demo (workspace_id = 9).
--
-- Para el video demostrativo necesitamos volumen y variedad en la app:
--   - Más cuentas bancarias (mostrar el carousel "Mis cuentas").
--   - Al menos 2 documentos por paciente con tipos variados.
--   - Más recibos distribuidos en el mes con métodos y estados distintos.
--   - Citas 1–3 por día desde 2026-05-17 hasta 2026-05-31.
--
-- Se ejecuta DENTRO de una transacción para que un error a mitad de
-- camino haga rollback. Todos los INSERTs son aditivos (no borran nada).
-- No tocamos workspace_id ≠ 9.
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── BANK ACCOUNTS (3 más) ─────────────────────────────────────────────────
INSERT INTO bank_accounts (workspace_id, bank_id, label, account_type, last4, holder_name, brand, is_default)
VALUES
  (9, 'davivienda', 'Cuenta secundaria', 'ahorros', '7890', 'Dr. Pruebas Demo', 'mastercard', 0),
  (9, 'nequi',      'Nequi consultorio', 'nequi',   '3344', 'Dr. Pruebas Demo', 'none',       0),
  (9, 'bbva',       'Cuenta empresarial', 'corriente', '1122', 'Dr. Pruebas Demo', 'visa',     0);

-- ─── DOCUMENTS (2+ por paciente, tipos variados) ──────────────────────────
-- body_json mínimo viable: heading + párrafo. body_text para búsqueda.
-- Usamos status 'borrador' por default; algunos quedan 'firmado' para que
-- el demo muestre el badge verde.

-- P-9001 Camila Rondón Vélez — +2 docs (informe + evolución)
INSERT INTO documents (id, workspace_id, name, type, kind, patient_id, patient_name, body_json, body_text, status, professional, created_at, updated_at) VALUES
  ('D-9-seed01-a001', 9, 'Informe psicológico inicial · Camila Rondón', 'informe', 'editor', 'P-9001', 'Camila Rondón Vélez',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Informe psicológico inicial"}]},{"type":"paragraph","content":[{"type":"text","text":"Paciente femenina de 34 años, motivo de consulta por sintomatología ansiosa de seis meses de evolución. Refiere preocupación excesiva, tensión muscular, alteraciones del sueño y dificultad para concentrarse en el trabajo."}]},{"type":"paragraph","content":[{"type":"text","text":"Se aplican entrevista clínica semi-estructurada y tamizaje con GAD-7. Resultado: puntaje 14/21 — ansiedad moderada. Sin ideación suicida ni autolesiva. Sin antecedentes psiquiátricos previos."}]},{"type":"paragraph","content":[{"type":"text","text":"Impresión diagnóstica: F41.1 Trastorno de ansiedad generalizada. Plan: psicoterapia cognitivo-conductual con frecuencia semanal, técnicas de relajación y restructuración cognitiva."}]}]}',
   'Informe psicológico inicial. Paciente femenina de 34 años, motivo de consulta por sintomatología ansiosa de seis meses de evolución. GAD-7 14/21 ansiedad moderada. F41.1 Trastorno de ansiedad generalizada.',
   'firmado', 'Dr. Pruebas Demo', '2026-05-10T15:00:00.000Z', '2026-05-10T15:30:00.000Z'),
  ('D-9-seed02-a002', 9, 'Nota de evolución sesión 4 · Camila', 'evolucion', 'editor', 'P-9001', 'Camila Rondón Vélez',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Nota de evolución — sesión 4"}]},{"type":"paragraph","content":[{"type":"text","text":"Paciente acude puntual, vestida acorde. Refiere mejoría subjetiva en sueño (~6h/noche vs 4h al inicio). Aplicación de técnica de respiración 4-7-8 con buena adherencia (5/7 días)."}]},{"type":"paragraph","content":[{"type":"text","text":"Se trabaja registro de pensamientos automáticos en situación laboral. Identifica patrón de catastrofización ante feedback de superior. Se asigna tarea: completar registro durante semana siguiente."}]}]}',
   'Nota de evolución sesión 4. Paciente refiere mejoría subjetiva en sueño. Aplicación de técnica de respiración 4-7-8 con buena adherencia. Trabaja registro de pensamientos automáticos.',
   'borrador', 'Dr. Pruebas Demo', '2026-05-14T16:00:00.000Z', '2026-05-14T16:45:00.000Z');

-- P-9002 Andrés Galeano Suárez — +1 doc (informe parcial)
INSERT INTO documents (id, workspace_id, name, type, kind, patient_id, patient_name, body_json, body_text, status, professional, created_at, updated_at) VALUES
  ('D-9-seed03-a003', 9, 'Informe de progreso · Andrés Galeano', 'informe', 'editor', 'P-9002', 'Andrés Galeano Suárez',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Informe de progreso terapéutico"}]},{"type":"paragraph","content":[{"type":"text","text":"Paciente masculino de 35 años, en proceso terapéutico por episodios depresivos recurrentes. Lleva 8 sesiones de psicoterapia con enfoque cognitivo-conductual."}]},{"type":"paragraph","content":[{"type":"text","text":"Evolución favorable: PHQ-9 inicial 18/27 (depresión moderada-severa), control a 8 semanas: 9/27 (leve). Se observa activación conductual sostenida, retoma actividades placenteras y vínculo social."}]},{"type":"paragraph","content":[{"type":"text","text":"Recomendación: continuar proceso con frecuencia quincenal. Reevaluación en 4 semanas."}]}]}',
   'Informe de progreso terapéutico. Paciente masculino de 35 años. Episodios depresivos recurrentes. PHQ-9 inicial 18/27, control a 8 semanas: 9/27.',
   'firmado', 'Dr. Pruebas Demo', '2026-05-13T18:00:00.000Z', '2026-05-13T18:25:00.000Z');

-- P-9003 Valentina Soto Cárdenas — +2 docs (consentimiento + evolución)
INSERT INTO documents (id, workspace_id, name, type, kind, patient_id, patient_name, body_json, body_text, status, professional, created_at, updated_at) VALUES
  ('D-9-seed04-a004', 9, 'Consentimiento informado para terapia · Valentina', 'consentimiento', 'editor', 'P-9003', 'Valentina Soto Cárdenas',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Consentimiento informado para psicoterapia"}]},{"type":"paragraph","content":[{"type":"text","text":"Yo, Valentina Soto Cárdenas, identificada con cédula de ciudadanía, acepto voluntariamente iniciar proceso psicoterapéutico con el(la) profesional Dr. Pruebas Demo, comprendiendo las características, alcances y limitaciones del mismo."}]},{"type":"paragraph","content":[{"type":"text","text":"He sido informada sobre: confidencialidad y sus excepciones legales (riesgo vital, menores, requerimiento judicial), duración estimada del proceso, derecho a suspender en cualquier momento, costo y forma de pago de las sesiones."}]},{"type":"paragraph","content":[{"type":"text","text":"Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012. Comprendo que la historia clínica se conserva por 15 años según Resolución 1995 de 1999."}]}]}',
   'Consentimiento informado para psicoterapia. Valentina Soto Cárdenas. Confidencialidad y excepciones legales. Ley 1581 de 2012. Resolución 1995 de 1999.',
   'firmado', 'Dr. Pruebas Demo', '2026-05-08T14:00:00.000Z', '2026-05-08T14:20:00.000Z'),
  ('D-9-seed05-a005', 9, 'Nota de evolución sesión 2 · Valentina', 'evolucion', 'editor', 'P-9003', 'Valentina Soto Cárdenas',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Nota de evolución — sesión 2"}]},{"type":"paragraph","content":[{"type":"text","text":"Paciente acude con su pareja a sesión de terapia familiar. Se trabaja patrón de comunicación crítico-defensivo identificado en sesión anterior."}]},{"type":"paragraph","content":[{"type":"text","text":"Se introduce técnica de comunicación con \"Yo\" en primera persona. Ambos practican durante la sesión con escenarios cotidianos. Se asigna tarea conjunta: diario de momentos positivos."}]}]}',
   'Nota de evolución sesión 2. Terapia familiar. Pareja. Comunicación con Yo en primera persona. Diario de momentos positivos.',
   'borrador', 'Dr. Pruebas Demo', '2026-05-15T17:00:00.000Z', '2026-05-15T17:50:00.000Z');

-- P-9004 Laura Restrepo Ruiz — +2 docs (consentimiento + certificado)
INSERT INTO documents (id, workspace_id, name, type, kind, patient_id, patient_name, body_json, body_text, status, professional, created_at, updated_at) VALUES
  ('D-9-seed06-a006', 9, 'Consentimiento informado para psicoterapia · Laura', 'consentimiento', 'editor', 'P-9004', 'Laura Restrepo Ruiz',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Consentimiento informado para psicoterapia"}]},{"type":"paragraph","content":[{"type":"text","text":"Yo, Laura Restrepo Ruiz, acepto voluntariamente iniciar proceso psicoterapéutico con el(la) profesional Dr. Pruebas Demo. He sido informada sobre las características, alcances y limitaciones del proceso, así como sobre la confidencialidad y sus excepciones legales."}]},{"type":"paragraph","content":[{"type":"text","text":"Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012."}]}]}',
   'Consentimiento informado para psicoterapia. Laura Restrepo Ruiz. Ley 1581 de 2012.',
   'firmado', 'Dr. Pruebas Demo', '2026-05-09T11:00:00.000Z', '2026-05-09T11:15:00.000Z'),
  ('D-9-seed07-a007', 9, 'Certificado de asistencia · Laura Restrepo', 'certificado', 'editor', 'P-9004', 'Laura Restrepo Ruiz',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Certificado de asistencia psicológica"}]},{"type":"paragraph","content":[{"type":"text","text":"El(la) suscrito(a) Dr. Pruebas Demo, psicólogo(a) clínico(a), certifica que la señora Laura Restrepo Ruiz, identificada con cédula de ciudadanía, asiste regularmente a proceso psicoterapéutico desde el 1 de marzo de 2026, con frecuencia semanal."}]},{"type":"paragraph","content":[{"type":"text","text":"El presente certificado se expide a solicitud de la interesada para los fines pertinentes ante su empleador. No constituye diagnóstico ni emite juicio sobre capacidad laboral."}]}]}',
   'Certificado de asistencia psicológica. Laura Restrepo Ruiz. Asistencia regular desde el 1 de marzo de 2026.',
   'firmado', 'Dr. Pruebas Demo', '2026-05-12T10:00:00.000Z', '2026-05-12T10:10:00.000Z');

-- P-9005 Carlos Mendoza Pérez — +2 docs (consentimiento + remisión)
INSERT INTO documents (id, workspace_id, name, type, kind, patient_id, patient_name, body_json, body_text, status, professional, created_at, updated_at) VALUES
  ('D-9-seed08-a008', 9, 'Consentimiento informado · Carlos Mendoza', 'consentimiento', 'editor', 'P-9005', 'Carlos Mendoza Pérez',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Consentimiento informado para psicoterapia"}]},{"type":"paragraph","content":[{"type":"text","text":"Yo, Carlos Mendoza Pérez, identificado con cédula de ciudadanía, acepto voluntariamente iniciar proceso psicoterapéutico. He sido informado sobre las características del proceso, la confidencialidad y sus excepciones."}]},{"type":"paragraph","content":[{"type":"text","text":"Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012."}]}]}',
   'Consentimiento informado. Carlos Mendoza Pérez. Ley 1581 de 2012.',
   'firmado', 'Dr. Pruebas Demo', '2026-05-06T16:00:00.000Z', '2026-05-06T16:15:00.000Z'),
  ('D-9-seed09-a009', 9, 'Remisión a psiquiatría · Carlos Mendoza', 'remision', 'editor', 'P-9005', 'Carlos Mendoza Pérez',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Remisión interdisciplinar a psiquiatría"}]},{"type":"paragraph","content":[{"type":"text","text":"Por la presente se remite al señor Carlos Mendoza Pérez, identificado con cédula de ciudadanía, a evaluación por psiquiatría para valoración farmacológica complementaria al proceso psicoterapéutico en curso."}]},{"type":"paragraph","content":[{"type":"text","text":"Motivo: sintomatología depresiva con componente de anhedonia persistente que limita activación conductual. Se considera que la coadyuvancia farmacológica podría potenciar la respuesta terapéutica."}]},{"type":"paragraph","content":[{"type":"text","text":"Resumen del proceso: ingresó el 15 de febrero de 2026. 12 sesiones de TCC. PHQ-9 actual 16/27. Buena adherencia a terapia. Sin ideación suicida activa."}]}]}',
   'Remisión a psiquiatría. Carlos Mendoza Pérez. Sintomatología depresiva con anhedonia persistente. PHQ-9 16/27.',
   'borrador', 'Dr. Pruebas Demo', '2026-05-14T15:00:00.000Z', '2026-05-14T15:20:00.000Z');

-- ─── INVOICES (15 más, distribuidos en el mes) ────────────────────────────
INSERT INTO invoices (id, workspace_id, patient_id, patient_name, professional, concept, amount, method, status, date, modality, paid_at, created_at) VALUES
  ('R-9-2026-0007', 9, 'P-9001', 'Camila Rondón Vélez',      'Dr. Pruebas Demo', 'Sesión individual',  180000, 'Transferencia', 'pagada',    '2026-05-12', 'individual', '2026-05-12T11:30:00.000Z', '2026-05-12T11:00:00.000Z'),
  ('R-9-2026-0008', 9, 'P-9002', 'Andrés Galeano Suárez',    'Dr. Pruebas Demo', 'Sesión individual',  180000, 'Nequi',         'pagada',    '2026-05-13', 'individual', '2026-05-13T12:30:00.000Z', '2026-05-13T12:00:00.000Z'),
  ('R-9-2026-0009', 9, 'P-9003', 'Valentina Soto Cárdenas',  'Dr. Pruebas Demo', 'Sesión de pareja',   220000, 'Transferencia', 'pagada',    '2026-05-08', 'pareja',     '2026-05-08T15:30:00.000Z', '2026-05-08T15:00:00.000Z'),
  ('R-9-2026-0010', 9, 'P-9004', 'Laura Restrepo Ruiz',      'Dr. Pruebas Demo', 'Sesión individual',  180000, 'PSE',           'pagada',    '2026-05-09', 'individual', '2026-05-09T11:30:00.000Z', '2026-05-09T11:00:00.000Z'),
  ('R-9-2026-0011', 9, 'P-9005', 'Carlos Mendoza Pérez',     'Dr. Pruebas Demo', 'Sesión individual',  180000, 'Efectivo',      'pagada',    '2026-05-06', 'individual', '2026-05-06T16:30:00.000Z', '2026-05-06T16:00:00.000Z'),
  ('R-9-2026-0012', 9, 'P-9001', 'Camila Rondón Vélez',      'Dr. Pruebas Demo', 'Sesión individual',  180000, 'Transferencia', 'pagada',    '2026-05-15', 'individual', '2026-05-15T15:30:00.000Z', '2026-05-15T15:00:00.000Z'),
  ('R-9-2026-0013', 9, 'P-9003', 'Valentina Soto Cárdenas',  'Dr. Pruebas Demo', 'Sesión familiar',    250000, 'Transferencia', 'pendiente', '2026-05-15', 'familiar',   NULL,                         '2026-05-15T17:00:00.000Z'),
  ('R-9-2026-0014', 9, 'P-9004', 'Laura Restrepo Ruiz',      'Dr. Pruebas Demo', 'Sesión online',      150000, 'Nequi',         'pagada',    '2026-05-14', 'tele',       '2026-05-14T19:00:00.000Z', '2026-05-14T18:30:00.000Z'),
  ('R-9-2026-0015', 9, 'P-9002', 'Andrés Galeano Suárez',    'Dr. Pruebas Demo', 'Sesión individual',  180000, 'PSE',           'pagada',    '2026-05-07', 'individual', '2026-05-07T16:00:00.000Z', '2026-05-07T15:30:00.000Z'),
  ('R-9-2026-0016', 9, 'P-9005', 'Carlos Mendoza Pérez',     'Dr. Pruebas Demo', 'Sesión individual',  180000, 'Transferencia', 'pendiente', '2026-05-16', 'individual', NULL,                         '2026-05-16T11:00:00.000Z'),
  ('R-9-2026-0017', 9, 'P-9001', 'Camila Rondón Vélez',      'Dr. Pruebas Demo', 'Sesión individual',  180000, 'Efectivo',      'pagada',    '2026-05-05', 'individual', '2026-05-05T10:30:00.000Z', '2026-05-05T10:00:00.000Z'),
  ('R-9-2026-0018', 9, 'P-9003', 'Valentina Soto Cárdenas',  'Dr. Pruebas Demo', 'Sesión individual',  180000, 'Nequi',         'pagada',    '2026-05-11', 'individual', '2026-05-11T17:00:00.000Z', '2026-05-11T16:30:00.000Z'),
  ('R-9-2026-0019', 9, 'P-9004', 'Laura Restrepo Ruiz',      'Dr. Pruebas Demo', 'Sesión individual',  180000, 'Transferencia', 'pagada',    '2026-05-02', 'individual', '2026-05-02T12:00:00.000Z', '2026-05-02T11:30:00.000Z'),
  ('R-9-2026-0020', 9, 'P-9002', 'Andrés Galeano Suárez',    'Dr. Pruebas Demo', 'Sesión individual',  180000, 'Transferencia', 'pendiente', '2026-05-16', 'individual', NULL,                         '2026-05-16T16:00:00.000Z'),
  ('R-9-2026-0021', 9, 'P-9001', 'Camila Rondón Vélez',      'Dr. Pruebas Demo', 'Sesión individual',  180000, 'Nequi',         'pagada',    '2026-05-03', 'individual', '2026-05-03T11:00:00.000Z', '2026-05-03T10:30:00.000Z');

-- ─── APPOINTMENTS (1–3 por día de 2026-05-17 a 2026-05-31, sin domingos) ─
-- Status 'confirmada' para citas futuras (>= hoy 17 may). Algunas 'pendiente'
-- para mostrar variedad. Mezcla de modalidades: individual (mayoría), tele,
-- pareja, familiar.
INSERT INTO appointments (workspace_id, professional_id, patient_id, patient_name, professional, date, time, duration_min, modality, status, notes) VALUES
  -- Sáb 17 may (hoy)
  (9, 10, 'P-9001', 'Camila Rondón Vélez',      'Dr. Pruebas Demo', '2026-05-17', '10:00', 50, 'individual', 'confirmada', ''),
  -- Lun 19 may
  (9, 10, 'P-9002', 'Andrés Galeano Suárez',    'Dr. Pruebas Demo', '2026-05-19', '09:00', 50, 'individual', 'confirmada', ''),
  (9, 10, 'P-9004', 'Laura Restrepo Ruiz',      'Dr. Pruebas Demo', '2026-05-19', '11:00', 50, 'tele',       'confirmada', 'Sesión online'),
  (9, 10, 'P-9005', 'Carlos Mendoza Pérez',     'Dr. Pruebas Demo', '2026-05-19', '15:00', 50, 'individual', 'confirmada', ''),
  -- Mar 20 may
  (9, 10, 'P-9001', 'Camila Rondón Vélez',      'Dr. Pruebas Demo', '2026-05-20', '10:00', 50, 'individual', 'confirmada', ''),
  (9, 10, 'P-9003', 'Valentina Soto Cárdenas',  'Dr. Pruebas Demo', '2026-05-20', '16:00', 60, 'pareja',     'confirmada', 'Sesión con pareja'),
  -- Mié 21 may
  (9, 10, 'P-9002', 'Andrés Galeano Suárez',    'Dr. Pruebas Demo', '2026-05-21', '09:00', 50, 'individual', 'confirmada', ''),
  (9, 10, 'P-9004', 'Laura Restrepo Ruiz',      'Dr. Pruebas Demo', '2026-05-21', '14:00', 50, 'individual', 'confirmada', ''),
  (9, 10, 'P-9005', 'Carlos Mendoza Pérez',     'Dr. Pruebas Demo', '2026-05-21', '17:00', 50, 'tele',       'pendiente',  'Pendiente confirmar'),
  -- Jue 22 may
  (9, 10, 'P-9001', 'Camila Rondón Vélez',      'Dr. Pruebas Demo', '2026-05-22', '10:00', 50, 'individual', 'confirmada', ''),
  (9, 10, 'P-9003', 'Valentina Soto Cárdenas',  'Dr. Pruebas Demo', '2026-05-22', '15:00', 60, 'familiar',   'confirmada', 'Sesión familiar'),
  -- Vie 23 may
  (9, 10, 'P-9002', 'Andrés Galeano Suárez',    'Dr. Pruebas Demo', '2026-05-23', '09:00', 50, 'individual', 'confirmada', ''),
  (9, 10, 'P-9004', 'Laura Restrepo Ruiz',      'Dr. Pruebas Demo', '2026-05-23', '11:00', 50, 'individual', 'confirmada', ''),
  (9, 10, 'P-9005', 'Carlos Mendoza Pérez',     'Dr. Pruebas Demo', '2026-05-23', '16:00', 50, 'individual', 'confirmada', ''),
  -- Sáb 24 may
  (9, 10, 'P-9001', 'Camila Rondón Vélez',      'Dr. Pruebas Demo', '2026-05-24', '09:00', 50, 'individual', 'confirmada', ''),
  (9, 10, 'P-9003', 'Valentina Soto Cárdenas',  'Dr. Pruebas Demo', '2026-05-24', '11:00', 50, 'individual', 'confirmada', ''),
  -- Lun 26 may
  (9, 10, 'P-9002', 'Andrés Galeano Suárez',    'Dr. Pruebas Demo', '2026-05-26', '09:00', 50, 'individual', 'confirmada', ''),
  (9, 10, 'P-9004', 'Laura Restrepo Ruiz',      'Dr. Pruebas Demo', '2026-05-26', '11:00', 50, 'tele',       'confirmada', 'Sesión online'),
  (9, 10, 'P-9005', 'Carlos Mendoza Pérez',     'Dr. Pruebas Demo', '2026-05-26', '15:00', 50, 'individual', 'confirmada', ''),
  -- Mar 27 may
  (9, 10, 'P-9001', 'Camila Rondón Vélez',      'Dr. Pruebas Demo', '2026-05-27', '10:00', 50, 'individual', 'confirmada', ''),
  (9, 10, 'P-9003', 'Valentina Soto Cárdenas',  'Dr. Pruebas Demo', '2026-05-27', '16:00', 60, 'pareja',     'confirmada', ''),
  -- Mié 28 may
  (9, 10, 'P-9002', 'Andrés Galeano Suárez',    'Dr. Pruebas Demo', '2026-05-28', '09:00', 50, 'individual', 'confirmada', ''),
  (9, 10, 'P-9004', 'Laura Restrepo Ruiz',      'Dr. Pruebas Demo', '2026-05-28', '14:00', 50, 'individual', 'pendiente',  ''),
  (9, 10, 'P-9005', 'Carlos Mendoza Pérez',     'Dr. Pruebas Demo', '2026-05-28', '17:00', 50, 'individual', 'confirmada', ''),
  -- Jue 29 may
  (9, 10, 'P-9001', 'Camila Rondón Vélez',      'Dr. Pruebas Demo', '2026-05-29', '10:00', 50, 'individual', 'confirmada', ''),
  (9, 10, 'P-9003', 'Valentina Soto Cárdenas',  'Dr. Pruebas Demo', '2026-05-29', '15:00', 60, 'familiar',   'confirmada', ''),
  -- Vie 30 may
  (9, 10, 'P-9002', 'Andrés Galeano Suárez',    'Dr. Pruebas Demo', '2026-05-30', '09:00', 50, 'individual', 'confirmada', ''),
  (9, 10, 'P-9004', 'Laura Restrepo Ruiz',      'Dr. Pruebas Demo', '2026-05-30', '11:00', 50, 'individual', 'confirmada', ''),
  (9, 10, 'P-9005', 'Carlos Mendoza Pérez',     'Dr. Pruebas Demo', '2026-05-30', '16:00', 50, 'tele',       'confirmada', 'Sesión online'),
  -- Sáb 31 may
  (9, 10, 'P-9001', 'Camila Rondón Vélez',      'Dr. Pruebas Demo', '2026-05-31', '10:00', 50, 'individual', 'confirmada', '');

COMMIT;

-- ─── Verificación final ───────────────────────────────────────────────────
SELECT 'bank_accounts' AS tabla, COUNT(*) AS total FROM bank_accounts WHERE workspace_id = 9
UNION ALL SELECT 'documents', COUNT(*) FROM documents WHERE workspace_id = 9
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices WHERE workspace_id = 9
UNION ALL SELECT 'appointments_may', COUNT(*) FROM appointments WHERE workspace_id = 9 AND date >= '2026-05-01' AND date <= '2026-05-31';
