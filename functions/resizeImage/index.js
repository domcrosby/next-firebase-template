const functions = require("firebase-functions");
const { Storage } = require("@google-cloud/storage");
const path = require("path");
const sharp = require("sharp");
const os = require("os");
const fs = require("fs");

const gcs = new Storage();

module.exports = functions
  .runWith({
    // Ensure the function has enough memory and time
    // to process large files
    timeoutSeconds: 540,
    memory: "1GB",
  })
  .storage.object()
  .onFinalize(async (object) => {
    // The Storage bucket that contains the file.
    const fileBucket = object.bucket;
    const filePath = object.name; // File path in the bucket.
    const contentType = object.contentType; // File content type.

    // Exit if this is triggered on a file that is not an image.
    if (!contentType.startsWith("image/")) {
      return null;
    }

    // Get the file name.
    const fileName = path.basename(filePath);
    const base = path.parse(fileName).name;

    // Exit if the image is already a thumbnail.
    if (!filePath.startsWith("wineries/default")) {
      return null;
    }

    // Download file from bucket.
    const bucket = gcs.bucket(fileBucket);
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, fileName);
    const metadata = {
      contentType: contentType,
    };

    const sizes = [
      16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048,
      3840,
    ];

    // Create write stream for uploading thumbnail

    await Promise.all(
      sizes.map(async (size) => {
        try {
          await bucket.file(filePath).download({ destination: tempFile });
          functions.logger.log("Image downloaded locally to", tempFile);
          const tempWrite = path.join(tempDir, `${base}--${size}.jpg`);
          const writeFile = path.join(filePath, `../../${size}`, fileName);
          await sharp(tempFile)
            .resize(size)
            .toFormat("jpeg", { mozjpeg: true })
            .toFile(tempWrite);
          functions.logger.log(size, " size created at ", writeFile);
          await bucket.upload(tempWrite, {
            destination: writeFile,
            metadata: metadata,
          });
          await fs.unlinkSync(tempWrite);
        } catch (error) {
          functions.logger.error(error);
        }
      })
    );

    return fs.unlinkSync(tempFile);
  });
