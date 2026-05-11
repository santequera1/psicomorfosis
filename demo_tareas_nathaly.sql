-- ---------------------------------------------------------------
-- Tareas demo para Nathaly Ferrer (workspace 1, professional 1).
-- Contenido para video demostrativo. Mezcla:
--   • 6 propias (sin paciente, visibility=private)
--   • 6 con paciente — algunas 'team' (paciente las ve en su portal)
--     y otras 'private' (notas internas sobre el paciente)
-- Estados distribuidos para que el kanban se vea poblado:
--   TODO=6, IN_PROGRESS=3, IN_REVIEW=1, DONE=2
-- ---------------------------------------------------------------

BEGIN;

-- =====================================================================
-- Tareas propias de Nathaly (sin paciente)
-- =====================================================================

INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, visibility, due_date, position)
VALUES (1,
  'Preparar plan terapéutico de Valentina',
  'Revisar notas de sesión 3 y diseñar 4 actividades concretas para trabajar regulación emocional la próxima semana.',
  'Sesión clínica', 'IN_PROGRESS', 'HIGH', 1, 1, 'private', '2026-05-14', 0);

INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, visibility, due_date, position)
VALUES (1,
  'Estudiar guía TCC en TLP — caps. 3 y 4',
  'Avanzar con la lectura del manual de Linehan que dejé pendiente. Tomar apuntes para aplicar con dos pacientes.',
  'Capacitación', 'TODO', 'MEDIUM', 1, 1, 'private', '2026-05-18', 1);

INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, visibility, due_date, position)
VALUES (1,
  'Renovar póliza de responsabilidad civil',
  'Llamar al asesor de la aseguradora antes del vencimiento para no quedar descubierta.',
  'Administrativo', 'TODO', 'MEDIUM', 1, 1, 'private', '2026-05-22', 2);

INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, visibility, completed_at, position)
VALUES (1,
  'Pausa de autocuidado — caminata 20 min',
  'Salir a la 1pm sin celular. Si llueve: estiramiento + respiración 4-7-8.',
  'Auto-cuidado', 'DONE', 'LOW', 1, 1, 'private', '2026-05-10 17:30:00', 0);

INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, visibility, due_date, position)
VALUES (1,
  'Cierre contable y revisión de pagos del mes',
  'Verificar recibos emitidos, cuadrar saldos pendientes y exportar reporte para el contador.',
  'Reporte', 'TODO', 'MEDIUM', 1, 1, 'private', '2026-05-31', 3);

INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, visibility, due_date, position)
VALUES (1,
  'Enviar invitaciones a colegas para beta',
  'Lista: 6 psicólogas del grupo de supervisión + 2 amigos clínicos. Plantilla en notas.',
  'Administrativo', 'TODO', 'URGENT', 1, 1, 'private', '2026-05-11', 4);

-- =====================================================================
-- Tareas con paciente (algunas 'team' — el paciente las ve)
-- =====================================================================

INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, patient_id, visibility, due_date, position)
VALUES (1,
  'Firmar consentimiento informado',
  'Hola Cami, te dejé el consentimiento en la sección Documentos del portal. Léelo con tiempo y firma cuando estés tranquila.',
  'Documentación', 'IN_REVIEW', 'HIGH', 1, 1, 'P-0101', 'team', '2026-05-13', 0);

INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, patient_id, visibility, due_date, position)
VALUES (1,
  'Aplicar Inventario MCMI-II antes de la sesión',
  'Hola Andrés, te asigné el MCMI-II en la sección Tests. Tómate tu tiempo — son ~30 minutos. Lo revisamos juntos en la próxima cita.',
  'Tests', 'TODO', 'HIGH', 1, 1, 'P-0102', 'team', '2026-05-14', 5);

INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, patient_id, visibility, due_date, position)
VALUES (1,
  'Registro semanal de emociones',
  'Esta semana, anota cada día una emoción intensa: la situación, qué pensaste, qué sentiste en el cuerpo y qué hiciste con esa emoción.',
  'Sesión clínica', 'IN_PROGRESS', 'MEDIUM', 1, 1, 'P-0103', 'team', '2026-05-17', 1);

INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, patient_id, visibility, due_date, position)
VALUES (1,
  'Llamada de seguimiento — Marta',
  'Confirmar asistencia a la cita del jueves y preguntar cómo le ha ido con el ejercicio de respiración.',
  'Llamada / Seguimiento', 'TODO', 'MEDIUM', 1, 1, 'P-0105', 'private', '2026-05-12', 5);

INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, patient_id, visibility, due_date, position)
VALUES (1,
  'Práctica de mindfulness — 10 min diarios',
  'Val, dedica 10 minutos cada mañana a la práctica que vimos. Si un día no puedes, retoma al siguiente — no te exijas perfección.',
  'Sesión clínica', 'IN_PROGRESS', 'MEDIUM', 1, 1, 'P-0104', 'team', '2026-05-19', 2);

INSERT INTO tareas (workspace_id, title, description, type, status, priority, assignee_id, creator_id, patient_id, visibility, completed_at, position)
VALUES (1,
  'Pasar a limpio notas de sesión — Cami',
  'Sesión 5: trabajamos la creencia "no merezco descansar". Pasar al apartado de evolución del caso.',
  'Documentación', 'DONE', 'MEDIUM', 1, 1, 'P-0101', 'private', '2026-05-10 19:45:00', 1);

COMMIT;

SELECT 'Tareas insertadas: ' || COUNT(*) FROM tareas WHERE workspace_id = 1;
SELECT status, COUNT(*) FROM tareas WHERE workspace_id = 1 GROUP BY status;
