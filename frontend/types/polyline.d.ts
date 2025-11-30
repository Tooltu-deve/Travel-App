declare module '@mapbox/polyline' {
  interface Polyline {
    encode(coordinates: number[][], precision?: number): string;
    decode(encoded: string, precision?: number): number[][];
  }

  const polyline: Polyline;
  export default polyline;
}

