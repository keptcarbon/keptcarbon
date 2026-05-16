-- ============================================================
-- KeptCarbon PostGIS Initialization
-- This script runs automatically when the container starts
-- for the first time (empty data volume).
-- ============================================================

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Verify PostGIS installation
SELECT PostGIS_Full_Version();
