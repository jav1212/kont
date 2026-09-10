declare module "jsbarcode" {
    interface JsBarcodeOptions {
        format?: "CODE128";
        displayValue?: boolean;
        height?: number;
        margin?: number;
        width?: number;
        background?: string;
        lineColor?: string;
    }

    /** Draws a supported barcode symbology into an SVG element. */
    function JsBarcode(element: SVGSVGElement, value: string, options?: JsBarcodeOptions): void;
    export default JsBarcode;
}
