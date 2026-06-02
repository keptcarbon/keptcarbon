# KeptCarbon Platform

Carbon stock estimation system for Thai rubber plantations.

## Services

| Service | URL | Description |
|---|---|---|
| Next.js frontend | http://localhost:3000 | Web app + Next.js API routes |
| FastAPI backend | http://localhost:8000 | Carbon estimation engine |
| PostGIS | localhost:4533 | Spatial database |

## API Reference

See [api.http](api.http) for runnable request examples.

---

### Backend — FastAPI (`http://localhost:8000`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `POST` | `/api/v1/estimate` | Carbon stock estimation for one or more rubber plantation polygons |
| `POST` | `/api/v1/plantation-info` | Province detection + land use classification for a drawn polygon |

#### `POST /api/v1/estimate` — key fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique identifier from the frontend map |
| `geometry` | GeoJSON | yes | Polygon or MultiPolygon (EPSG:4326) |
| `project_type` | string | yes | e.g. `"replanting"`, `"existing"` |
| `year_of_planting` | int | no | CE year — extracted from raster if null |
| `rubber_clone` | string | no | `"RRIM 600"` (default) or `"RRIT 251"` |
| `tree_count` | int | no | User-defined count — calculated from area + spacing if null |
| `spacing_system` | string | no | `"2.5x8"` (default), `"3x7"`, `"3x8"`, `"2.5x7"`, `"3x6"` |
| `selected_lu_classes` | string | yes | List of LU CODE `"A302"` (default), `"A..."`, `"M"`, `"F"`, `"U"`, `"W"` |

#### `POST /api/v1/estimate` — response

```json
[
  {
    "polygon_id": "string",
    "status": { "status": "success|error", "status_code": "S01|E01…", "message": "string" },
    "carbon_profile": [
      {
        "year": 2026, 
        "year_at": 0, 
        "age": 16, 
        "stock": {
          "value": 4027.4685,
          "ci": 232.0193,
          "ci_lower": 3795.4493,
          "ci_upper": 4259.4878
        },
        "gain":{
          "value": 0,
          "ci": 0,
          "ci_lower": 0,
          "ci_upper": 0
        }
      },
      {
        "year": 2027,
        "year_at": 1,
        "age": 17,
        "stocks": {
            "value": 4256.2453,
            "ci": 249.6937,
            "ci_lower": 4006.5585,
            "ci_upper": 4505.9459
        },
        "gain": {
            "value": 228.7768,
            "ci": 17.6745,
            "ci_lower": 211.1092,
            "ci_upper": 246.4581
        }
      }
    ],
    "estimated_parameters": {
      "year_of_planting": {
          "value": 2010,
          "note": [
              "2026 (30.8%)",
              "2025 (20.2%)",
              "2024 (9.7%)",
              "2019 (9.6%)"
          ],
          "source": "user input"
      },
      "rubber_clone": {
          "value": "RRIM 600",
          "note": "default",
          "source": "user input"
      },
      "tree_count": {
          "value": 8040,
          "note": null,
          "source": "calculated for area and spacing system"
      },
      "spacing_system": {
          "value": "2.5x8 (default)",
          "note": null,
          "source": "default value applied"
      }
    }
  }
]
```

#### `POST /api/v1/plantation-info` — request fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique identifier |
| `geometry` | GeoJSON | yes | Polygon or MultiPolygon (EPSG:4326) |
| `project_type` | string | yes | e.g. `"replanting"`, `"existing"` |
| `output_crs` | string | no | CRS for returned geometry. `"EPSG:4326"` (default) = WGS84, `"EPSG:32647"` = UTM Zone 47N (metres) |

#### `POST /api/v1/plantation-info` — response

```json
{
  "polygon_id": "string",
  "province_code": "RAY | null",
  "geometry": { "type": "Polygon", "coordinates": [[]] },
  "area_m2": 12345.67,
  "status": { "status": "success|error", "status_code": "S01|E01…", "message": "string" },
  "lu_polygon": [
    {
      "lu_class": "A302",
      "lu_class_desc_th": "สวนยางพารา",
      "lu_class_desc_en": "Rubber Plantation",
      "geometry": { "type": "Polygon", "coordinates": [[]] },
      "area_m2": 8000.0,
      "area_percent": 64.8
    }
  ]
}
```

