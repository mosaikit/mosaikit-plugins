declare module '*?url' {
  const url: string
  export default url
}

declare module 'pdfjs-dist/legacy/build/pdf.min.mjs' {
  export * from 'pdfjs-dist'
}
