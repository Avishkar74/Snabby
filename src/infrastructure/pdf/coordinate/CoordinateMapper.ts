export interface CoordinateMapResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class CoordinateMapper {
  /**
   * Maps top-left image coordinates to bottom-left PDF coordinates.
   * 
   * @param x_img Word X in image space (pixels)
   * @param y_img Word Y in image space (pixels, top-left origin)
   * @param w_img Word width in image space (pixels)
   * @param h_img Word height in image space (pixels)
   * @param imageHeight Total height of screenshot image (pixels)
   * @param imgLeft Drawn image left offset on PDF page (points)
   * @param imgBottom Drawn image bottom offset on PDF page (points)
   * @param scale Contain scaling factor
   */
  public static map(
    x_img: number,
    y_img: number,
    w_img: number,
    h_img: number,
    imageHeight: number,
    imgLeft: number,
    imgBottom: number,
    scale: number
  ): CoordinateMapResult {
    const width = w_img * scale;
    const height = h_img * scale;
    const x = imgLeft + (x_img * scale);
    const y = imgBottom + (imageHeight - y_img - h_img) * scale;
    return { x, y, width, height };
  }
}
