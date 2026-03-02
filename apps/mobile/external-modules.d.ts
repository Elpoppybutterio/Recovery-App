declare module "expo-location" {
  export const Accuracy: {
    Balanced: number;
  };
  export function getForegroundPermissionsAsync(): Promise<{ granted: boolean }>;
  export function requestForegroundPermissionsAsync(): Promise<{ granted: boolean }>;
  export function getCurrentPositionAsync(options: { accuracy: number }): Promise<{
    coords: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
    };
  }>;
  export function geocodeAsync(address: string): Promise<
    Array<{
      latitude: number;
      longitude: number;
    }>
  >;
}

declare module "react-native-maps" {
  import type { ComponentType } from "react";

  export type Region = {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };

  const MapView: ComponentType<Record<string, unknown>>;
  export const Marker: ComponentType<Record<string, unknown>>;
  export default MapView;
}

declare module "*.png" {
  const value: number;
  export default value;
}
