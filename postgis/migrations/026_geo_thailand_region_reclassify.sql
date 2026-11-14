BEGIN;
UPDATE geo_thailand SET region = 'E'
 WHERE p_code IN ('CHB','RAY','CTB','TRT','CCS','PCN','SKW');
UPDATE geo_thailand SET region = 'W'
 WHERE p_code IN ('TAK','RCB','KCB','PBR','PKK');
COMMIT;