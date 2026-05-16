declare module "shapefile" {
  export type ShapefileSource = {
    read(): Promise<{ done: true } | { done: false; value: GeoJSON.Feature }>;
  };
  export function open(
    shp: ArrayBuffer | Uint8Array | string,
    dbf?: ArrayBuffer | Uint8Array,
  ): Promise<ShapefileSource>;
}
