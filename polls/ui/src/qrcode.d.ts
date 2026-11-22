// The part of `qrcode` (MIT) that the poll uses; the package ships no types.
declare module 'qrcode' {
  interface Options {
    margin?: number
    width?: number
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
    color?: { dark?: string; light?: string }
  }
  const QRCode: {
    toString(text: string, opts?: Options & { type?: 'svg' | 'utf8' }): Promise<string>
    toDataURL(text: string, opts?: Options): Promise<string>
  }
  export default QRCode
}
