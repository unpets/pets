use super::{AssetStore, ExportResult, invalid};
use image::{
    DynamicImage, ImageEncoder, ImageReader, RgbaImage,
    codecs::png::{CompressionType, FilterType, PngEncoder},
};
use std::{io::Cursor, path::Path};

pub fn load(path: &Path, size: [u32; 2], store: &dyn AssetStore) -> ExportResult<RgbaImage> {
    let mut reader = ImageReader::new(Cursor::new(store.read(path)?)).with_guessed_format()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(size[0]);
    limits.max_image_height = Some(size[1]);
    reader.limits(limits);
    match reader.decode()? {
        DynamicImage::ImageRgba8(image) if image.dimensions() == (size[0], size[1]) => Ok(image),
        _ => Err(invalid(format!(
            "Expected RGBA frame with dimensions {size:?}: {}",
            path.display()
        ))),
    }
}

pub fn save(path: &Path, image: &RgbaImage, store: &mut dyn AssetStore) -> ExportResult<()> {
    let mut writer = Vec::new();
    PngEncoder::new_with_quality(&mut writer, CompressionType::Best, FilterType::Adaptive)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            image::ExtendedColorType::Rgba8,
        )?;
    store.write(path, &writer)?;
    Ok(())
}

pub fn bounds(image: &RgbaImage) -> Option<[u32; 4]> {
    let mut result = [image.width(), image.height(), 0, 0];
    for (x, y, pixel) in image.enumerate_pixels() {
        if pixel[3] == 0 {
            continue;
        }
        result[0] = result[0].min(x);
        result[1] = result[1].min(y);
        result[2] = result[2].max(x + 1);
        result[3] = result[3].max(y + 1);
    }
    (result[2] > 0).then_some(result)
}
