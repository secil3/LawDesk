const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const multer = require("multer");

const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_FILE_TYPES = new Map([
  [".pdf", new Set(["application/pdf"])],
  [".doc", new Set(["application/msword"])],
  [
    ".docx",
    new Set([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
  ],
  [".xls", new Set(["application/vnd.ms-excel"])],
  [
    ".xlsx",
    new Set([
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]),
  ],
  [".jpg", new Set(["image/jpeg"])],
  [".jpeg", new Set(["image/jpeg"])],
  [".png", new Set(["image/png"])],
]);

const ALLOWED_EXTENSIONS = [...ALLOWED_FILE_TYPES.keys()];

const storageRoot = path.resolve(
  process.env.ATTACHMENT_STORAGE_DIR ||
    path.join(__dirname, "../storage/task-attachments"),
);

const createUploadError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const extensionFor = (fileName) =>
  path.extname(String(fileName || "")).toLowerCase();

const isAllowedFile = (file) => {
  const extension = extensionFor(file.originalname);
  const allowedMimeTypes = ALLOWED_FILE_TYPES.get(extension);

  return Boolean(
    allowedMimeTypes && allowedMimeTypes.has(file.mimetype),
  );
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    fs.mkdir(storageRoot, { recursive: true })
      .then(() => callback(null, storageRoot))
      .catch((error) => callback(error));
  },
  filename: (_req, file, callback) => {
    callback(
      null,
      `${crypto.randomUUID()}${extensionFor(file.originalname)}`,
    );
  },
});

const uploader = multer({
  storage,
  limits: {
    fieldNameSize: 50,
    fieldNestingDepth: 0,
    fields: 0,
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
    headerPairs: 100,
    // Busboy emits partsLimit as soon as the configured count is reached.
    // Two therefore permits exactly one file part and rejects a second part.
    parts: 2,
  },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedFile(file)) {
      callback(
        createUploadError(
          "Yalnızca PDF, Word, Excel, JPG ve PNG dosyaları yüklenebilir",
        ),
      );
      return;
    }

    callback(null, true);
  },
});

const isInsideStorageRoot = (filePath) => {
  const resolvedPath = path.resolve(filePath);
  return (
    resolvedPath === storageRoot ||
    resolvedPath.startsWith(`${storageRoot}${path.sep}`)
  );
};

const removeStoredFile = async (filePath) => {
  if (!filePath || !isInsideStorageRoot(filePath)) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
};

const cleanupRequestFile = async (req) => {
  if (req.file?.path) {
    await removeStoredFile(req.file.path);
  }
};

const uploadSingleAttachment = (req, res, next) => {
  uploader.single("file")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    cleanupRequestFile(req)
      .catch((cleanupError) => {
        console.error("Geçersiz ek dosyası temizlenemedi", cleanupError);
      })
      .finally(() => {
        if (error instanceof multer.MulterError) {
          if (error.code === "LIMIT_FILE_SIZE") {
            res.status(413).json({
              error: `Dosya boyutu en fazla ${MAX_FILE_SIZE_MB} MB olabilir`,
            });
            return;
          }

          res.status(400).json({
            error: "Yalnızca file alanında tek bir dosya gönderilebilir",
          });
          return;
        }

        res.status(error.statusCode || 400).json({
          error: error.message || "Dosya yüklenemedi",
        });
      });
  });
};

const startsWithBytes = (buffer, expected) =>
  expected.every((value, index) => buffer[index] === value);

const hasValidSignature = (buffer, extension) => {
  if (extension === ".pdf") {
    return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  }

  if (extension === ".png") {
    return startsWithBytes(
      buffer,
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );
  }

  if ([".jpg", ".jpeg"].includes(extension)) {
    return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
  }

  if ([".doc", ".xls"].includes(extension)) {
    return startsWithBytes(
      buffer,
      [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    );
  }

  if ([".docx", ".xlsx"].includes(extension)) {
    return (
      startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
      startsWithBytes(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
      startsWithBytes(buffer, [0x50, 0x4b, 0x07, 0x08])
    );
  }

  return false;
};

const verifyStoredFileSignature = async (filePath, originalName) => {
  const fileHandle = await fs.open(filePath, "r");
  const header = Buffer.alloc(8);

  try {
    const { bytesRead } = await fileHandle.read(header, 0, 8, 0);
    return hasValidSignature(
      header.subarray(0, bytesRead),
      extensionFor(originalName),
    );
  } finally {
    await fileHandle.close();
  }
};

const normalizeOriginalName = (fileName) => {
  const baseName = path.basename(String(fileName || "dosya"));
  const withoutControls = baseName.replace(/[\u0000-\u001f\u007f]/g, "");
  return (withoutControls || "dosya").slice(0, 255);
};

const resolveStoredFile = (storedName) => {
  if (
    typeof storedName !== "string" ||
    !storedName ||
    path.basename(storedName) !== storedName
  ) {
    throw createUploadError("Ek dosyası bulunamadı", 404);
  }

  const resolvedPath = path.resolve(storageRoot, storedName);

  if (!isInsideStorageRoot(resolvedPath)) {
    throw createUploadError("Ek dosyası bulunamadı", 404);
  }

  return resolvedPath;
};

module.exports = {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_MB,
  normalizeOriginalName,
  removeStoredFile,
  resolveStoredFile,
  storageRoot,
  uploadSingleAttachment,
  verifyStoredFileSignature,
};
