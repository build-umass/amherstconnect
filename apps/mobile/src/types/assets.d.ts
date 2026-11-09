// Metro bundles .svg files as static assets (it's in the default assetExts),
// so require/import yields an asset id that expo-image can render.
declare module '*.svg' {
  const asset: number;
  export default asset;
}
