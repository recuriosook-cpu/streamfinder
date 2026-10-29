-- ═══════════════════════════════════════════════════════════════════════════
-- GLYNBOX — Crons de la base cada hora y escalonados (2026-10-29)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El 28/10 (12:03–14:00 UTC) y el 29/10 (07:20–12:09 UTC) la base se saturó
-- (504 en /auth/v1/token) y hubo que reiniciarla. La instancia del plan Free
-- (Nano, 426 MB de RAM) vive con la memoria al límite y pagina a swap; el disco
-- queda estrangulado en su tope base (43 Mbps). Los precálculos del panel cada
-- 10 minutos ocupaban ~11.000 s de base por día, y el 29/10 la limpieza de las
-- 7:15 cayó cinco minutos antes del precálculo de las 7:20: se cortó por tiempo
-- y desde ahí ningún job pudo ni arrancar ("job startup timeout").
--
-- Ya aplicado en producción el 29/10 con cron.alter_job. Horarios en UTC; el
-- pico de tráfico va de 22 a 4 UTC (19 a 1 en Argentina) y el mínimo de 7 a 9.
--
--   :00  glynbox-push-dia1        (sin cambio: sólo un net.http_get)
--   :10  glynbox-panel-rapido     antes */10
--   :30  glynbox-panel-usuarios   antes 3-59/10
--   :45  glynbox-panel-lento      7:45, 10:45, 13:45, 16:45 y 19:45 (antes cada hora a las :07)
--   9:20 glynbox-eventos-limpiar  antes 7:15
--
-- El panel tolera esas edades sin ir en vivo: FRESCO_RAPIDO y FRESCO_LENTO en
-- lib/admin-precalculado.ts.

SELECT cron.alter_job(jobid, schedule := '10 * * * *')      FROM cron.job WHERE jobname = 'glynbox-panel-rapido';
SELECT cron.alter_job(jobid, schedule := '30 * * * *')      FROM cron.job WHERE jobname = 'glynbox-panel-usuarios';
SELECT cron.alter_job(jobid, schedule := '45 7-19/3 * * *') FROM cron.job WHERE jobname = 'glynbox-panel-lento';
SELECT cron.alter_job(jobid, schedule := '20 9 * * *')      FROM cron.job WHERE jobname = 'glynbox-eventos-limpiar';

-- Verificar:
--   SELECT jobname, schedule FROM cron.job ORDER BY jobname;