`lu_class` values: `A302` rubber, `F` forest, `U` urban/built-up, `W` water body, `M` miscellaneous, `OTHER`

Supported provinces: `RAY` (Rayong)

---

### Next.js API Routes (`http://localhost:3000`)

Authentication uses an HttpOnly JWT cookie (`auth_token`). Log in first via `/api/auth/login` or `/api/auth/register`, then include the cookie on subsequent requests.

#### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | Create a new local account (`email`, `password`, `fullname`, `phone?`) |
| `POST` | `/api/auth/login` | — | Login with email or username (`login`, `password`) — sets JWT cookie |
| `GET` | `/api/auth/me` | cookie | Return the current authenticated user |
| `POST` | `/api/auth/logout` | cookie | Clear the JWT cookie |
| `GET` | `/api/auth/line` | — | Redirect to LINE OAuth (browser only) |
| `GET` | `/api/auth/google` | — | Redirect to Google OAuth (browser only) |
| `GET` | `/api/auth/google/callback` | — | Google OAuth callback — exchanges code for token, upserts user, sets JWT cookie, redirects to `/` |

#### User

| Method | Path | Auth | Description |
|---|---|---|---|
| `PUT` | `/api/profile/update` | cookie | Update `firstname`, `lastname`, `phone` for the current user |

#### Dashboard

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/dashboard/stats` | cookie | Aggregate stats, age chart data, map plots, bounding box |

#### Parcels

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/parcels/search` | cookie | Find A302 rubber parcels intersecting a drawn polygon (max 2000, clipped to boundary) |

`relation` param: `"intersects"` (default), `"touches"`, `"contains"`

#### Admin — Users (`role=admin` required)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/users` | List all users |
| `PATCH` | `/api/admin/users` | Update `role`, `fullname`, or `phone` for a user |
| `DELETE` | `/api/admin/users` | Delete a user by `id` |

#### Admin — Parcels (`role=admin` required)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/parcels` | List `rubber_plots` rows with filters: `province`, `amphoe_t`, `tambon`, `grow_year_min`, `grow_year_max`, `limit`, `offset` |
| `GET` | `/api/admin/parcels/filters` | Distinct province list; add `?province=X` for district list |
| `PATCH` | `/api/admin/rubber-age` | Bulk-update `rubber_age`, `gee_plant_year`, `gee_age`, `gee_confidence` for plot IDs |

#### Admin — Rubber Age Detection (`role=admin` required)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/rubber-age/bfast` | Run BFAST-based planting-year detection on a set of plots via the GEE service |
| `POST` | `/api/rubber-age/bfast-raster/generate` | Generate a rubber-age raster tile over a region using the GEE service |
| `POST` | `/api/rubber-age/from-raster` | Extract per-plot rubber age from a pre-generated raster and bulk-write results |

---

## Environment Variables

### Next.js (`nextjs/.env.local`)

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID from [Google Cloud Console](https://console.cloud.google.com/) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret |
| `GOOGLE_CALLBACK_URL` | Redirect URI registered in Google Cloud Console (default: `http://localhost:3000/api/auth/google/callback`) |

#### Google OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add `http://localhost:3000/api/auth/google/callback` to **Authorised redirect URIs** (add your production URL too).
4. Copy the client ID and secret into `nextjs/.env.local`.

#### Google OAuth flow

```
Browser → GET /api/auth/google
       ← 302 redirect to accounts.google.com (state cookie set)

Google → GET /api/auth/google/callback?code=…&state=…
       ← exchanges code for access token
       ← fetches profile (email, name, picture) from Google
       ← upserts user row (provider = 'google', conflict on google_user_id)
       ← sets auth_token JWT cookie (7 days, HttpOnly)
       ← 302 redirect to /
```

Error redirects go to `/?google_error=<reason>` — possible values: `cancelled`, `missing_params`, `state_mismatch`, `token_failed`, `profile_failed`, `server_error`.

---

## Quick Start

```bash
# Start all services
docker compose up -d

# Backend logs
docker logs keptcarbon-backend-1 -f

# Run backend tests
docker exec keptcarbon-backend-1 pytest tests/ -v

# Run frontend tests
cd nextjs && npm test
```