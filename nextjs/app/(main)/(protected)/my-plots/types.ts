import type { BarPoint } from "@/app/components/organisms/ParcelResultsPanel/CarbonBarChart";

export type SavedPlot = {
  id: string;
  dbProjectId?: number;
  name: string;
  areaRai: number;
  selectedAreaRai?: number;
  carbonTotal: number;
  rubberAge: number;
  plantYearBE?: number;
  trees?: number;
  variety?: string;
  spacing?: string;
  userId?: string;
  ownerName?: string;
  province?: string;
  date: string;
  geojson?: unknown;
  boundaryGeojson?: unknown;

  carbonProfile?: BarPoint[];
  plantStatus?: string;
  processed?: boolean;
  luChecked?: Record<string, boolean>;
  backendData?: {
    plantYearBE?: number;
    age?: number;
    variety?: string;
    spacing?: string;
    trees?: number;
    ep?: any;
    form?: any;
    lu_polygon?: GeoJSON.Feature[];
  };
};