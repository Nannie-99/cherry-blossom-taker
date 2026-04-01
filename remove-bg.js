const { Jimp, intToRGBA, rgbaToInt } = require("jimp");
const path = require("path");
const fs = require("fs");

const SRC_DIR = "C:/Users/허난경/.gemini/antigravity/brain/e634afe2-08b4-4f57-9ecc-6116b7f81322";
const DEST_DIR = "c:/Users/허난경/Desktop/Project/03-cherry-blossom-taker/src/assets";

async function processImage(filename) {
  try {
    const fullPath = path.join(SRC_DIR, filename);
    const image = await Jimp.read(fullPath);
    
    // Resize image to something smaller like 150px for petals and 300px for full blossoms/butterflies to save memory and physics performance
    const isPetal = filename.includes("petal");
    image.resize({ w: isPetal ? 100 : 400 });

    const width = image.bitmap.width;
    const height = image.bitmap.height;

    // Tolerance for "white"
    const tolerance = 40; // 255 - 40 = 215

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const hex = image.getPixelColor(x, y);
        const rgba = intToRGBA(hex);
        
        // If color is close to white, make it transparent
        if (rgba.r > 255 - tolerance && rgba.g > 255 - tolerance && rgba.b > 255 - tolerance) {
          image.setPixelColor(rgbaToInt(rgba.r, rgba.g, rgba.b, 0), x, y);
        } else {
             // For edge smoothing - partial transparency if it's close to tolerance boundary (optional)
             // Simple version is just keeping edges that are slightly colored.
        }
      }
    }
    
    // Remove "17749..." suffix from the name for a cleaner filename in assets
    const cleanName = filename.replace(/_\d+\.png$/, '.png');
    const destPath = path.join(DEST_DIR, cleanName);
    
    await image.write(destPath);
    console.log(`Processed: ${cleanName}`);
  } catch (err) {
    console.error(`Error processing ${filename}:`, err);
  }
}

async function main() {
  const files = fs.readdirSync(SRC_DIR);
  // Find all generated images
  const images = files.filter(f => f.endsWith('.png') && f.includes('_crown_'));
  
  console.log(`Found ${images.length} images to process...`);
  for (const img of images) {
    await processImage(img);
  }
}

main();
